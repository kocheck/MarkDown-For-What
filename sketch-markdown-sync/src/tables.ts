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

// ─── Constants ──────────────────────────────────────────────────────────────────

const HEADER_PADDING_V = 12;
const HEADER_PADDING_H = 16;
const DATA_PADDING_V = 10;
const DATA_PADDING_H = 16;
const BORDER_WIDTH = 1;

// ─── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Converts a nullable Markdown table alignment value to a Sketch Text alignment constant.
 */
export function resolveAlignment(align: 'left' | 'center' | 'right' | null | undefined): number {
    const sketch = require('sketch');
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
    const sketch = require('sketch');
    const line = new sketch.ShapePath({
        name: 'Border',
        frame: new sketch.Rectangle(x, y, Math.max(width, 1), Math.max(height, 1)),
        style: {
            fills: [{ color: color, fillType: sketch.Style.FillType.Color }],
            borders: [],
        },
        parent: parent,
    });
    return line;
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

    const sketch = require('sketch');
    const numCols = block.header.length;
    const contentWidth = settings.frameWidth - 2 * settings.framePadding;
    const colWidth = Math.floor(contentWidth / numCols);
    const tableWidth = colWidth * numCols;

    const bodyConfig = DEFAULT_STYLES[STYLE_NAMES.BODY];

    // Calculate row heights based on content
    const headerHeight = estimateHeaderRowHeight(block.header, colWidth, bodyConfig);
    const rowHeights = block.rows.map(row =>
        estimateDataRowHeight(row, colWidth, bodyConfig)
    );

    const totalHeight = headerHeight +
        rowHeights.reduce((sum, h) => sum + h, 0) +
        BORDER_WIDTH; // outer border

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
                color: '#ccccccff',
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
            fills: [{ color: settings.tableHeaderBackground + 'ff', fillType: sketch.Style.FillType.Color }],
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
                fontWeight: 9, // Bold
                lineHeight: Math.round(bodyConfig.size * bodyConfig.lineHeight),
                textColor: '#000000ff',
                alignment: resolveAlignment(block.align?.[i]),
            },
            parent: tableGroup,
        });

        // Apply shared style if available
        const sharedStyle = getOrCreateSharedStyle(document, STYLE_NAMES.BODY, bodyConfig);
        if (sharedStyle) {
            textLayer.sharedStyleId = sharedStyle.id;
            // Override to bold for header
            textLayer.style.fontWeight = 9;
        }

        // Column separator (except last column)
        if (i < numCols - 1) {
            const borderX = (i + 1) * colWidth;
            createBorderLine(borderX, 0, BORDER_WIDTH, headerHeight, '#ccccccff', tableGroup);
        }
    }

    // Header bottom border
    createBorderLine(0, headerHeight, tableWidth, BORDER_WIDTH, '#ccccccff', tableGroup);

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
                    fontWeight: 5, // Regular
                    lineHeight: Math.round(bodyConfig.size * bodyConfig.lineHeight),
                    textColor: '#000000ff',
                    alignment: resolveAlignment(block.align?.[colIndex]),
                },
                parent: tableGroup,
            });

            const sharedStyle = getOrCreateSharedStyle(document, STYLE_NAMES.BODY, bodyConfig);
            if (sharedStyle) {
                textLayer.sharedStyleId = sharedStyle.id;
            }

            // Column separator (except last column)
            if (colIndex < row.length - 1) {
                const borderX = (colIndex + 1) * colWidth;
                createBorderLine(borderX, currentY, BORDER_WIDTH, rowHeight, '#e6e6e6ff', tableGroup);
            }
        }

        // Row bottom border
        currentY += rowHeight;
        if (rowIndex < block.rows.length - 1) {
            createBorderLine(0, currentY, tableWidth, BORDER_WIDTH, '#e6e6e6ff', tableGroup);
        }
    }

    return tableGroup;
}

// ─── Height estimation helpers ───────────────────────────────────────────────

function estimateHeaderRowHeight(
    header: any[],
    colWidth: number,
    config: { size: number; lineHeight: number }
): number {
    const textWidth = colWidth - 2 * HEADER_PADDING_H;
    let maxHeight = 0;
    for (const cell of header) {
        const h = estimateTextHeight(cell.text, textWidth, config.size, config.lineHeight);
        if (h > maxHeight) maxHeight = h;
    }
    return maxHeight + 2 * HEADER_PADDING_V;
}

function estimateDataRowHeight(
    row: any[],
    colWidth: number,
    config: { size: number; lineHeight: number }
): number {
    const textWidth = colWidth - 2 * DATA_PADDING_H;
    let maxHeight = 0;
    for (const cell of row) {
        const h = estimateTextHeight(cell.text, textWidth, config.size, config.lineHeight);
        if (h > maxHeight) maxHeight = h;
    }
    return maxHeight + 2 * DATA_PADDING_V;
}
