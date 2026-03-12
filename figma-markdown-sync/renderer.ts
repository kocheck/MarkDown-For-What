/**
 * renderer.ts
 *
 * Orchestrates converting an array of Block objects into a Figma FrameNode.
 *
 * This module owns the top-level rendering pipeline:
 *   - Frame creation and placement
 *   - Component Output Mode dispatch
 *   - Block dispatch routing
 *   - List grouping into nested frames
 *   - Text style application
 *
 * Individual block renderers and `tryRenderWithComponent` live in blockRenderers.ts.
 * Rendering constants (colors, bullets, checkbox paints) live in constants.ts.
 *
 * Public API:
 *   renderBlocks(name, blocks, settings, targetNode?) — async: returns RenderResult { frame, imageFailures }
 */

import type { Block } from './parser';
import type { PluginSettings, StyleBindings, ComponentBindings } from './settings';
import { resolvedFrameWidth } from './settings';
import { STYLE_NAMES, DEFAULT_STYLES, getOrCreateTextStyle, getOrCreateTextStyleWithBinding, applyInlineStyles, initializeStyles } from './styles';

/** Maps Markdown/* style names to StyleBindings keys. */
const STYLE_TO_BINDING_KEY: Record<string, keyof StyleBindings> = {
    [STYLE_NAMES.H1]:    'h1',
    [STYLE_NAMES.H2]:    'h2',
    [STYLE_NAMES.H3]:    'h3',
    [STYLE_NAMES.BODY]:  'body',
    [STYLE_NAMES.CODE]:  'code',
    [STYLE_NAMES.LIST]:  'list',
    [STYLE_NAMES.QUOTE]: 'quote',
};
import { createTableFrame } from './tables';
import { hexToRgb, errorMessage } from './utils';
import {
    renderCalloutBlock,
    renderTocBlock,
    renderListBlock,
    renderOrderedListBlock,
    renderTaskListBlock,
    renderDefinitionListBlock,
    renderFootnoteSectionBlock,
    renderBadgeRowBlock,
    renderMermaidBlock,
    renderMathBlock,
    createImageNode,
    createErrorPlaceholder,
    tryRenderWithComponent,
    clearComponentCache,
} from './blockRenderers';

/** Result returned by renderBlocks with the rendered frame and non-fatal warning counts. */
export interface RenderResult {
    frame: FrameNode;
    /** Number of image blocks that failed to load (placeholder shown instead). */
    imageFailures: number;
}

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

/**
 * Returns true if the block is any list-like type that should be grouped
 * into a single List Group frame with tighter spacing.
 */
function isListType(block: Block): boolean {
    return block.type === 'list' || block.type === 'orderedListItem' || block.type === 'taskListItem';
}

// ─── Component Naming ─────────────────────────────────────────────────────────

/**
 * Returns a semantic, component-ready layer name for a block.
 * Used when componentNames setting is enabled.
 *
 * @example
 * componentName({ type: 'heading', level: 1, content: 'Intro' })
 * // → 'Heading/H1 — Intro'
 */
export function componentName(block: Block): string {
    const truncate = (s: string, max: number) => s.length > max ? s.slice(0, max) + '…' : s;
    const label = block.content ? ` — ${truncate(block.content, 40)}` : '';

    switch (block.type) {
        case 'heading':
            return `Heading/H${block.level ?? 1}${label}`;
        case 'paragraph':
            return `Body/Paragraph${label}`;
        case 'code':
            return `Code/${block.language || 'plain'}`;
        case 'quote':
            return `Body/Blockquote${label}`;
        case 'separator':
            return 'Divider/HR';
        case 'table':
            return 'Data/Table';
        case 'image':
            return `Media/Image — ${block.imageAlt || 'untitled'}`;
        case 'list':
            return `List/Unordered${label}`;
        case 'orderedListItem':
            return `List/Ordered${label}`;
        case 'taskListItem':
            return `List/Task${block.checked ? ' ✓' : ''}${label}`;
        case 'callout':
            return `Callout/${block.calloutType ?? 'note'}`;
        case 'toc':
            return 'Navigation/TOC';
        case 'definitionList':
            return 'Body/Definition List';
        case 'footnoteSection':
            return 'Body/Footnotes';
        case 'badgeRow':
            return 'Badge/Row';
        case 'mermaid':
            return 'Diagram/Mermaid';
        case 'math':
            return 'Math/Display';
        default:
            return `Block/${(block as { type: string }).type}`;
    }
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
    // Clear per-render component cache so stale lookups don't persist across batches
    clearComponentCache();

    // Ensure all Markdown/* text styles exist
    try {
        await initializeStyles();
    } catch (err) {
        throw new Error(`Style initialization failed — ${errorMessage(err)}`);
    }

    // Compute placement before createFrame — createFrame immediately adds the frame
    // to figma.currentPage.children, which would inflate computeNewFrameX's result.
    const newFrameX = (!targetNode || !targetNode.parent) ? computeNewFrameX(100) : 0;

    // ── Create outer frame (auto-appended by Figma; final placement is set after rendering) ──
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
    frame.fills = [{ type: 'SOLID', color: hexToRgb(settings.frameFillColor ?? '#FFFFFF') }];
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

            const listBindingId = settings.styleBindings?.list;
            const listStyle = await getOrCreateTextStyleWithBinding(STYLE_NAMES.LIST, DEFAULT_STYLES[STYLE_NAMES.LIST], listBindingId);

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
                    if (settings.componentNames) {
                        listNode.name = componentName(listBlock);
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
                if (settings.componentNames) {
                    node.name = componentName(block);
                }
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

/** Maps block types to their Component Output Mode binding key, title, and content extractors. */
const COMPONENT_BINDING_MAP: Partial<Record<Block['type'], {
    key: keyof ComponentBindings;
    title?: (b: Block) => string | undefined;
    content?: (b: Block) => string;
}>> = {
    quote:   { key: 'blockquote' },
    code:    { key: 'codeBlock', title: b => b.language || undefined },
    table:   {
        key: 'table',
        title: b => b.header?.map(c => c.text).join(' | ') || undefined,
        content: b => {
            const rows = b.rows?.map(r => r.map(c => c.text).join(' | ')) ?? [];
            return rows.join('\n');
        },
    },
    image:   { key: 'image', title: b => b.imageAlt || undefined, content: b => b.imageUrl ?? '' },
    callout: { key: 'callout', title: b => b.calloutType ?? 'note' },
};

/**
 * Renders a single non-list block into a SceneNode.
 * Component Output Mode is attempted first for supported block types (via
 * tryRenderWithComponent) before falling back to switch-based default rendering.
 * List-like blocks (list, orderedListItem, taskListItem) are handled by the
 * list grouping loop in renderBlocks and dispatched to dedicated render functions.
 * Throws on unrecoverable errors so the caller can insert an error placeholder.
 * Returns null only for list-type blocks that reach here due to a routing bug.
 * Unrecognized block types produce a visible error placeholder.
 */
async function renderBlock(block: Block, settings: PluginSettings): Promise<SceneNode | null> {
    // Try Component Output Mode for supported block types
    const mapping = COMPONENT_BINDING_MAP[block.type];
    if (mapping) {
        // Override block content if the mapping provides a custom content extractor
        const blockForComponent = mapping.content
            ? { ...block, content: mapping.content(block), tokens: undefined }
            : block;
        const compNode = await tryRenderWithComponent(blockForComponent, mapping.key, settings.componentBindings, mapping.title?.(block));
        if (compNode) return compNode;
    }

    switch (block.type) {
        case 'heading': {
            const node = figma.createText();
            let styleName: string;
            if (block.level === 1) styleName = STYLE_NAMES.H1;
            else if (block.level === 2) styleName = STYLE_NAMES.H2;
            else styleName = STYLE_NAMES.H3;
            await applyTextStyle(node, block, styleName, settings.styleBindings);
            return node;
        }

        case 'paragraph': {
            const node = figma.createText();
            await applyTextStyle(node, block, STYLE_NAMES.BODY, settings.styleBindings);
            return node;
        }

        case 'quote': {
            const node = figma.createText();
            await applyTextStyle(node, block, STYLE_NAMES.QUOTE, settings.styleBindings);
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
            const codeBindingId = settings.styleBindings?.code;
            const codeStyle = await getOrCreateTextStyleWithBinding(STYLE_NAMES.CODE, DEFAULT_STYLES[STYLE_NAMES.CODE], codeBindingId);
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

        case 'definitionList': {
            return await renderDefinitionListBlock(block);
        }

        case 'footnoteSection': {
            return await renderFootnoteSectionBlock(block);
        }

        case 'badgeRow': {
            return await renderBadgeRowBlock(block);
        }

        case 'mermaid': {
            return await renderMermaidBlock(block);
        }

        case 'math': {
            return await renderMathBlock(block);
        }

        case 'list':
        case 'orderedListItem':
        case 'taskListItem':
            // Reaching here indicates a routing bug — list types should be handled
            // by the list grouping loop in renderBlocks.
            throw new Error(`Block type "${block.type}" reached renderBlock — should be handled by list grouping (routing bug)`);

        default:
            console.warn(`[MarkDown For What] Unknown block type: "${(block as { type: string }).type}" — skipping`);
            return await createErrorPlaceholder(block, `Unknown block type: "${(block as { type: string }).type}"`);
    }
}

/**
 * Applies a named text style and inline formatting to a TextNode.
 * Sets layoutAlign to STRETCH so the node fills the parent frame width.
 * Uses style bindings when available.
 */
async function applyTextStyle(node: TextNode, block: Block, styleName: string, bindings?: StyleBindings): Promise<void> {
    const bindingKey = STYLE_TO_BINDING_KEY[styleName];
    const bindingId = bindingKey ? bindings?.[bindingKey] : undefined;
    const style = await getOrCreateTextStyleWithBinding(styleName, DEFAULT_STYLES[styleName] ?? DEFAULT_STYLES[STYLE_NAMES.BODY], bindingId);
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
