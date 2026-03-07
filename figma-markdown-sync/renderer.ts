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
 *   renderBlocks(name, blocks, settings, targetNode?) — async: returns FrameNode
 */

import type { Block } from './parser';
import type { PluginSettings } from './settings';
import { STYLE_NAMES, DEFAULT_STYLES, loadFont, getOrCreateTextStyle, applyInlineStyles, initializeStyles } from './styles';
import { createTableFrame } from './tables';
import { hexToRgb } from './utils';

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
        const maxWidth = settings.frameWidth;
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
        const fontName = await loadFont('Inter', 'Regular');
        errorText.fontName = fontName;
        errorText.fontSize = 14;
        errorText.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.1, b: 0.1 } }];
        errorText.characters = `Failed to load image\n${block.imageAlt || 'Unknown'}\nURL: ${block.imageUrl}`;
        errorText.textAlignHorizontal = 'CENTER';

        placeholderFrame.appendChild(errorText);
        return placeholderFrame;
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
 * @returns The fully constructed Figma frame
 */
export async function renderBlocks(
    name: string,
    blocks: Block[],
    settings: PluginSettings,
    targetNode?: SceneNode
): Promise<FrameNode> {
    // Ensure all Markdown/* text styles exist
    await initializeStyles();

    // ── Create outer frame ───────────────────────────────────────────────────
    const frame = figma.createFrame();
    if (targetNode && targetNode.parent) {
        frame.x = targetNode.x;
        frame.y = targetNode.y;
        targetNode.parent.insertChild(targetNode.parent.children.indexOf(targetNode), frame);
        targetNode.remove();
    }

    frame.name = name;
    frame.layoutMode = 'VERTICAL';
    frame.primaryAxisSizingMode = 'AUTO';
    frame.counterAxisSizingMode = 'FIXED';
    frame.paddingTop = settings.framePadding;
    frame.paddingBottom = settings.framePadding;
    frame.paddingLeft = settings.framePadding;
    frame.paddingRight = settings.framePadding;
    frame.itemSpacing = settings.blockSpacing;
    frame.resize(settings.frameWidth, frame.height);

    // ── Process blocks ───────────────────────────────────────────────────────
    let i = 0;
    while (i < blocks.length) {
        const block = blocks[i];

        // Group consecutive list blocks into a nested frame with listSpacing
        if (block.type === 'list') {
            const listGroupFrame = figma.createFrame();
            listGroupFrame.name = 'List Group';
            listGroupFrame.layoutMode = 'VERTICAL';
            listGroupFrame.itemSpacing = settings.listSpacing;
            listGroupFrame.primaryAxisSizingMode = 'AUTO';
            listGroupFrame.counterAxisSizingMode = 'FIXED';
            listGroupFrame.layoutAlign = 'STRETCH';
            listGroupFrame.fills = [];

            while (i < blocks.length && blocks[i].type === 'list') {
                const listBlock = blocks[i];
                try {
                    const listNode = await renderListBlock(listBlock);
                    listGroupFrame.appendChild(listNode);
                } catch (err) {
                    console.error(`[MarkDown For What] Failed to render list block:`, err);
                    const errFrame = await createErrorPlaceholder(listBlock);
                    listGroupFrame.appendChild(errFrame);
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
            }
        } catch (err) {
            console.error(`[MarkDown For What] Failed to render block type "${block.type}":`, err);
            const errFrame = await createErrorPlaceholder(block);
            frame.appendChild(errFrame);
        }

        i++;
    }

    return frame;
}

// ─── Block-level render dispatch ─────────────────────────────────────────────

/**
 * Renders a single non-list block into a SceneNode.
 * Throws on unrecoverable errors so the caller can insert an error placeholder.
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
            await loadFont('Roboto Mono', 'Regular');
            const codeStyle = await getOrCreateTextStyle(STYLE_NAMES.CODE, DEFAULT_STYLES[STYLE_NAMES.CODE]);
            codeText.textStyleId = codeStyle.id;
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

        default:
            return null;
    }
}

/**
 * Renders a single list block as a text node with a bullet prefix.
 */
async function renderListBlock(block: Block): Promise<TextNode> {
    const node = figma.createText();
    const style = await getOrCreateTextStyle(STYLE_NAMES.LIST, DEFAULT_STYLES[STYLE_NAMES.LIST]);
    node.textStyleId = style.id;
    node.layoutAlign = 'STRETCH';

    if (block.tokens && block.tokens.length > 0) {
        await applyInlineStyles(node, block.tokens, STYLE_NAMES.LIST);
    } else {
        const content = block.content ? `• ${block.content}` : '•';
        node.characters = content;
    }
    return node;
}

/**
 * Applies a named text style and inline formatting to a TextNode.
 * Sets layoutAlign to STRETCH so the node fills the parent frame width.
 */
async function applyTextStyle(node: TextNode, block: Block, styleName: string): Promise<void> {
    const style = await getOrCreateTextStyle(styleName, DEFAULT_STYLES[styleName] ?? DEFAULT_STYLES[STYLE_NAMES.BODY]);
    node.textStyleId = style.id;
    node.layoutAlign = 'STRETCH';

    if (block.tokens && block.type !== 'list') {
        await applyInlineStyles(node, block.tokens, styleName);
    } else if (block.content) {
        node.characters = block.content;
    }
}

/**
 * Creates a visible error placeholder frame for a block that failed to render.
 */
async function createErrorPlaceholder(block: Block): Promise<FrameNode> {
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
    const fontName = await loadFont('Inter', 'Regular');
    errText.fontName = fontName;
    errText.fontSize = 12;
    errText.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.1, b: 0.1 } }];
    errText.characters = `Failed to render block: ${block.type}`;
    errText.layoutAlign = 'STRETCH';

    errFrame.appendChild(errText);
    return errFrame;
}
