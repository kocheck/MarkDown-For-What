/**
 * Unit tests for tables.ts and related utilities.
 * Tests guard clauses in createTableFrame and pure utility functions.
 *
 * Full Figma API integration is not tested here because the mock in test-setup.ts
 * only provides stub implementations. Guard clause tests are safe because the
 * function throws before calling any Figma API.
 */

import { createTableFrame } from './tables';
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
