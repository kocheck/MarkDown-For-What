/**
 * blockRenderers.ts
 *
 * Individual block-level renderers extracted from renderer.ts.
 * Each function converts a single Block into a Figma SceneNode.
 *
 * This module handles:
 *   - Callout/admonition blocks
 *   - Table of contents blocks
 *   - List item blocks (unordered, ordered, task)
 *   - Image blocks (with placeholder fallback)
 *   - Error placeholder blocks
 *
 * The orchestration (renderBlocks, renderBlock dispatch) stays in renderer.ts.
 */

import type { Block, CalloutType } from './parser';
import type { PluginSettings } from './settings';
import { resolvedFrameWidth } from './settings';
import type { marked } from 'marked';
import { STYLE_NAMES, DEFAULT_STYLES, loadFont, getOrCreateTextStyle, applyInlineStyles } from './styles';
import {
    CALLOUT_COLORS,
    CALLOUT_LABELS,
    BULLETS,
    INDENT_PER_DEPTH,
    CHECKBOX_CHECKED,
    CHECKBOX_UNCHECKED_FILL,
    CHECKBOX_UNCHECKED_STROKE,
    BADGE_NAMED_COLORS,
    badgeColorForLabel,
    ERROR_BORDER_COLOR,
    ERROR_TEXT_COLOR,
} from './constants';
import { hexToRgb } from './utils';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Creates a typed synthetic text token for use as a prefix in list items. */
function syntheticTextToken(text: string): marked.Tokens.Text {
    return { type: 'text', raw: text, text } as marked.Tokens.Text;
}

// ─── Callout Rendering ──────────────────────────────────────────────────────

/**
 * Renders a callout/admonition block as a colored frame with label and body.
 */
export async function renderCalloutBlock(block: Block): Promise<FrameNode> {
    const calloutType: CalloutType = block.calloutType ?? 'note';
    const colors = CALLOUT_COLORS[calloutType];

    const calloutFrame = figma.createFrame();
    calloutFrame.name = `Callout: ${CALLOUT_LABELS[calloutType]}`;
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
    labelNode.characters = CALLOUT_LABELS[calloutType];
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

// ─── TOC Rendering ──────────────────────────────────────────────────────────

/**
 * Renders a table of contents block with a "Contents" label and indented heading entries.
 */
export async function renderTocBlock(block: Block): Promise<FrameNode> {
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

// ─── List Rendering ─────────────────────────────────────────────────────────

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

export async function renderListBlock(block: Block, listStyle: TextStyle): Promise<TextNode> {
    const depth = block.depth ?? 0;
    const bullet = BULLETS[Math.min(depth, BULLETS.length - 1)];
    return renderPrefixedListItem(block, bullet, listStyle);
}

export async function renderOrderedListBlock(block: Block, listStyle: TextStyle): Promise<TextNode> {
    const prefix = `${block.index ?? 1}. `;
    return renderPrefixedListItem(block, prefix, listStyle);
}

/**
 * Renders a task list item as a horizontal frame containing a checkbox rectangle and text node.
 */
export async function renderTaskListBlock(block: Block, listStyle: TextStyle): Promise<FrameNode> {
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

// ─── Definition List Rendering ───────────────────────────────────────────────

/**
 * Renders a definition list block with bold terms and indented definitions.
 */
export async function renderDefinitionListBlock(block: Block): Promise<FrameNode> {
    const dlFrame = figma.createFrame();
    dlFrame.name = 'Definition List';
    dlFrame.layoutMode = 'VERTICAL';
    dlFrame.primaryAxisSizingMode = 'AUTO';
    dlFrame.counterAxisSizingMode = 'FIXED';
    dlFrame.layoutAlign = 'STRETCH';
    dlFrame.itemSpacing = 8;
    dlFrame.fills = [];

    // Pre-load fonts once before iterating
    const [boldFont, regularFont] = await Promise.all([
        loadFont('Inter', 'Bold'),
        loadFont('Inter', 'Regular'),
    ]);

    for (const item of (block.definitions ?? [])) {
        // Term: bold text node
        const termNode = figma.createText();
        termNode.fontName = boldFont;
        termNode.fontSize = 16;
        termNode.characters = item.term;
        termNode.layoutAlign = 'STRETCH';
        dlFrame.appendChild(termNode);

        // Definitions: indented body text
        for (const def of item.definitions) {
            const defNode = figma.createText();
            defNode.fontName = regularFont;
            defNode.fontSize = 16;
            defNode.characters = def;
            defNode.paragraphIndent = INDENT_PER_DEPTH;
            defNode.layoutAlign = 'STRETCH';
            dlFrame.appendChild(defNode);
        }
    }

    return dlFrame;
}

// ─── Footnote Section Rendering ──────────────────────────────────────────────

/**
 * Renders a footnote section as a vertical frame with numbered footnote entries.
 * Typically placed after a separator at the end of the document.
 */
export async function renderFootnoteSectionBlock(block: Block): Promise<FrameNode> {
    const fnFrame = figma.createFrame();
    fnFrame.name = 'Footnotes';
    fnFrame.layoutMode = 'VERTICAL';
    fnFrame.primaryAxisSizingMode = 'AUTO';
    fnFrame.counterAxisSizingMode = 'FIXED';
    fnFrame.layoutAlign = 'STRETCH';
    fnFrame.itemSpacing = 4;
    fnFrame.fills = [];

    const bodyStyle = await getOrCreateTextStyle(STYLE_NAMES.BODY, DEFAULT_STYLES[STYLE_NAMES.BODY]);
    const regularFont = await loadFont('Inter', 'Regular');

    for (const fn of (block.footnotes ?? [])) {
        const entryNode = figma.createText();
        await entryNode.setTextStyleIdAsync(bodyStyle.id);
        entryNode.fontName = regularFont;
        entryNode.fontSize = 13;
        entryNode.characters = `${fn.index}. ${fn.text}`;
        entryNode.layoutAlign = 'STRETCH';
        fnFrame.appendChild(entryNode);
    }

    return fnFrame;
}

// ─── Badge Row Rendering ────────────────────────────────────────────────────

/**
 * Renders a row of badge pills as a horizontal auto-layout frame with wrapping.
 */
export async function renderBadgeRowBlock(block: Block): Promise<FrameNode> {
    const rowFrame = figma.createFrame();
    rowFrame.name = 'Badge Row';
    rowFrame.layoutMode = 'HORIZONTAL';
    rowFrame.primaryAxisSizingMode = 'AUTO';
    rowFrame.counterAxisSizingMode = 'AUTO';
    rowFrame.layoutAlign = 'STRETCH';
    rowFrame.itemSpacing = 8;
    rowFrame.layoutWrap = 'WRAP';
    rowFrame.fills = [];

    const regularFont = await loadFont('Inter', 'Regular');

    for (const badge of (block.badges ?? [])) {
        const pillFrame = figma.createFrame();
        pillFrame.name = `Badge: ${badge.label}`;
        pillFrame.layoutMode = 'HORIZONTAL';
        pillFrame.primaryAxisSizingMode = 'AUTO';
        pillFrame.counterAxisSizingMode = 'AUTO';
        pillFrame.paddingTop = 4;
        pillFrame.paddingBottom = 4;
        pillFrame.paddingLeft = 10;
        pillFrame.paddingRight = 10;
        pillFrame.cornerRadius = 12;

        // Determine color
        const colorHex = badge.color
            ? (BADGE_NAMED_COLORS[badge.color.toLowerCase()] ?? badge.color)
            : badgeColorForLabel(badge.label);
        const bgColor = hexToRgb(colorHex);
        pillFrame.fills = [{ type: 'SOLID', color: bgColor }];

        // Text (white for good contrast on colored background)
        const textNode = figma.createText();
        textNode.fontName = regularFont;
        textNode.fontSize = 12;
        textNode.characters = badge.label;
        textNode.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];

        pillFrame.appendChild(textNode);
        rowFrame.appendChild(pillFrame);
    }

    return rowFrame;
}

// ─── Image Rendering ────────────────────────────────────────────────────────

/**
 * Creates a Figma image node from a parsed image block.
 * If the image URL cannot be fetched, returns a styled placeholder frame instead.
 */
export async function createImageNode(block: Block, settings: PluginSettings): Promise<RectangleNode | FrameNode> {
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
        placeholderFrame.strokes = [{ type: 'SOLID', color: ERROR_BORDER_COLOR }];
        placeholderFrame.strokeWeight = 2;
        placeholderFrame.dashPattern = [5, 5];
        placeholderFrame.resize(600, 200);
        placeholderFrame.layoutAlign = 'STRETCH';

        const errorText = figma.createText();
        errorText.fontName = await loadFont('Inter', 'Regular');
        errorText.fontSize = 14;
        errorText.fills = [{ type: 'SOLID', color: ERROR_TEXT_COLOR }];
        errorText.characters = `Failed to load image\n${block.imageAlt || 'Unknown'}\nURL: ${block.imageUrl}`;
        errorText.textAlignHorizontal = 'CENTER';

        placeholderFrame.appendChild(errorText);
        return placeholderFrame;
    }
}

// ─── Error Placeholder ──────────────────────────────────────────────────────

/**
 * Creates a visible error placeholder frame for a block that failed to render.
 */
export async function createErrorPlaceholder(block: Block, reason?: string): Promise<FrameNode> {
    const errFrame = figma.createFrame();
    errFrame.name = `Error: ${block.type}`;
    errFrame.layoutMode = 'VERTICAL';
    errFrame.paddingTop = 8;
    errFrame.paddingBottom = 8;
    errFrame.paddingLeft = 12;
    errFrame.paddingRight = 12;
    errFrame.fills = [{ type: 'SOLID', color: { r: 1, g: 0.9, b: 0.9 } }];
    errFrame.strokes = [{ type: 'SOLID', color: ERROR_BORDER_COLOR }];
    errFrame.strokeWeight = 1;
    errFrame.layoutAlign = 'STRETCH';
    errFrame.primaryAxisSizingMode = 'AUTO';
    errFrame.counterAxisSizingMode = 'FIXED';

    const errText = figma.createText();
    errText.fontName = await loadFont('Inter', 'Regular');
    errText.fontSize = 12;
    errText.fills = [{ type: 'SOLID', color: ERROR_TEXT_COLOR }];
    errText.characters = reason
        ? `Failed to render block: ${block.type} — ${reason}`
        : `Failed to render block: ${block.type}`;
    errText.layoutAlign = 'STRETCH';

    errFrame.appendChild(errText);
    return errFrame;
}

// CommonJS export shim — allows Jest (require()) and webpack (import) to both work
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        renderCalloutBlock,
        renderTocBlock,
        renderListBlock,
        renderOrderedListBlock,
        renderTaskListBlock,
        renderDefinitionListBlock,
        renderFootnoteSectionBlock,
        renderBadgeRowBlock,
        createImageNode,
        createErrorPlaceholder,
    };
}
