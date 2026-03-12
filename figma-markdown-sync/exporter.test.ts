/**
 * Tests for exporter.ts — inference, diff engine, and Markdown assembly.
 */
import {
    inferBlocksFromFrame,
    normalizeContent,
    fingerprintBlock,
    diffBlocks,
    assembleMarkdown,
} from './exporter';
import type { InferredBlock, DiffBlock, BlockSelection } from './exporter';

// ── Test helpers ─────────────────────────────────────────────────────────────

function makeTextNode(overrides: Partial<any> = {}): any {
    return {
        type: 'TEXT',
        name: '',
        characters: 'Hello world',
        _pluginData: {} as Record<string, string>,
        getPluginData: jest.fn(function(this: any, k: string) { return this._pluginData[k] ?? ''; }),
        getTextStyleIdAsync: jest.fn().mockResolvedValue(''),
        ...overrides,
    };
}

function makeRectNode(overrides: Partial<any> = {}): any {
    return {
        type: 'RECTANGLE',
        name: '',
        width: 800,
        height: 1,
        fills: [{ type: 'SOLID' }],
        ...overrides,
    };
}

function makeFrame(name: string, children: any[] = [], overrides: Partial<any> = {}): any {
    return {
        type: 'FRAME',
        name,
        children,
        _pluginData: {} as Record<string, string>,
        getPluginData: jest.fn(function(this: any, k: string) { return this._pluginData[k] ?? ''; }),
        ...overrides,
    };
}

// ── normalizeContent ─────────────────────────────────────────────────────────

describe('normalizeContent', () => {
    it('strips leading and trailing whitespace', () => {
        expect(normalizeContent('  hello  ')).toBe('hello');
    });

    it('collapses internal whitespace runs to a single space', () => {
        expect(normalizeContent('foo   bar\tbaz')).toBe('foo bar baz');
    });

    it('returns empty string for blank input', () => {
        expect(normalizeContent('   ')).toBe('');
    });
});

// ── fingerprintBlock ─────────────────────────────────────────────────────────

describe('fingerprintBlock', () => {
    it('produces type:normalizedContent string', () => {
        expect(fingerprintBlock('heading', '  Hello World  ')).toBe('heading:Hello World');
    });

    it('is case-sensitive', () => {
        expect(fingerprintBlock('paragraph', 'Foo')).not.toBe(fingerprintBlock('paragraph', 'foo'));
    });
});

// ── inferBlocksFromFrame — text and separator nodes ───────────────────────────

describe('inferBlocksFromFrame — text nodes', () => {
    beforeEach(() => jest.clearAllMocks());

    it('infers H1 from a text node with Markdown/H1 style name', async () => {
        const text = makeTextNode({ characters: 'My Title' });
        (figma.getStyleByIdAsync as jest.Mock).mockResolvedValue({ name: 'Markdown/H1' });
        text.getTextStyleIdAsync.mockResolvedValue('style-id-h1');
        const frame = makeFrame('Test', [text]);

        const { blocks } = await inferBlocksFromFrame(frame);
        expect(blocks).toHaveLength(1);
        expect(blocks[0].text).toBe('# My Title');
        expect(blocks[0].blockType).toBe('heading-1');
    });

    it('infers paragraph from Markdown/Body style', async () => {
        const text = makeTextNode({ characters: 'Some body text' });
        (figma.getStyleByIdAsync as jest.Mock).mockResolvedValue({ name: 'Markdown/Body' });
        text.getTextStyleIdAsync.mockResolvedValue('style-id-body');
        const frame = makeFrame('Test', [text]);

        const { blocks } = await inferBlocksFromFrame(frame);
        expect(blocks[0].text).toBe('Some body text');
        expect(blocks[0].blockType).toBe('paragraph');
    });

    it('infers separator from a 1px-tall RECTANGLE node', async () => {
        const rect = makeRectNode({ height: 1 });
        const frame = makeFrame('Test', [rect]);

        const { blocks } = await inferBlocksFromFrame(frame);
        expect(blocks).toHaveLength(1);
        expect(blocks[0].text).toBe('---');
        expect(blocks[0].blockType).toBe('separator');
    });

    it('skips unknown nodes and records them in skippedLayers', async () => {
        const unknown = { type: 'ELLIPSE', name: 'Shape', children: [] };
        const frame = makeFrame('Test', [unknown]);

        const { blocks, skippedLayers } = await inferBlocksFromFrame(frame);
        expect(blocks).toHaveLength(0);
        expect(skippedLayers[0].name).toBe('Shape');
    });
});

// ── inferBlocksFromFrame — named frames ──────────────────────────────────────

describe('inferBlocksFromFrame — named frames', () => {
    beforeEach(() => jest.clearAllMocks());

    it('infers Mermaid Diagram frame using pluginData source', async () => {
        const frame = makeFrame('Mermaid Diagram');
        frame._pluginData['mermaidSource'] = 'graph TD\nA-->B';
        const root = makeFrame('Root', [frame]);

        const { blocks } = await inferBlocksFromFrame(root);
        expect(blocks[0].text).toBe('```mermaid\ngraph TD\nA-->B\n```');
        expect(blocks[0].blockType).toBe('mermaid');
        expect(blocks[0].fidelityWarning).toBeUndefined();
    });

    it('attaches a fidelity warning for Mermaid frames with no pluginData source', async () => {
        const frame = makeFrame('Mermaid Diagram');
        const root = makeFrame('Root', [frame]);
        const { blocks } = await inferBlocksFromFrame(root);
        expect(blocks[0].fidelityWarning).toMatch(/not recoverable/i);
    });

    it('infers callout block from "Callout: Warning" frame name', async () => {
        const body = makeTextNode({ characters: 'Watch out!' });
        (figma.getStyleByIdAsync as jest.Mock).mockResolvedValue({ name: 'Markdown/Body' });
        body.getTextStyleIdAsync.mockResolvedValue('style-id');
        const calloutFrame = makeFrame('Callout: Warning', [body]);
        const root = makeFrame('Root', [calloutFrame]);

        const { blocks } = await inferBlocksFromFrame(root);
        expect(blocks[0].text).toContain('[!WARNING]');
        expect(blocks[0].blockType).toBe('callout');
    });

    it('infers list items from List Group frame', async () => {
        const item1 = makeTextNode({ characters: 'First item' });
        const item2 = makeTextNode({ characters: 'Second item' });
        const group = makeFrame('List Group', [item1, item2]);
        const root = makeFrame('Root', [group]);

        const { blocks } = await inferBlocksFromFrame(root);
        expect(blocks[0].text).toBe('- First item\n- Second item');
        expect(blocks[0].blockType).toBe('listGroup');
    });

    it('infers image node from RECTANGLE with IMAGE fill', async () => {
        const rect = makeRectNode({
            height: 200,
            name: 'My Screenshot',
            fills: [{ type: 'IMAGE' }],
        });
        const root = makeFrame('Root', [rect]);
        const { blocks } = await inferBlocksFromFrame(root);
        expect(blocks[0].text).toBe('![My Screenshot](image-not-recoverable)');
        expect(blocks[0].fidelityWarning).toMatch(/url not recoverable/i);
    });
});

// ── diffBlocks ────────────────────────────────────────────────────────────────

describe('diffBlocks', () => {
    const makeInferred = (blockType: string, text: string, label = blockType): InferredBlock =>
        ({ text, blockType, label });

    it('marks blocks as unchanged when fingerprints match', () => {
        const result = diffBlocks(['# Hello World'], [makeInferred('heading-1', '# Hello World', 'Heading 1')]);
        expect(result[0].state).toBe('unchanged');
        expect(result[0].originalText).toBe('# Hello World');
    });

    it('marks blocks as modified when same position, different content', () => {
        const result = diffBlocks(['# Old Title'], [makeInferred('heading-1', '# New Title', 'Heading 1')]);
        expect(result[0].state).toBe('modified');
        expect(result[0].originalText).toBe('# Old Title');
        expect(result[0].inferredText).toBe('# New Title');
    });

    it('marks blocks as new when no source block exists', () => {
        const result = diffBlocks([], [makeInferred('paragraph', 'New paragraph', 'Paragraph')]);
        expect(result[0].state).toBe('new');
        expect(result[0].originalText).toBeUndefined();
    });

    it('uses content-hash matching across positions (insertion tolerance)', () => {
        const source = ['First paragraph', 'Second paragraph'];
        const inferred = [
            makeInferred('paragraph', 'Brand new intro', 'Paragraph'),
            makeInferred('paragraph', 'First paragraph', 'Paragraph'),
            makeInferred('paragraph', 'Second paragraph', 'Paragraph'),
        ];
        const result = diffBlocks(source, inferred);
        expect(result.find(b => b.inferredText === 'Brand new intro')?.state).toBe('new');
        expect(result.find(b => b.inferredText === 'First paragraph')?.state).toBe('unchanged');
        expect(result.find(b => b.inferredText === 'Second paragraph')?.state).toBe('unchanged');
    });

    it('returns empty array when both inputs are empty', () => {
        expect(diffBlocks([], [])).toEqual([]);
    });
});

// ── assembleMarkdown ──────────────────────────────────────────────────────────

describe('assembleMarkdown', () => {
    it('uses originalText for unchanged blocks (preserves inline formatting)', () => {
        const blocks: DiffBlock[] = [
            { state: 'unchanged', originalText: '# My [linked](url) Heading', inferredText: '# My linked Heading', label: 'Heading 1' },
        ];
        expect(assembleMarkdown(blocks, [])).toBe('# My [linked](url) Heading');
    });

    it('uses inferredText for new blocks', () => {
        const blocks: DiffBlock[] = [{ state: 'new', inferredText: 'New paragraph', label: 'Paragraph' }];
        expect(assembleMarkdown(blocks, [])).toBe('New paragraph');
    });

    it('uses originalText by default for modified blocks (conservative)', () => {
        const blocks: DiffBlock[] = [
            { state: 'modified', originalText: 'Old text', inferredText: 'New text', label: 'Paragraph' },
        ];
        expect(assembleMarkdown(blocks, [])).toBe('Old text');
    });

    it('respects BlockSelection to use inferred for modified block', () => {
        const blocks: DiffBlock[] = [
            { state: 'modified', originalText: 'Old text', inferredText: 'New text', label: 'Paragraph' },
        ];
        expect(assembleMarkdown(blocks, [{ blockIndex: 0, useOriginal: false }])).toBe('New text');
    });

    it('respects BlockSelection useOriginal=true to skip a new block', () => {
        const blocks: DiffBlock[] = [{ state: 'new', inferredText: 'Unwanted', label: 'Paragraph' }];
        expect(assembleMarkdown(blocks, [{ blockIndex: 0, useOriginal: true }])).toBe('');
    });

    it('separates blocks with a blank line', () => {
        const blocks: DiffBlock[] = [
            { state: 'unchanged', originalText: '# Title', inferredText: '# Title', label: 'Heading 1' },
            { state: 'new', inferredText: 'Body text', label: 'Paragraph' },
        ];
        expect(assembleMarkdown(blocks, [])).toBe('# Title\n\nBody text');
    });
});
