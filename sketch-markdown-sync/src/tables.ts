/**
 * tables.ts
 *
 * Creates Sketch layer groups representing Markdown tables.
 *
 * Sketch equivalent of Figma's table rendering. Key differences:
 *   - Figma: Nested auto-layout frames with layoutGrow for equal columns
 *   - Sketch: Manual positioning with calculated column widths and row heights
 *   - Figma: Individual stroke weights (strokeRightWeight, strokeBottomWeight)
 *   - Sketch: ShapePath rectangles for cell borders
 *   - Figma: frame.fills for background colors
 *   - Sketch: ShapePath background rectangles behind content
 *
 * Public API:
 *   resolveAlignment(align)            — converts markdown align to Sketch constant
 *   createTableGroup(block, settings, document) — returns a Sketch Group
 */

import type { Block } from './parser';
import type { PluginSettings } from './settings';
import { STYLE_NAMES, DEFAULT_STYLES, getOrCreateSharedStyle, estimateTextHeight } from './styles';
import { hexToSketchColor, TEXT_COLOR, TABLE_BORDER_COLOR, TABLE_ROW_BORDER_COLOR } from './utils';

const sketch = require('sketch');

// ─── Constants ──────────────────────────────────────────────────────────────────

const HEADER_PADDING_V = 12;
const HEADER_PADDING_H = 16;
const DATA_PADDING_V = 10;
const DATA_PADDING_H = 16;
const BORDER_WIDTH = 1;

const FONT_WEIGHT_REGULAR = 5;
const FONT_WEIGHT_BOLD = 9;

// ─── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Converts a nullable Markdown table alignment value to a Sketch Text alignment constant.
 */
export function resolveAlignment(align: 'left' | 'center' | 'right' | null | undefined): number {
    if (align === 'center') return sketch.Text.Alignment.center;
    if (align === 'right') return sketch.Text.Alignment.right;
    return sketch.Text.Alignment.left;
}

/**
 * Creates a 1px horizontal or vertical line (ShapePath) for table borders.
 */
function createBorderLine(
    x: number, y: number, width: number, height: number,
    color: string, parent: any
): any {
    return new sketch.ShapePath({
        name: 'Border',
        frame: new sketch.Rectangle(x, y, Math.max(width, 1), Math.max(height, 1)),
        style: {
            fills: [{ color: color, fillType: sketch.Style.FillType.Color }],
            borders: [],
        },
        parent: parent,
    });
}

/**
 * Estimates the max row height across all cells in a row.
 */
function estimateRowHeight(
    cells: any[],
    colWidth: number,
    config: { size: number; lineHeight: number },
    paddingH: number,
    paddingV: number,
): number {
    const textWidth = colWidth - 2 * paddingH;
    let maxHeight = 0;
    for (const cell of cells) {
        const h = estimateTextHeight(cell.text, textWidth, config.size, config.lineHeight);
        if (h > maxHeight) maxHeight = h;
    }
    return maxHeight + 2 * paddingV;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Builds a complete Sketch table group from a parsed table Block.
 *
 * Structure:
 *   tableGroup (Group)
 *     ├─ outerBorder (ShapePath - table border)
 *     ├─ headerBackground (ShapePath - header row background)
 *     ├─ headerText × N (Text layers for each header cell)
 *     ├─ dataText × M×N (Text layers for each data cell)
 *     └─ borderLines (ShapePath lines for cell borders)
 *
 * @param block    - A Block with type==='table', header, align, and rows
 * @param settings - Current plugin settings
 * @param document - The Sketch Document
 * @returns A positioned Group containing all table elements
 */
export function createTableGroup(block: Block, settings: PluginSettings, document: any): any {
    if (!block.header || !block.rows) {
        throw new Error('Invalid table block: missing header or rows');
    }

    const numCols = block.header.length;
    const contentWidth = settings.frameWidth - 2 * settings.framePadding;
    const colWidth = Math.floor(contentWidth / numCols);
    const tableWidth = colWidth * numCols;

    const bodyConfig = DEFAULT_STYLES[STYLE_NAMES.BODY];
    const lineHeightPx = Math.round(bodyConfig.size * bodyConfig.lineHeight);

    // Look up shared style once, not per-cell
    const bodySharedStyle = getOrCreateSharedStyle(document, STYLE_NAMES.BODY, bodyConfig);

    // Calculate row heights based on content
    const headerHeight = estimateRowHeight(block.header, colWidth, bodyConfig, HEADER_PADDING_H, HEADER_PADDING_V);
    const rowHeights = block.rows.map(row =>
        estimateRowHeight(row, colWidth, bodyConfig, DATA_PADDING_H, DATA_PADDING_V)
    );

    const totalHeight = headerHeight +
        rowHeights.reduce((sum, h) => sum + h, 0) +
        BORDER_WIDTH;

    // Create table group
    const tableGroup = new sketch.Group({
        name: 'Table',
        frame: new sketch.Rectangle(0, 0, tableWidth, totalHeight),
    });

    // Outer border
    new sketch.ShapePath({
        name: 'Table Border',
        shapeType: sketch.ShapePath.ShapeType.Rectangle,
        frame: new sketch.Rectangle(0, 0, tableWidth, totalHeight),
        style: {
            fills: [],
            borders: [{
                color: TABLE_BORDER_COLOR,
                fillType: sketch.Style.FillType.Color,
                thickness: 1,
                position: sketch.Style.BorderPosition.Inside,
            }],
        },
        parent: tableGroup,
    });

    // Header background
    new sketch.ShapePath({
        name: 'Header Background',
        shapeType: sketch.ShapePath.ShapeType.Rectangle,
        frame: new sketch.Rectangle(0, 0, tableWidth, headerHeight),
        style: {
            fills: [{ color: hexToSketchColor(settings.tableHeaderBackground), fillType: sketch.Style.FillType.Color }],
            borders: [],
        },
        parent: tableGroup,
    });

    // Header cells
    for (let i = 0; i < numCols; i++) {
        const cell = block.header[i];
        const cellX = i * colWidth + HEADER_PADDING_H;
        const textWidth = colWidth - 2 * HEADER_PADDING_H;

        const textLayer = new sketch.Text({
            text: cell.text,
            frame: new sketch.Rectangle(cellX, HEADER_PADDING_V, textWidth, headerHeight - 2 * HEADER_PADDING_V),
            style: {
                fontSize: bodyConfig.size,
                fontFamily: bodyConfig.family,
                fontWeight: FONT_WEIGHT_BOLD,
                lineHeight: lineHeightPx,
                textColor: TEXT_COLOR,
                alignment: resolveAlignment(block.align?.[i]),
            },
            parent: tableGroup,
        });

        if (bodySharedStyle) {
            textLayer.sharedStyleId = bodySharedStyle.id;
            textLayer.style.fontWeight = FONT_WEIGHT_BOLD;
        }

        if (i < numCols - 1) {
            createBorderLine((i + 1) * colWidth, 0, BORDER_WIDTH, headerHeight, TABLE_BORDER_COLOR, tableGroup);
        }
    }

    // Header bottom border
    createBorderLine(0, headerHeight, tableWidth, BORDER_WIDTH, TABLE_BORDER_COLOR, tableGroup);

    // Data rows
    let currentY = headerHeight;
    for (let rowIndex = 0; rowIndex < block.rows.length; rowIndex++) {
        const row = block.rows[rowIndex];
        const rowHeight = rowHeights[rowIndex];

        for (let colIndex = 0; colIndex < row.length; colIndex++) {
            const cell = row[colIndex];
            const cellX = colIndex * colWidth + DATA_PADDING_H;
            const textWidth = colWidth - 2 * DATA_PADDING_H;

            const textLayer = new sketch.Text({
                text: cell.text,
                frame: new sketch.Rectangle(cellX, currentY + DATA_PADDING_V, textWidth, rowHeight - 2 * DATA_PADDING_V),
                style: {
                    fontSize: bodyConfig.size,
                    fontFamily: bodyConfig.family,
                    fontWeight: FONT_WEIGHT_REGULAR,
                    lineHeight: lineHeightPx,
                    textColor: TEXT_COLOR,
                    alignment: resolveAlignment(block.align?.[colIndex]),
                },
                parent: tableGroup,
            });

            if (bodySharedStyle) {
                textLayer.sharedStyleId = bodySharedStyle.id;
            }

            if (colIndex < row.length - 1) {
                createBorderLine((colIndex + 1) * colWidth, currentY, BORDER_WIDTH, rowHeight, TABLE_ROW_BORDER_COLOR, tableGroup);
            }
        }

        currentY += rowHeight;
        if (rowIndex < block.rows.length - 1) {
            createBorderLine(0, currentY, tableWidth, BORDER_WIDTH, TABLE_ROW_BORDER_COLOR, tableGroup);
        }
    }

    return tableGroup;
}
