/**
 * Unit tests for tables.ts and related utilities.
 * Tests guard clauses in createTableFrame and pure utility functions.
 *
 * Full Figma API integration is not tested here because the mock in test-setup.ts
 * only provides stub implementations. Guard clause tests are safe because the
 * function throws before calling any Figma API.
 */

import { createTableFrame, resolveAlignment, applyRightBorderOnly } from './tables';
import { DEFAULT_SETTINGS } from './settings';
import type { Block } from './parser';
import { hexToRgb } from './utils';

describe('createTableFrame', () => {
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

describe('applyRightBorderOnly', () => {
    it('sets all 6 stroke properties correctly', () => {
        const frame = {
            strokes: [],
            strokeAlign: '',
            strokeWeight: 0,
            strokeRightWeight: 0,
            strokeTopWeight: 0,
            strokeBottomWeight: 0,
            strokeLeftWeight: 0,
        } as any;
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
});
