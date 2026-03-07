/**
 * Unit tests for tables.ts and related utilities.
 * Tests guard clauses in createTableFrame and pure utility functions.
 *
 * Tests guard clauses, happy path (layoutGrow, row count), and pure utility functions.
 */

import { createTableFrame, resolveAlignment, applyRightBorderOnly, applyBottomBorderOnly } from './tables';
import { DEFAULT_SETTINGS } from './settings';
import type { Block } from './parser';
import { hexToRgb, errorMessage } from './utils';

describe('createTableFrame', () => {
    describe('happy path', () => {
        beforeEach(() => {
            jest.clearAllMocks();
            (figma.loadFontAsync as jest.Mock).mockResolvedValue(undefined);
            const mockStyle: any = { id: 'style-id', name: '', fontName: {}, fontSize: 0, lineHeight: {} };
            (figma.getLocalTextStyles as jest.Mock).mockReturnValue([]);
            (figma.createTextStyle as jest.Mock).mockReturnValue(mockStyle);
        });

        it('creates header cells with layoutGrow=1 for equal column widths', async () => {
            const block: Block = {
                type: 'table',
                header: [
                    { text: 'Col A', tokens: [] },
                    { text: 'Col B', tokens: [] },
                ],
                align: ['left', 'right'],
                rows: [[{ text: 'Cell 1', tokens: [] }, { text: 'Cell 2', tokens: [] }]],
            };
            const tableFrame = await createTableFrame(block, DEFAULT_SETTINGS);
            const headerRow = tableFrame.children[0] as any;
            expect(headerRow.name).toBe('Header Row');
            headerRow.children.forEach((cell: any) => {
                expect(cell.layoutGrow).toBe(1);
            });
        });

        it('creates the correct number of rows (1 header + N data)', async () => {
            const block: Block = {
                type: 'table',
                header: [{ text: 'Col', tokens: [] }],
                align: [null],
                rows: [
                    [{ text: 'Row 1', tokens: [] }],
                    [{ text: 'Row 2', tokens: [] }],
                    [{ text: 'Row 3', tokens: [] }],
                ],
            };
            const tableFrame = await createTableFrame(block, DEFAULT_SETTINGS);
            expect(tableFrame.children).toHaveLength(4); // 1 header + 3 data rows
        });
    });

    describe('guard clauses', () => {
        test('throws when block.header is missing', async () => {
            const block: Block = {
                type: 'table',
                rows: [[{ text: 'cell', tokens: [] }]],
            };
            await expect(createTableFrame(block, DEFAULT_SETTINGS)).rejects.toThrow(
                'Invalid table block: missing header or rows'
            );
        });

        test('throws when block.rows is missing', async () => {
            const block: Block = {
                type: 'table',
                header: [{ text: 'Header', tokens: [] }],
            };
            await expect(createTableFrame(block, DEFAULT_SETTINGS)).rejects.toThrow(
                'Invalid table block: missing header or rows'
            );
        });
    });
});

describe('resolveAlignment', () => {
    it('returns LEFT for null', () => {
        expect(resolveAlignment(null)).toBe('LEFT');
    });

    it('returns LEFT for undefined', () => {
        expect(resolveAlignment(undefined)).toBe('LEFT');
    });

    it('returns LEFT for "left"', () => {
        expect(resolveAlignment('left')).toBe('LEFT');
    });

    it('returns CENTER for "center"', () => {
        expect(resolveAlignment('center')).toBe('CENTER');
    });

    it('returns RIGHT for "right"', () => {
        expect(resolveAlignment('right')).toBe('RIGHT');
    });
});

function makeMockStrokeFrame() {
    return {
        strokes: [] as any[],
        strokeAlign: '' as string,
        strokeWeight: 0,
        strokeRightWeight: 0,
        strokeTopWeight: 0,
        strokeBottomWeight: 0,
        strokeLeftWeight: 0,
    };
}

describe('applyRightBorderOnly', () => {
    it('sets all 6 stroke properties correctly', () => {
        const frame = makeMockStrokeFrame() as any;
        const color: RGB = { r: 0.8, g: 0.8, b: 0.8 };
        applyRightBorderOnly(frame, color);
        expect(frame.strokes).toEqual([{ type: 'SOLID', color }]);
        expect(frame.strokeAlign).toBe('CENTER');
        expect(frame.strokeWeight).toBe(1);
        expect(frame.strokeRightWeight).toBe(1);
        expect(frame.strokeTopWeight).toBe(0);
        expect(frame.strokeBottomWeight).toBe(0);
        expect(frame.strokeLeftWeight).toBe(0);
    });
});

describe('applyBottomBorderOnly', () => {
    it('sets all 6 stroke properties correctly', () => {
        const frame = makeMockStrokeFrame() as any;
        const color: RGB = { r: 0.9, g: 0.9, b: 0.9 };
        applyBottomBorderOnly(frame, color);
        expect(frame.strokes).toEqual([{ type: 'SOLID', color }]);
        expect(frame.strokeAlign).toBe('CENTER');
        expect(frame.strokeWeight).toBe(1);
        expect(frame.strokeBottomWeight).toBe(1);
        expect(frame.strokeTopWeight).toBe(0);
        expect(frame.strokeLeftWeight).toBe(0);
        expect(frame.strokeRightWeight).toBe(0);
    });
});

describe('errorMessage', () => {
    it('extracts message from an Error instance', () => {
        expect(errorMessage(new Error('oops'))).toBe('oops');
    });

    it('stringifies non-Error values', () => {
        expect(errorMessage('raw string')).toBe('raw string');
        expect(errorMessage(42)).toBe('42');
    });

    it('handles null and undefined', () => {
        expect(errorMessage(null)).toBe('null');
        expect(errorMessage(undefined)).toBe('undefined');
    });
});

describe('hexToRgb', () => {
    test('converts #FF0000 to red', () => {
        expect(hexToRgb('#FF0000')).toEqual({ r: 1, g: 0, b: 0 });
    });

    test('converts #000000 to black', () => {
        expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
    });

    test('converts #FFFFFF to white', () => {
        expect(hexToRgb('#FFFFFF')).toEqual({ r: 1, g: 1, b: 1 });
    });

    test('handles hex string without # prefix', () => {
        expect(hexToRgb('FF0000')).toEqual({ r: 1, g: 0, b: 0 });
    });

    test('throws on invalid hex string', () => {
        expect(() => hexToRgb('#GGG')).toThrow('Invalid hex color: #GGG');
        expect(() => hexToRgb('')).toThrow();
        expect(() => hexToRgb('#12345')).toThrow();
    });
});
