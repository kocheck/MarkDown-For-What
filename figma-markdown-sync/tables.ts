/**
 * tables.ts
 *
 * Creates Figma Auto Layout frames representing Markdown tables.
 *
 * Table rendering is isolated here because it involves nested frame structures,
 * per-cell text alignment, and border simulation via individual stroke weights —
 * complexity that would clutter renderer.ts.
 *
 * Column width behavior: each cell uses layoutGrow=1 inside a FIXED-width parent
 * row frame. This makes all columns fill available space equally in Figma's
 * auto-layout system, avoiding the "squished columns" problem.
 *
 * Public API:
 *   resolveAlignment(align)          — converts markdown align to Figma alignment constant
 *   applyRightBorderOnly(frame, color) — applies a right-only border via individual stroke weights
 *   createTableFrame(block, settings) — async: returns a FrameNode
 */

import type { Block } from './parser';
import type { PluginSettings } from './settings';
import { getOrCreateTextStyle, loadFont, STYLE_NAMES, DEFAULT_STYLES } from './styles';
import { hexToRgb } from './utils';

/**
 * Converts a nullable Markdown table alignment value to a Figma text alignment constant.
 * Returns 'LEFT' for null or undefined (left-align is the default).
 */
export function resolveAlignment(align: 'left' | 'center' | 'right' | null | undefined): 'LEFT' | 'CENTER' | 'RIGHT' {
    if (align === 'center') return 'CENTER';
    if (align === 'right') return 'RIGHT';
    return 'LEFT';
}

/**
 * Applies a 1px right-side-only border to a FrameNode using individual stroke weights.
 * Setting strokeWeight alone applies to all four sides — individual weights must be
 * explicitly zeroed out to achieve a single-side border in Figma's auto-layout system.
 */
export function applyRightBorderOnly(frame: FrameNode, color: RGB): void {
    frame.strokes = [{ type: 'SOLID', color }];
    frame.strokeAlign = 'CENTER';
    frame.strokeWeight = 1;
    frame.strokeRightWeight = 1;
    frame.strokeTopWeight = 0;
    frame.strokeBottomWeight = 0;
    frame.strokeLeftWeight = 0;
}

/**
 * Builds a complete Figma table from a parsed table Block.
 *
 * Structure:
 *   tableFrame (VERTICAL, FIXED width from settings)
 *     └─ headerRow (HORIZONTAL, STRETCH)
 *          └─ headerCell × N  (layoutGrow=1, equal width fill)
 *               └─ TextNode (bold)
 *     └─ dataRow × M (HORIZONTAL, STRETCH)
 *          └─ dataCell × N  (layoutGrow=1, equal width fill)
 *               └─ TextNode
 *
 * @param block    - A Block with type==='table', header, align, and rows
 * @param settings - Current plugin settings (provides tableHeaderBackground)
 * @returns A fully constructed FrameNode
 * @throws If the block is missing header or rows
 */
export async function createTableFrame(block: Block, settings: PluginSettings): Promise<FrameNode> {
    if (!block.header || !block.rows) {
        throw new Error('Invalid table block: missing header or rows');
    }

    const bodyStyle = await getOrCreateTextStyle(STYLE_NAMES.BODY, DEFAULT_STYLES[STYLE_NAMES.BODY]);
    const bodyConfig = DEFAULT_STYLES[STYLE_NAMES.BODY];
    const headerFont = await loadFont(bodyConfig.family, 'Bold');

    const headerBg = hexToRgb(settings.tableHeaderBackground);
    const borderColor: RGB = { r: 0.8, g: 0.8, b: 0.8 };
    const rowBorderColor: RGB = { r: 0.9, g: 0.9, b: 0.9 };

    // ── Root table frame ──────────────────────────────────────────────────────
    const tableFrame = figma.createFrame();
    tableFrame.name = 'Table';
    tableFrame.layoutMode = 'VERTICAL';
    tableFrame.itemSpacing = 0;
    tableFrame.primaryAxisSizingMode = 'AUTO';
    tableFrame.counterAxisSizingMode = 'FIXED';
    tableFrame.layoutAlign = 'STRETCH';
    tableFrame.strokes = [{ type: 'SOLID', color: borderColor }];
    tableFrame.strokeAlign = 'CENTER';
    tableFrame.strokeWeight = 1;

    // ── Header row ────────────────────────────────────────────────────────────
    const headerRow = figma.createFrame();
    headerRow.name = 'Header Row';
    headerRow.layoutMode = 'HORIZONTAL';
    headerRow.itemSpacing = 0;
    headerRow.primaryAxisSizingMode = 'FIXED';
    headerRow.counterAxisSizingMode = 'AUTO';
    headerRow.layoutAlign = 'STRETCH';
    headerRow.fills = [{ type: 'SOLID', color: headerBg }];

    for (let i = 0; i < block.header.length; i++) {
        const cell = block.header[i];
        const cellFrame = figma.createFrame();
        cellFrame.name = `Header Cell ${i + 1}`;
        cellFrame.layoutMode = 'HORIZONTAL';
        cellFrame.paddingTop = 12;
        cellFrame.paddingBottom = 12;
        cellFrame.paddingLeft = 16;
        cellFrame.paddingRight = 16;
        cellFrame.primaryAxisSizingMode = 'FIXED';
        cellFrame.counterAxisSizingMode = 'AUTO';
        cellFrame.layoutGrow = 1; // Equal column widths via fill

        if (i < block.header.length - 1) {
            applyRightBorderOnly(cellFrame, borderColor);
        }

        const textNode = figma.createText();
        textNode.textStyleId = bodyStyle.id;  // link to Markdown/Body style
        textNode.fontName = headerFont;       // override to bold after linking
        textNode.layoutAlign = 'STRETCH';
        textNode.characters = cell.text;

        textNode.textAlignHorizontal = resolveAlignment(block.align?.[i]);

        cellFrame.appendChild(textNode);
        headerRow.appendChild(cellFrame);
    }
    tableFrame.appendChild(headerRow);

    // ── Data rows ─────────────────────────────────────────────────────────────
    for (let rowIndex = 0; rowIndex < block.rows.length; rowIndex++) {
        const row = block.rows[rowIndex];
        const rowFrame = figma.createFrame();
        rowFrame.name = `Row ${rowIndex + 1}`;
        rowFrame.layoutMode = 'HORIZONTAL';
        rowFrame.itemSpacing = 0;
        rowFrame.primaryAxisSizingMode = 'FIXED';
        rowFrame.counterAxisSizingMode = 'AUTO';
        rowFrame.layoutAlign = 'STRETCH';
        rowFrame.strokes = [{ type: 'SOLID', color: rowBorderColor }];
        rowFrame.strokeAlign = 'CENTER';
        rowFrame.strokeWeight = 1;
        rowFrame.strokeBottomWeight = 1;
        rowFrame.strokeTopWeight = 0;
        rowFrame.strokeLeftWeight = 0;
        rowFrame.strokeRightWeight = 0;

        for (let colIndex = 0; colIndex < row.length; colIndex++) {
            const cell = row[colIndex];
            const cellFrame = figma.createFrame();
            cellFrame.name = `Cell ${rowIndex + 1},${colIndex + 1}`;
            cellFrame.layoutMode = 'HORIZONTAL';
            cellFrame.paddingTop = 10;
            cellFrame.paddingBottom = 10;
            cellFrame.paddingLeft = 16;
            cellFrame.paddingRight = 16;
            cellFrame.primaryAxisSizingMode = 'FIXED';
            cellFrame.counterAxisSizingMode = 'AUTO';
            cellFrame.layoutGrow = 1; // Equal column widths via fill

            if (colIndex < row.length - 1) {
                applyRightBorderOnly(cellFrame, rowBorderColor);
            }

            const textNode = figma.createText();
            textNode.textStyleId = bodyStyle.id;
            textNode.layoutAlign = 'STRETCH';
            textNode.characters = cell.text;

            textNode.textAlignHorizontal = resolveAlignment(block.align?.[colIndex]);

            cellFrame.appendChild(textNode);
            rowFrame.appendChild(cellFrame);
        }
        tableFrame.appendChild(rowFrame);
    }

    return tableFrame;
}
