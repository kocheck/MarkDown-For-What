/**
 * Unit tests for text style management.
 * Tests shared style creation, reuse, and text height estimation.
 */

import {
    STYLE_NAMES,
    DEFAULT_STYLES,
    getOrCreateSharedStyle,
    initializeStyles,
    estimateTextHeight,
} from './styles';

function createMockDocument() {
    return {
        sharedTextStyles: [] as any[],
    };
}

describe('STYLE_NAMES', () => {
    test('contains all expected style names', () => {
        expect(STYLE_NAMES.H1).toBe('Markdown/H1');
        expect(STYLE_NAMES.H2).toBe('Markdown/H2');
        expect(STYLE_NAMES.H3).toBe('Markdown/H3');
        expect(STYLE_NAMES.BODY).toBe('Markdown/Body');
        expect(STYLE_NAMES.CODE).toBe('Markdown/Code');
        expect(STYLE_NAMES.LIST).toBe('Markdown/List');
        expect(STYLE_NAMES.QUOTE).toBe('Markdown/Quote');
    });
});

describe('DEFAULT_STYLES', () => {
    test('has a config for every STYLE_NAME', () => {
        for (const name of Object.values(STYLE_NAMES)) {
            expect(DEFAULT_STYLES[name]).toBeDefined();
            expect(DEFAULT_STYLES[name].family).toBeDefined();
            expect(DEFAULT_STYLES[name].size).toBeGreaterThan(0);
            expect(DEFAULT_STYLES[name].lineHeight).toBeGreaterThan(0);
        }
    });

    test('uses Inter for body text and Roboto Mono for code', () => {
        expect(DEFAULT_STYLES[STYLE_NAMES.BODY].family).toBe('Inter');
        expect(DEFAULT_STYLES[STYLE_NAMES.CODE].family).toBe('Roboto Mono');
    });
});

describe('getOrCreateSharedStyle', () => {
    test('creates a new style when none exists', () => {
        const doc = createMockDocument();
        const style = getOrCreateSharedStyle(doc, STYLE_NAMES.H1, DEFAULT_STYLES[STYLE_NAMES.H1]);
        expect(style).toBeDefined();
        expect(style.name).toContain('Markdown/H1');
    });

    test('returns existing style on second call (cached)', () => {
        const doc = createMockDocument();
        const style1 = getOrCreateSharedStyle(
            doc,
            STYLE_NAMES.BODY,
            DEFAULT_STYLES[STYLE_NAMES.BODY],
        );
        const style2 = getOrCreateSharedStyle(
            doc,
            STYLE_NAMES.BODY,
            DEFAULT_STYLES[STYLE_NAMES.BODY],
        );
        expect(style2).toBe(style1);
    });

    test('finds existing style in document shared styles', () => {
        const existingStyle = {
            id: 'existing-id',
            name: 'Markdown/H2',
            style: { fontSize: 24 },
        };
        const doc = createMockDocument();
        doc.sharedTextStyles.push(existingStyle);

        const result = getOrCreateSharedStyle(
            doc,
            STYLE_NAMES.H2,
            DEFAULT_STYLES[STYLE_NAMES.H2],
        );
        expect(result).toBe(existingStyle);
    });
});

describe('initializeStyles', () => {
    test('creates all expected styles', () => {
        const doc = createMockDocument();
        initializeStyles(doc);

        // Should create styles for all STYLE_NAMES
        const styleNames = Object.values(STYLE_NAMES);
        for (const name of styleNames) {
            const style = getOrCreateSharedStyle(doc, name, DEFAULT_STYLES[name]);
            expect(style).toBeDefined();
        }
    });

    test('does not throw on repeated initialization', () => {
        const doc = createMockDocument();
        expect(() => {
            initializeStyles(doc);
            initializeStyles(doc);
        }).not.toThrow();
    });
});

describe('estimateTextHeight', () => {
    test('returns a positive number', () => {
        const height = estimateTextHeight('Hello world', 200, 16, 1.5);
        expect(height).toBeGreaterThan(0);
    });

    test('returns larger height for longer text', () => {
        const short = estimateTextHeight('Hi', 200, 16, 1.5);
        const long = estimateTextHeight('A'.repeat(500), 200, 16, 1.5);
        expect(long).toBeGreaterThan(short);
    });

    test('returns larger height for narrower width', () => {
        const text = 'This is a moderately long piece of text that should wrap';
        const wide = estimateTextHeight(text, 800, 16, 1.5);
        const narrow = estimateTextHeight(text, 100, 16, 1.5);
        expect(narrow).toBeGreaterThanOrEqual(wide);
    });

    test('handles empty text', () => {
        const height = estimateTextHeight('', 200, 16, 1.5);
        expect(height).toBeGreaterThan(0); // At least one line
    });
});
