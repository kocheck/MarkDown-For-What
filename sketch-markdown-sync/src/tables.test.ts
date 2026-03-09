/**
 * Unit tests for table rendering.
 * Tests createTableGroup with mocked Sketch APIs.
 */

import { createTableGroup } from './tables';
import { DEFAULT_SETTINGS } from './settings';
import type { Block } from './parser';

function createMockDocument() {
    return {
        sharedTextStyles: [] as any[],
    };
}

// Helper to create table cell objects compatible with marked.Tokens.TableCell
function cell(text: string, align: 'left' | 'center' | 'right' = 'left'): any {
    return { text, tokens: [], header: false, align };
}

function headerCell(text: string, align: 'left' | 'center' | 'right' = 'left'): any {
    return { text, tokens: [], header: true, align };
}

describe('createTableGroup', () => {
    let mockDocument: any;

    beforeEach(() => {
        mockDocument = createMockDocument();
    });

    it('throws on missing header', () => {
        const block: Block = {
            type: 'table',
            rows: [],
        };
        expect(() => createTableGroup(block, DEFAULT_SETTINGS, mockDocument)).toThrow(
            'Invalid table block',
        );
    });

    it('throws on missing rows', () => {
        const block: Block = {
            type: 'table',
            header: [headerCell('Col 1')],
        };
        expect(() => createTableGroup(block, DEFAULT_SETTINGS, mockDocument)).toThrow(
            'Invalid table block',
        );
    });

    it('renders a valid table block without throwing', () => {
        const block: Block = {
            type: 'table',
            header: [headerCell('Name'), headerCell('Value')],
            align: ['left', 'left'],
            rows: [[cell('foo'), cell('bar')]],
        };

        expect(() => createTableGroup(block, DEFAULT_SETTINGS, mockDocument)).not.toThrow();
    });

    it('returns a Group with name and frame', () => {
        const block: Block = {
            type: 'table',
            header: [headerCell('A')],
            align: ['left'],
            rows: [[cell('B')]],
        };

        const result = createTableGroup(block, DEFAULT_SETTINGS, mockDocument);
        expect(result).toHaveProperty('name', 'Table');
        expect(result).toHaveProperty('frame');
    });

    it('handles multiple columns', () => {
        const block: Block = {
            type: 'table',
            header: [headerCell('A'), headerCell('B', 'center'), headerCell('C', 'right')],
            align: ['left', 'center', 'right'],
            rows: [[cell('1'), cell('2', 'center'), cell('3', 'right')]],
        };

        const result = createTableGroup(block, DEFAULT_SETTINGS, mockDocument);
        expect(result).toBeDefined();
        expect(result.name).toBe('Table');
    });

    it('handles multiple rows', () => {
        const block: Block = {
            type: 'table',
            header: [headerCell('Col')],
            align: ['left'],
            rows: [[cell('Row 1')], [cell('Row 2')], [cell('Row 3')]],
        };

        const result = createTableGroup(block, DEFAULT_SETTINGS, mockDocument);
        expect(result).toBeDefined();
    });
});
