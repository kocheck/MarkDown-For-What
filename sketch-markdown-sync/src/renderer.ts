/**
 * renderer.ts
 *
 * Converts an array of Block objects into a Sketch Artboard containing styled
 * text, code blocks, tables, images, and separators.
 *
 * Sketch equivalent of Figma's renderer. Key differences:
 *   - Figma: Auto-layout frames (layoutMode, itemSpacing, primaryAxisSizingMode)
 *   - Sketch: Manual Y-position tracking with explicit coordinates
 *   - Figma: figma.createFrame() / figma.createText() / figma.createRectangle()
 *   - Sketch: new sketch.Artboard() / new sketch.Text() / new sketch.ShapePath()
 *   - Figma: layoutAlign='STRETCH' for full-width children
 *   - Sketch: explicit width setting on each layer
 *   - Figma: frame.fills for backgrounds
 *   - Sketch: layer.style.fills for backgrounds
 *
 * Public API:
 *   renderBlocks(name, blocks, settings, document, page, targetArtboard?)
 *     — returns RenderResult { artboard, imageFailures }
 */

import type { Block } from './parser';
import type { PluginSettings } from './settings';
import {
    STYLE_NAMES,
    DEFAULT_STYLES,
    getOrCreateSharedStyle,
    initializeStyles,
    applyInlineStyles,
} from './styles';
import { createTableGroup } from './tables';
import {
    hexToSketchColor,
    TEXT_COLOR,
    ERROR_TEXT_COLOR,
    ERROR_BORDER_COLOR,
    ERROR_BG_COLOR,
    PLACEHOLDER_BG_COLOR,
    WHITE_COLOR,
} from './utils';

const sketch = require('sketch');

/** Result returned by renderBlocks with the rendered artboard and non-fatal warning counts. */
export interface RenderResult {
    artboard: any; // sketch.Artboard
    /** Number of image blocks that failed to load (placeholder shown instead). */
    imageFailures: number;
}

/** Tracks vertical position during layout. */
interface LayoutContext {
    currentY: number;
    contentWidth: number;
}

const BULLET = '\u2022 ';

/**
 * Returns the X coordinate at which a new artboard should be placed so it does
 * not overlap existing page content.
 */
function computeNewArtboardX(page: any, gap: number): number {
    const layers = page.layers;
    if (!layers || layers.length === 0) return 0;

    let rightEdge = -Infinity;
    for (const layer of layers) {
        const right = layer.frame.x + layer.frame.width;
        if (right > rightEdge) rightEdge = right;
    }

    return Math.max(rightEdge, 0) + gap;
}

// ─── Private Helpers ──────────────────────────────────────────────────────────

/**
 * Creates a Sketch image layer from a parsed image block.
 * If the image URL cannot be fetched, returns a placeholder group instead.
 */
function createImageLayer(block: Block, _settings: PluginSettings, ctx: LayoutContext): { layer: any; height: number; isPlaceholder: boolean } {
    if (!block.imageUrl) {
        throw new Error('Invalid image block');
    }


    try {
        // Attempt to fetch the image using NSImage (macOS native)
        const nsUrl = NSURL.URLWithString(block.imageUrl);
        const nsImage = NSImage.alloc().initWithContentsOfURL(nsUrl);

        if (!nsImage) {
            throw new Error('Failed to load image from URL');
        }

        const imageSize = nsImage.size();
        let imgWidth = imageSize.width;
        let imgHeight = imageSize.height;

        // Scale to fit content width
        if (imgWidth > ctx.contentWidth) {
            const scale = ctx.contentWidth / imgWidth;
            imgWidth = ctx.contentWidth;
            imgHeight = Math.round(imgHeight * scale);
        }

        const imageLayer = new sketch.Image({
            name: block.imageAlt || 'Image',
            image: nsImage,
            frame: new sketch.Rectangle(0, 0, imgWidth, imgHeight),
        });

        return { layer: imageLayer, height: imgHeight, isPlaceholder: false };
    } catch (error) {
        console.error(`[MarkDown For What] Failed to load image: ${block.imageUrl}`, error);

        // Create placeholder
        const placeholderHeight = 200;
        const placeholderGroup = new sketch.Group({
            name: `Image Error: ${block.imageAlt || 'Unknown'}`,
            frame: new sketch.Rectangle(0, 0, ctx.contentWidth, placeholderHeight),
        });

        new sketch.ShapePath({
            name: 'Placeholder Background',
            shapeType: sketch.ShapePath.ShapeType.Rectangle,
            frame: new sketch.Rectangle(0, 0, ctx.contentWidth, placeholderHeight),
            style: {
                fills: [{ color: PLACEHOLDER_BG_COLOR, fillType: sketch.Style.FillType.Color }],
                borders: [{
                    color: ERROR_BORDER_COLOR,
                    fillType: sketch.Style.FillType.Color,
                    thickness: 2,
                    position: sketch.Style.BorderPosition.Inside,
                }],
            },
            parent: placeholderGroup,
        });

        new sketch.Text({
            text: `Failed to load image\n${block.imageAlt || 'Unknown'}\nURL: ${block.imageUrl}`,
            frame: new sketch.Rectangle(40, 40, ctx.contentWidth - 80, placeholderHeight - 80),
            style: {
                fontSize: 14,
                fontFamily: 'Inter',
                textColor: ERROR_TEXT_COLOR,
                alignment: sketch.Text.Alignment.center,
                lineHeight: 20,
            },
            parent: placeholderGroup,
        });

        return { layer: placeholderGroup, height: placeholderHeight, isPlaceholder: true };
    }
}

/**
 * Creates a visible error placeholder for a block that failed to render.
 */
function createErrorPlaceholder(block: Block, width: number): { layer: any; height: number } {
    const height = 40;

    const group = new sketch.Group({
        name: `Error: ${block.type}`,
        frame: new sketch.Rectangle(0, 0, width, height),
    });

    new sketch.ShapePath({
        name: 'Error Background',
        shapeType: sketch.ShapePath.ShapeType.Rectangle,
        frame: new sketch.Rectangle(0, 0, width, height),
        style: {
            fills: [{ color: ERROR_BG_COLOR, fillType: sketch.Style.FillType.Color }],
            borders: [{
                color: ERROR_BORDER_COLOR,
                fillType: sketch.Style.FillType.Color,
                thickness: 1,
                position: sketch.Style.BorderPosition.Inside,
            }],
        },
        parent: group,
    });

    new sketch.Text({
        text: `Failed to render block: ${block.type}`,
        frame: new sketch.Rectangle(12, 8, width - 24, height - 16),
        style: {
            fontSize: 12,
            fontFamily: 'Inter',
            textColor: ERROR_TEXT_COLOR,
        },
        parent: group,
    });

    return { layer: group, height };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Renders an array of Block objects into a Sketch Artboard.
 *
 * Creates an artboard with manually positioned child layers, since Sketch
 * doesn't have auto-layout. Tracks a currentY offset and places each block
 * sequentially with the configured blockSpacing between them.
 *
 * @param name           - Name for the root Sketch artboard
 * @param blocks         - Ordered array of Block objects from parseMarkdownToBlocks
 * @param settings       - Plugin settings (spacing, frame dimensions, colors)
 * @param document       - The Sketch Document
 * @param page           - The Sketch Page to add the artboard to
 * @param targetArtboard - Optional existing artboard to replace (for re-import)
 * @returns A RenderResult with the artboard and image failure count
 */
export function renderBlocks(
    name: string,
    blocks: Block[],
    settings: PluginSettings,
    document: any,
    page: any,
    targetArtboard?: any
): RenderResult {

    // Ensure all Markdown/* shared text styles exist
    initializeStyles(document);

    const contentWidth = settings.frameWidth - 2 * settings.framePadding;
    const ctx: LayoutContext = {
        currentY: settings.framePadding,
        contentWidth,
    };

    // Compute placement before creating artboard
    const newX = (!targetArtboard) ? computeNewArtboardX(page, 100) : 0;

    // Create the artboard (final height will be set after all blocks are placed)
    const artboard = new sketch.Artboard({
        name: name,
        frame: new sketch.Rectangle(newX, 0, settings.frameWidth, 100), // Temp height
        parent: page,
    });

    // Set white background
    artboard.background = {
        enabled: true,
        color: WHITE_COLOR,
    };

    let imageFailures = 0;

    // Process blocks
    let i = 0;
    while (i < blocks.length) {
        const block = blocks[i];

        // Group consecutive list blocks with tighter spacing
        if (block.type === 'list') {
            while (i < blocks.length && blocks[i].type === 'list') {
                const listBlock = blocks[i];
                try {
                    const result = renderListBlock(listBlock, settings, document, ctx);
                    result.layer.frame.x = settings.framePadding;
                    result.layer.frame.y = ctx.currentY;
                    result.layer.parent = artboard;
                    ctx.currentY += result.height + settings.listSpacing;
                } catch (err) {
                    console.error('[MarkDown For What] Failed to render list block:', err);
                    const errResult = createErrorPlaceholder(listBlock, contentWidth);
                    errResult.layer.frame.x = settings.framePadding;
                    errResult.layer.frame.y = ctx.currentY;
                    errResult.layer.parent = artboard;
                    ctx.currentY += errResult.height + settings.listSpacing;
                }
                i++;
            }

            // Remove trailing listSpacing, add blockSpacing instead
            ctx.currentY -= settings.listSpacing;
            ctx.currentY += settings.blockSpacing;
            continue;
        }

        // All other block types
        try {
            const result = renderBlock(block, settings, document, ctx);
            if (result) {
                result.layer.frame.x = settings.framePadding;
                result.layer.frame.y = ctx.currentY;
                result.layer.parent = artboard;
                ctx.currentY += result.height + settings.blockSpacing;

                if (block.type === 'image' && result.isPlaceholder) {
                    imageFailures++;
                }
            }
        } catch (err) {
            console.error(`[MarkDown For What] Failed to render block type "${block.type}":`, err);
            const errResult = createErrorPlaceholder(block, contentWidth);
            errResult.layer.frame.x = settings.framePadding;
            errResult.layer.frame.y = ctx.currentY;
            errResult.layer.parent = artboard;
            ctx.currentY += errResult.height + settings.blockSpacing;
        }

        i++;
    }

    // Set final artboard height
    const finalHeight = ctx.currentY - settings.blockSpacing + settings.framePadding;
    artboard.frame.height = Math.max(finalHeight, 100);

    // Handle re-import: replace existing artboard
    if (targetArtboard) {
        artboard.frame.x = targetArtboard.frame.x;
        artboard.frame.y = targetArtboard.frame.y;

        // Insert at same position in layer order
        const layerIndex = page.layers.indexOf(targetArtboard);
        targetArtboard.remove();
        if (layerIndex >= 0 && layerIndex < page.layers.length) {
            page.layers.splice(layerIndex, 0, artboard);
        }
    }

    return { artboard, imageFailures };
}

// ─── Block-level render dispatch ─────────────────────────────────────────────

interface BlockResult {
    layer: any;
    height: number;
    isPlaceholder?: boolean;
}

/**
 * Renders a single non-list block into a Sketch layer.
 */
function renderBlock(
    block: Block,
    settings: PluginSettings,
    document: any,
    ctx: LayoutContext
): BlockResult | null {

    switch (block.type) {
        case 'heading': {
            let styleName: string;
            if (block.level === 1) styleName = STYLE_NAMES.H1;
            else if (block.level === 2) styleName = STYLE_NAMES.H2;
            else styleName = STYLE_NAMES.H3;
            return renderTextBlock(block, styleName, settings, document, ctx);
        }

        case 'paragraph': {
            return renderTextBlock(block, STYLE_NAMES.BODY, settings, document, ctx);
        }

        case 'quote': {
            return renderTextBlock(block, STYLE_NAMES.QUOTE, settings, document, ctx);
        }

        case 'code': {
            return renderCodeBlock(block, settings, document, ctx);
        }

        case 'separator': {
            return renderSeparator(settings, ctx);
        }

        case 'table': {
            const tableGroup = createTableGroup(block, settings, document);
            const height = tableGroup.frame.height;
            return { layer: tableGroup, height };
        }

        case 'image': {
            const result = createImageLayer(block, settings, ctx);
            return { layer: result.layer, height: result.height, isPlaceholder: result.isPlaceholder };
        }

        default:
            console.warn(`[MarkDown For What] Unknown block type: "${(block as { type: string }).type}" — skipping`);
            return null;
    }
}

/**
 * Renders a text block (heading, paragraph, quote) into a Sketch Text layer.
 */
function renderTextBlock(
    block: Block,
    styleName: string,
    _settings: PluginSettings,
    document: any,
    ctx: LayoutContext
): BlockResult {
    const config = DEFAULT_STYLES[styleName] ?? DEFAULT_STYLES[STYLE_NAMES.BODY];
    const sharedStyle = getOrCreateSharedStyle(document, styleName, config);
    const lineHeightPx = Math.round(config.size * config.lineHeight);

    const content = block.content || '';

    const textLayer = new sketch.Text({
        text: content,
        frame: new sketch.Rectangle(0, 0, ctx.contentWidth, lineHeightPx),
        fixedWidth: true,
        style: {
            fontSize: config.size,
            fontFamily: config.family,
            fontWeight: config.style.includes('Bold') ? 9 : 5,
            fontStyle: config.style.includes('Italic') ? 'italic' : undefined,
            lineHeight: lineHeightPx,
            textColor: TEXT_COLOR,
        },
    });

    // Link to shared style
    if (sharedStyle) {
        textLayer.sharedStyleId = sharedStyle.id;
    }

    // Apply inline formatting (bold, italic, code within text)
    if (block.tokens) {
        applyInlineStyles(textLayer, block.tokens, styleName);
    }

    // Adjust to actual rendered height
    textLayer.adjustToFit();
    const actualHeight = textLayer.frame.height;

    return { layer: textLayer, height: actualHeight };
}

/**
 * Renders a list item as a Text layer with bullet prefix.
 */
function renderListBlock(
    block: Block,
    _settings: PluginSettings,
    document: any,
    ctx: LayoutContext
): BlockResult {
    const config = DEFAULT_STYLES[STYLE_NAMES.LIST];
    const sharedStyle = getOrCreateSharedStyle(document, STYLE_NAMES.LIST, config);
    const lineHeightPx = Math.round(config.size * config.lineHeight);

    const content = block.content ? `${BULLET}${block.content}` : BULLET.trimEnd();

    const textLayer = new sketch.Text({
        text: content,
        frame: new sketch.Rectangle(0, 0, ctx.contentWidth, lineHeightPx),
        fixedWidth: true,
        style: {
            fontSize: config.size,
            fontFamily: config.family,
            fontWeight: 5,
            lineHeight: lineHeightPx,
            textColor: TEXT_COLOR,
        },
    });

    if (sharedStyle) {
        textLayer.sharedStyleId = sharedStyle.id;
    }

    // Apply inline formatting if tokens are present
    if (block.tokens && block.tokens.length > 0) {
        const bulletToken = { type: 'text', raw: BULLET, text: BULLET } as any;
        applyInlineStyles(textLayer, [bulletToken, ...block.tokens], STYLE_NAMES.LIST);
    }

    textLayer.adjustToFit();
    const actualHeight = textLayer.frame.height;

    return { layer: textLayer, height: actualHeight };
}

/**
 * Renders a code block as a Group with background rectangle and monospace text.
 */
function renderCodeBlock(
    block: Block,
    settings: PluginSettings,
    document: any,
    ctx: LayoutContext
): BlockResult {
    const config = DEFAULT_STYLES[STYLE_NAMES.CODE];
    const sharedStyle = getOrCreateSharedStyle(document, STYLE_NAMES.CODE, config);
    const lineHeightPx = Math.round(config.size * config.lineHeight);

    const codePadding = 16;
    const codeContentWidth = ctx.contentWidth - 2 * codePadding;
    const content = block.content || '';
    // Use a reasonable initial height; adjustToFit() below will correct it
    const initialHeight = lineHeightPx + 2 * codePadding;

    const codeGroup = new sketch.Group({
        name: 'Code Block',
        frame: new sketch.Rectangle(0, 0, ctx.contentWidth, initialHeight),
    });

    const bg = new sketch.ShapePath({
        name: 'Code Background',
        shapeType: sketch.ShapePath.ShapeType.Rectangle,
        frame: new sketch.Rectangle(0, 0, ctx.contentWidth, initialHeight),
        style: {
            fills: [{ color: hexToSketchColor(settings.codeBackground), fillType: sketch.Style.FillType.Color }],
            borders: [],
        },
        parent: codeGroup,
    });

    try {
        const points = bg.points;
        if (points) {
            for (const point of points) {
                point.cornerRadius = 8;
            }
        }
    } catch (e) {
        // Corner radius manipulation may not be available in all Sketch versions
    }

    const textLayer = new sketch.Text({
        text: content,
        frame: new sketch.Rectangle(codePadding, codePadding, codeContentWidth, lineHeightPx),
        fixedWidth: true,
        style: {
            fontSize: config.size,
            fontFamily: config.family,
            lineHeight: lineHeightPx,
            textColor: TEXT_COLOR,
        },
        parent: codeGroup,
    });

    if (sharedStyle) {
        textLayer.sharedStyleId = sharedStyle.id;
    }

    textLayer.adjustToFit();
    const actualTotalHeight = textLayer.frame.height + 2 * codePadding;
    codeGroup.frame.height = actualTotalHeight;
    bg.frame.height = actualTotalHeight;

    return { layer: codeGroup, height: actualTotalHeight };
}

/**
 * Renders a horizontal separator line.
 */
function renderSeparator(settings: PluginSettings, ctx: LayoutContext): BlockResult {
    const line = new sketch.ShapePath({
        name: 'Separator',
        shapeType: sketch.ShapePath.ShapeType.Rectangle,
        frame: new sketch.Rectangle(0, 0, ctx.contentWidth, 1),
        style: {
            fills: [{ color: hexToSketchColor(settings.separatorColor), fillType: sketch.Style.FillType.Color }],
            borders: [],
        },
    });

    return { layer: line, height: 1 };
}
