/**
 * renderer.ts
 *
 * Converts an array of Block objects into a Figma FrameNode containing styled
 * text, code blocks, tables, images, and separators.
 *
 * This module owns all Figma node creation for block-level content.
 * It does NOT parse Markdown — that is parser.ts's job.
 * It does NOT define text styles — that is styles.ts's job.
 * It does NOT create table substructure — that is tables.ts's job.
 *
 * Public API:
 *   renderBlocks(name, blocks, settings, targetNode?) — async: returns RenderResult { frame, imageFailures }
 */

import type { Block } from './parser';
import type { PluginSettings } from './settings';
import { resolvedFrameWidth } from './settings';
import type { marked } from 'marked';
import { STYLE_NAMES, DEFAULT_STYLES, loadFont, getOrCreateTextStyle, applyInlineStyles, initializeStyles } from './styles';
import { createTableFrame } from './tables';
import { hexToRgb, errorMessage } from './utils';

/** Creates a typed synthetic text token for use as a prefix in list items. */
function syntheticTextToken(text: string): marked.Tokens.Text {
    return { type: 'text', raw: text, text } as marked.Tokens.Text;
}

/** Result returned by renderBlocks with the rendered frame and non-fatal warning counts. */
export interface RenderResult {
    frame: FrameNode;
    /** Number of image blocks that failed to load (placeholder shown instead). */
    imageFailures: number;
}

// ─── Callout Colors ──────────────────────────────────────────────────────────

function calloutColor(hex: string): { border: RGB; bg: RGB; text: RGB } {
    const c = hexToRgb(hex);
    return { border: c, bg: c, text: c };
}

const CALLOUT_COLORS: Record<string, { border: RGB; bg: RGB; text: RGB }> = {
    note:      calloutColor('#0969DA'),
    tip:       calloutColor('#1A7F37'),
    important: calloutColor('#8250DF'),
    warning:   calloutColor('#9A6700'),
    caution:   calloutColor('#CF222E'),
};

const CALLOUT_LABELS: Record<string, string> = {
    note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution',
};

// ─── List Constants ──────────────────────────────────────────────────────────

const BULLETS = ['• ', '◦ ', '– ', '· '] as const;
const INDENT_PER_DEPTH = 20;
const CHECKBOX_CHECKED: SolidPaint = { type: 'SOLID', color: { r: 0.2, g: 0.6, b: 0.2 } };
const CHECKBOX_UNCHECKED_FILL: SolidPaint = { type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } };
const CHECKBOX_UNCHECKED_STROKE: SolidPaint = { type: 'SOLID', color: { r: 0.7, g: 0.7, b: 0.7 } };

/**
 * Returns the X coordinate at which a new frame should be placed so it does not
 * overlap existing page content. Finds the rightmost edge of all top-level page nodes
 * and adds a gap.
 *
 * IMPORTANT: Call this BEFORE figma.createFrame() — createFrame immediately appends
 * the new frame to figma.currentPage.children, which would inflate the result.
 *
 * Returns 0 if the page is empty (blank canvas case).
 * The result is always ≥ gap: rightEdge is clamped to 0 so a new frame is never
 * placed left of the canvas origin even if all existing content has negative X.
 *
 * @internal Exported for testability.
 */
export function computeNewFrameX(gap: number): number {
    const children = figma.currentPage.children;
    if (children.length === 0) return 0;
    const rightEdge = children.reduce((max, node) => {
        const right = node.x + node.width;
        return right > max ? right : max;
    }, -Infinity);
    // Clamp to 0: never place a new frame to the left of the canvas origin,
    // even if all existing content is at negative X coordinates.
    return Math.max(rightEdge, 0) + gap;
}

// ─── Private Helpers ──────────────────────────────────────────────────────────

/**
 * Creates a Figma image node from a parsed image block.
 * If the image URL cannot be fetched, returns a styled placeholder frame instead.
 *
 * Uses settings.frameWidth to constrain the maximum image width.
 *
 * @param block    - A Block with type==='image', imageUrl, and optional imageAlt
 * @param settings - Plugin settings (provides frameWidth for max-width constraint)
 * @returns A RectangleNode with the image fill, or a FrameNode placeholder on error
 * @throws {Error} If block.imageUrl is missing — no placeholder is returned in this case
 */
async function createImageNode(block: Block, settings: PluginSettings): Promise<RectangleNode | FrameNode> {
    if (!block.imageUrl) {
        throw new Error('Invalid image block');
    }

    try {
        const imageRect = figma.createRectangle();
        imageRect.name = block.imageAlt || 'Image';
        imageRect.layoutAlign = 'STRETCH';

        // Set default size (will be adjusted after image loads)
        imageRect.resize(600, 400);

        // Fetch the image asynchronously
        const image = await figma.createImageAsync(block.imageUrl);

        // Get image dimensions
        const imageSize = await image.getSizeAsync();

        // Scale image to fit max width while maintaining aspect ratio
        const maxWidth = resolvedFrameWidth(settings);
        if (imageSize.width > maxWidth) {
            const scale = maxWidth / imageSize.width;
            imageRect.resize(maxWidth, imageSize.height * scale);
        } else {
            imageRect.resize(imageSize.width, imageSize.height);
        }

        // Apply image fill
        imageRect.fills = [
            {
                type: 'IMAGE',
                imageHash: image.hash,
                scaleMode: 'FILL'
            }
        ];

        return imageRect;
    } catch (error) {
        // If image loading fails, create a placeholder
        console.error(`Failed to load image: ${block.imageUrl}`, error);

        const placeholderFrame = figma.createFrame();
        placeholderFrame.name = `Image Error: ${block.imageAlt || 'Unknown'}`;
        placeholderFrame.layoutMode = 'VERTICAL';
        placeholderFrame.primaryAxisAlignItems = 'CENTER';
        placeholderFrame.counterAxisAlignItems = 'CENTER';
        placeholderFrame.paddingTop = 40;
        placeholderFrame.paddingBottom = 40;
        placeholderFrame.paddingLeft = 40;
        placeholderFrame.paddingRight = 40;
        placeholderFrame.fills = [{ type: 'SOLID', color: { r: 0.95, g: 0.95, b: 0.95 } }];
        placeholderFrame.strokes = [{ type: 'SOLID', color: { r: 0.8, g: 0.2, b: 0.2 } }];
        placeholderFrame.strokeWeight = 2;
        placeholderFrame.dashPattern = [5, 5];
        placeholderFrame.resize(600, 200);
        placeholderFrame.layoutAlign = 'STRETCH';

        const errorText = figma.createText();
        errorText.fontName = await loadFont('Inter', 'Regular');
        errorText.fontSize = 14;
        errorText.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.1, b: 0.1 } }];
        errorText.characters = `Failed to load image\n${block.imageAlt || 'Unknown'}\nURL: ${block.imageUrl}`;
        errorText.textAlignHorizontal = 'CENTER';

        placeholderFrame.appendChild(errorText);
        return placeholderFrame;
    }
}

/**
 * Returns true if the block is any list-like type that should be grouped
 * into a single List Group frame with tighter spacing.
 */
function isListType(block: Block): boolean {
    return block.type === 'list' || block.type === 'orderedListItem' || block.type === 'taskListItem';
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Renders an array of Block objects into a Figma frame.
 *
 * Creates a VERTICAL auto-layout frame, then appends one child node per block.
 * Consecutive list blocks are grouped in a nested frame with tighter spacing
 * (settings.listSpacing) to avoid the over-spaced appearance of uniform
 * blockSpacing applied to every list item.
 *
 * If a block fails to render, a visible error placeholder node is inserted
 * instead so the overall import completes rather than aborting.
 *
 * If targetNode is provided and has a parent, the new frame replaces targetNode
 * at the same position in the layer hierarchy.
 *
 * @param name       - Name for the root Figma frame
 * @param blocks     - Ordered array of Block objects from parseMarkdownToBlocks
 * @param settings   - Plugin settings (spacing, frame dimensions, colors)
 * @param targetNode - Optional existing node to replace (for re-import)
 * @returns A RenderResult containing the fully constructed Figma frame and image failure count
 */
export async function renderBlocks(
    name: string,
    blocks: Block[],
    settings: PluginSettings,
    targetNode?: SceneNode
): Promise<RenderResult> {
    // Ensure all Markdown/* text styles exist
    try {
        await initializeStyles();
    } catch (err) {
        throw new Error(`Style initialization failed — ${errorMessage(err)}`);
    }

    // Compute placement before createFrame — createFrame immediately adds the frame
    // to figma.currentPage.children, which would inflate computeNewFrameX's result.
    const newFrameX = (!targetNode || !targetNode.parent) ? computeNewFrameX(100) : 0;

    // ── Create outer frame (do NOT insert into document yet) ─────────────────
    const frame = figma.createFrame();

    frame.name = name;
    frame.layoutMode = 'VERTICAL';
    frame.primaryAxisSizingMode = 'AUTO';
    frame.counterAxisSizingMode = 'FIXED';
    frame.paddingTop = settings.framePadding;
    frame.paddingBottom = settings.framePadding;
    frame.paddingLeft = settings.framePadding;
    frame.paddingRight = settings.framePadding;
    frame.itemSpacing = settings.blockSpacing;
    const effectiveWidth = resolvedFrameWidth(settings);
    frame.resize(effectiveWidth, frame.height);

    let imageFailures = 0;

    // ── Process blocks ───────────────────────────────────────────────────────
    let i = 0;
    while (i < blocks.length) {
        const block = blocks[i];

        // Group consecutive list blocks into a nested frame with listSpacing
        if (isListType(block)) {
            const listGroupFrame = figma.createFrame();
            listGroupFrame.name = 'List Group';
            listGroupFrame.layoutMode = 'VERTICAL';
            listGroupFrame.itemSpacing = settings.listSpacing;
            listGroupFrame.primaryAxisSizingMode = 'AUTO';
            listGroupFrame.counterAxisSizingMode = 'FIXED';
            listGroupFrame.layoutAlign = 'STRETCH';
            listGroupFrame.fills = [];

            const listStyle = await getOrCreateTextStyle(STYLE_NAMES.LIST, DEFAULT_STYLES[STYLE_NAMES.LIST]);

            while (i < blocks.length && isListType(blocks[i])) {
                const listBlock = blocks[i];
                try {
                    let listNode: SceneNode;
                    if (listBlock.type === 'orderedListItem') {
                        listNode = await renderOrderedListBlock(listBlock, listStyle);
                    } else if (listBlock.type === 'taskListItem') {
                        listNode = await renderTaskListBlock(listBlock, listStyle);
                    } else {
                        listNode = await renderListBlock(listBlock, listStyle);
                    }
                    listGroupFrame.appendChild(listNode);
                } catch (err) {
                    console.error(`[MarkDown For What] Failed to render list block: ${errorMessage(err)}`, err);
                    try {
                        const errFrame = await createErrorPlaceholder(listBlock, errorMessage(err));
                        listGroupFrame.appendChild(errFrame);
                    } catch (placeholderErr) {
                        console.error(`[MarkDown For What] Could not create error placeholder for list block`, placeholderErr);
                    }
                }
                i++;
            }

            frame.appendChild(listGroupFrame);
            continue;
        }

        // All other block types
        try {
            const node = await renderBlock(block, settings);
            if (node) {
                frame.appendChild(node);
                // createImageNode returns FrameNode on failure (placeholder), RectangleNode on success
                if (block.type === 'image' && node.type === 'FRAME') {
                    imageFailures++;
                }
            }
        } catch (err) {
            console.error(`[MarkDown For What] Failed to render block type "${block.type}": ${errorMessage(err)}`, err);
            try {
                const errFrame = await createErrorPlaceholder(block, errorMessage(err));
                frame.appendChild(errFrame);
            } catch (placeholderErr) {
                console.error(`[MarkDown For What] Could not create error placeholder for "${block.type}" block`, placeholderErr);
            }
        }

        i++;
    }

    // ── Place frame ───────────────────────────────────────────────────────────
    if (targetNode && targetNode.parent) {
        // Re-import: replace existing node at the same position in the layer stack
        const parent = targetNode.parent;
        const index = parent.children.indexOf(targetNode);
        frame.x = targetNode.x;
        frame.y = targetNode.y;
        parent.insertChild(index, frame);
        targetNode.remove();
    } else {
        // New import: place to the right of existing page content (computed above)
        frame.x = newFrameX;
    }

    return { frame, imageFailures };
}

// ─── Block-level render dispatch ─────────────────────────────────────────────

/**
 * Renders a single non-list block into a SceneNode.
 * List-like blocks (list, orderedListItem, taskListItem) are handled by the
 * list grouping loop in renderBlocks and dispatched to dedicated render functions.
 * Throws on unrecoverable errors so the caller can insert an error placeholder.
 * Returns null for unrecognized block types (default branch) — the caller silently skips null returns.
 */
async function renderBlock(block: Block, settings: PluginSettings): Promise<SceneNode | null> {
    switch (block.type) {
        case 'heading': {
            const node = figma.createText();
            let styleName: string;
            if (block.level === 1) styleName = STYLE_NAMES.H1;
            else if (block.level === 2) styleName = STYLE_NAMES.H2;
            else styleName = STYLE_NAMES.H3;
            await applyTextStyle(node, block, styleName);
            return node;
        }

        case 'paragraph': {
            const node = figma.createText();
            await applyTextStyle(node, block, STYLE_NAMES.BODY);
            return node;
        }

        case 'quote': {
            const node = figma.createText();
            await applyTextStyle(node, block, STYLE_NAMES.QUOTE);
            return node;
        }

        case 'code': {
            const codeFrame = figma.createFrame();
            codeFrame.layoutMode = 'VERTICAL';
            codeFrame.primaryAxisSizingMode = 'AUTO';
            codeFrame.fills = [{ type: 'SOLID', color: hexToRgb(settings.codeBackground) }];
            codeFrame.paddingTop = 16;
            codeFrame.paddingBottom = 16;
            codeFrame.paddingLeft = 16;
            codeFrame.paddingRight = 16;
            codeFrame.cornerRadius = 8;
            codeFrame.layoutAlign = 'STRETCH';
            codeFrame.counterAxisSizingMode = 'FIXED';

            const codeText = figma.createText();
            const codeStyle = await getOrCreateTextStyle(STYLE_NAMES.CODE, DEFAULT_STYLES[STYLE_NAMES.CODE]);
            await codeText.setTextStyleIdAsync(codeStyle.id);
            codeText.characters = block.content || '';
            codeText.layoutAlign = 'STRETCH';

            codeFrame.appendChild(codeText);
            return codeFrame;
        }

        case 'separator': {
            const line = figma.createRectangle();
            line.resize(line.width, 1);
            line.fills = [{ type: 'SOLID', color: hexToRgb(settings.separatorColor) }];
            line.layoutAlign = 'STRETCH';
            return line;
        }

        case 'table': {
            return await createTableFrame(block, settings);
        }

        case 'image': {
            return await createImageNode(block, settings);
        }

        case 'callout': {
            return await renderCalloutBlock(block);
        }

        case 'toc': {
            return await renderTocBlock(block);
        }

        case 'list':
        case 'orderedListItem':
        case 'taskListItem':
            // These are handled by the list grouping loop in renderBlocks — reaching
            // here indicates a routing bug.
            console.error(`[MarkDown For What] Block type "${block.type}" reached renderBlock — should be handled by list grouping`);
            return null;

        default:
            console.warn(`[MarkDown For What] Unknown block type: "${(block as { type: string }).type}" — skipping`);
            return null;
    }
}

/**
 * Renders a list item as a TextNode with a prefix string (bullet or number).
 * The prefix is prepended as a synthetic text token so applyInlineStyles includes it
 * in the formatted character range. Falls back to string concatenation when no tokens.
 */
async function renderPrefixedListItem(block: Block, prefix: string, listStyle: TextStyle): Promise<TextNode> {
    const node = figma.createText();
    await node.setTextStyleIdAsync(listStyle.id);
    node.layoutAlign = 'STRETCH';

    if (block.tokens && block.tokens.length > 0) {
        await applyInlineStyles(node, [syntheticTextToken(prefix), ...block.tokens], STYLE_NAMES.LIST);
    } else {
        node.characters = block.content ? `${prefix}${block.content}` : prefix.trimEnd();
    }

    const depth = block.depth ?? 0;
    if (depth > 0) {
        node.paragraphIndent = depth * INDENT_PER_DEPTH;
    }

    return node;
}

async function renderListBlock(block: Block, listStyle: TextStyle): Promise<TextNode> {
    const depth = block.depth ?? 0;
    const bullet = BULLETS[Math.min(depth, BULLETS.length - 1)];
    return renderPrefixedListItem(block, bullet, listStyle);
}

async function renderOrderedListBlock(block: Block, listStyle: TextStyle): Promise<TextNode> {
    const prefix = `${block.index ?? 1}. `;
    return renderPrefixedListItem(block, prefix, listStyle);
}

/**
 * Renders a task list item as a horizontal frame containing a checkbox rectangle and text node.
 */
async function renderTaskListBlock(block: Block, listStyle: TextStyle): Promise<FrameNode> {
    const taskFrame = figma.createFrame();
    taskFrame.name = block.checked ? 'Task (done)' : 'Task';
    taskFrame.layoutMode = 'HORIZONTAL';
    taskFrame.itemSpacing = 8;
    taskFrame.primaryAxisSizingMode = 'FIXED';
    taskFrame.counterAxisSizingMode = 'AUTO';
    taskFrame.layoutAlign = 'STRETCH';
    taskFrame.fills = [];

    const depth = block.depth ?? 0;
    if (depth > 0) {
        taskFrame.paddingLeft = depth * INDENT_PER_DEPTH;
    }

    // Checkbox rectangle
    const checkbox = figma.createRectangle();
    checkbox.name = block.checked ? 'Checked' : 'Unchecked';
    checkbox.resize(16, 16);
    checkbox.cornerRadius = 3;
    if (block.checked) {
        checkbox.fills = [CHECKBOX_CHECKED];
    } else {
        checkbox.fills = [CHECKBOX_UNCHECKED_FILL];
        checkbox.strokes = [CHECKBOX_UNCHECKED_STROKE];
        checkbox.strokeWeight = 1;
    }

    // Text node
    const textNode = figma.createText();
    await textNode.setTextStyleIdAsync(listStyle.id);
    textNode.layoutAlign = 'STRETCH';
    textNode.layoutGrow = 1;

    if (block.tokens && block.tokens.length > 0) {
        await applyInlineStyles(textNode, block.tokens, STYLE_NAMES.LIST);
    } else {
        textNode.characters = block.content ?? '';
    }

    // Dim checked items
    if (block.checked) {
        textNode.opacity = 0.6;
    }

    taskFrame.appendChild(checkbox);
    taskFrame.appendChild(textNode);
    return taskFrame;
}

/**
 * Renders a callout/admonition block as a colored frame with label and body.
 */
async function renderCalloutBlock(block: Block): Promise<FrameNode> {
    const calloutType = block.calloutType ?? 'note';
    const colors = CALLOUT_COLORS[calloutType] ?? CALLOUT_COLORS.note;

    const calloutFrame = figma.createFrame();
    calloutFrame.name = `Callout: ${CALLOUT_LABELS[calloutType] ?? 'Note'}`;
    calloutFrame.layoutMode = 'VERTICAL';
    calloutFrame.primaryAxisSizingMode = 'AUTO';
    calloutFrame.counterAxisSizingMode = 'FIXED';
    calloutFrame.layoutAlign = 'STRETCH';
    calloutFrame.itemSpacing = 8;
    calloutFrame.paddingTop = 12;
    calloutFrame.paddingBottom = 12;
    calloutFrame.paddingLeft = 16;
    calloutFrame.paddingRight = 16;

    // Background fill at 10% opacity
    calloutFrame.fills = [{
        type: 'SOLID',
        color: colors.bg,
        opacity: 0.1,
    }];

    // Left border only (4px)
    calloutFrame.strokes = [{ type: 'SOLID', color: colors.border }];
    calloutFrame.strokeWeight = 0;
    calloutFrame.strokeLeftWeight = 4;
    calloutFrame.strokeTopWeight = 0;
    calloutFrame.strokeBottomWeight = 0;
    calloutFrame.strokeRightWeight = 0;

    // Label text (bold, colored)
    const labelNode = figma.createText();
    const boldFont = await loadFont('Inter', 'Bold');
    labelNode.fontName = boldFont;
    labelNode.fontSize = 14;
    labelNode.characters = CALLOUT_LABELS[calloutType] ?? 'Note';
    labelNode.fills = [{ type: 'SOLID', color: colors.text }];
    labelNode.layoutAlign = 'STRETCH';

    // Body text — use applyInlineStyles when tokens are available for rich formatting
    const bodyNode = figma.createText();
    const bodyStyle = await getOrCreateTextStyle(STYLE_NAMES.BODY, DEFAULT_STYLES[STYLE_NAMES.BODY]);
    await bodyNode.setTextStyleIdAsync(bodyStyle.id);
    bodyNode.layoutAlign = 'STRETCH';

    if (block.tokens && block.tokens.length > 0) {
        await applyInlineStyles(bodyNode, block.tokens, STYLE_NAMES.BODY);
    } else {
        bodyNode.characters = block.content ?? '';
    }

    calloutFrame.appendChild(labelNode);
    calloutFrame.appendChild(bodyNode);
    return calloutFrame;
}

/**
 * Renders a table of contents block with a "Contents" label and indented heading entries.
 */
async function renderTocBlock(block: Block): Promise<FrameNode> {
    const tocFrame = figma.createFrame();
    tocFrame.name = 'Table of Contents';
    tocFrame.layoutMode = 'VERTICAL';
    tocFrame.primaryAxisSizingMode = 'AUTO';
    tocFrame.counterAxisSizingMode = 'FIXED';
    tocFrame.layoutAlign = 'STRETCH';
    tocFrame.itemSpacing = 4;
    tocFrame.paddingBottom = 12;
    tocFrame.fills = [];

    // "Contents" label using H3 style
    const labelNode = figma.createText();
    const h3Style = await getOrCreateTextStyle(STYLE_NAMES.H3, DEFAULT_STYLES[STYLE_NAMES.H3]);
    await labelNode.setTextStyleIdAsync(h3Style.id);
    labelNode.characters = 'Contents';
    labelNode.layoutAlign = 'STRETCH';
    tocFrame.appendChild(labelNode);

    // TOC entries
    const bodyStyle = await getOrCreateTextStyle(STYLE_NAMES.BODY, DEFAULT_STYLES[STYLE_NAMES.BODY]);
    for (const entry of (block.tocEntries ?? [])) {
        const entryNode = figma.createText();
        await entryNode.setTextStyleIdAsync(bodyStyle.id);
        entryNode.fontSize = 14;
        entryNode.characters = entry.text;
        entryNode.layoutAlign = 'STRETCH';

        // Indent: H1 = 0, H2 = 20px, H3 = 40px
        const indent = Math.max(0, (entry.level - 1)) * INDENT_PER_DEPTH;
        if (indent > 0) {
            entryNode.paragraphIndent = indent;
        }

        tocFrame.appendChild(entryNode);
    }

    return tocFrame;
}

/**
 * Applies a named text style and inline formatting to a TextNode.
 * Sets layoutAlign to STRETCH so the node fills the parent frame width.
 */
async function applyTextStyle(node: TextNode, block: Block, styleName: string): Promise<void> {
    const style = await getOrCreateTextStyle(styleName, DEFAULT_STYLES[styleName] ?? DEFAULT_STYLES[STYLE_NAMES.BODY]);
    await node.setTextStyleIdAsync(style.id);
    node.layoutAlign = 'STRETCH';

    if (block.tokens) {
        await applyInlineStyles(node, block.tokens, styleName);
    } else if (block.content) {
        node.characters = block.content;
    } else {
        console.warn(`[MarkDown For What] Block of type "${block.type}" has neither tokens nor content`);
        node.characters = '';
    }
}

/**
 * Creates a visible error placeholder frame for a block that failed to render.
 */
async function createErrorPlaceholder(block: Block, reason?: string): Promise<FrameNode> {
    const errFrame = figma.createFrame();
    errFrame.name = `Error: ${block.type}`;
    errFrame.layoutMode = 'VERTICAL';
    errFrame.paddingTop = 8;
    errFrame.paddingBottom = 8;
    errFrame.paddingLeft = 12;
    errFrame.paddingRight = 12;
    errFrame.fills = [{ type: 'SOLID', color: { r: 1, g: 0.9, b: 0.9 } }];
    errFrame.strokes = [{ type: 'SOLID', color: { r: 0.8, g: 0.2, b: 0.2 } }];
    errFrame.strokeWeight = 1;
    errFrame.layoutAlign = 'STRETCH';
    errFrame.primaryAxisSizingMode = 'AUTO';
    errFrame.counterAxisSizingMode = 'FIXED';

    const errText = figma.createText();
    errText.fontName = await loadFont('Inter', 'Regular');
    errText.fontSize = 12;
    errText.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.1, b: 0.1 } }];
    errText.characters = reason
        ? `Failed to render block: ${block.type} — ${reason}`
        : `Failed to render block: ${block.type}`;
    errText.layoutAlign = 'STRETCH';

    errFrame.appendChild(errText);
    return errFrame;
}
