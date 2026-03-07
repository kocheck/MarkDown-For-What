/**
 * Unit tests for tables.ts
 * Tests guard clauses in createTableFrame.
 *
 * Full Figma API integration is not tested here because the mock in test-setup.ts
 * only provides stub implementations. Guard clause tests are safe because the
 * function throws before calling any Figma API.
 */

import { createTableFrame } from './tables';
import { DEFAULT_SETTINGS } from './settings';
import type { Block } from './parser';

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
