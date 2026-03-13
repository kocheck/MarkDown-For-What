/**
 * Tests for exporter.ts — inference, diff engine, and Markdown assembly.
 */
import {
    inferBlocksFromFrame,
    normalizeContent,
    fingerprintBlock,
    diffBlocks,
    assembleMarkdown,
    exportFrame,
} from './exporter';
import type { BlockType, InferredBlock, ExportBlock, BlockSelection } from './exporter';

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

function makeMockFrame(overrides: Partial<any> = {}): any {
    return {
        type: 'FRAME',
        id: 'frame-1',
        name: 'My Frame',
        children: [],
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
        expect(fingerprintBlock('heading-1', '  Hello World  ')).toBe('heading-1:Hello World');
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
    const makeInferred = (blockType: BlockType, text: string, label: string = blockType): InferredBlock =>
        ({ text, blockType, label });

    it('marks blocks as unchanged when fingerprints match', () => {
        const result = diffBlocks(['# Hello World'], [makeInferred('heading-1', '# Hello World', 'Heading 1')]);
        expect(result[0].state).toBe('unchanged');
        expect((result[0] as Extract<typeof result[0], { state: 'unchanged' }>).originalText).toBe('# Hello World');
    });

    it('marks blocks as modified when same position, different content', () => {
        const result = diffBlocks(['# Old Title'], [makeInferred('heading-1', '# New Title', 'Heading 1')]);
        expect(result[0].state).toBe('modified');
        expect((result[0] as Extract<typeof result[0], { state: 'modified' }>).originalText).toBe('# Old Title');
        expect(result[0].inferredText).toBe('# New Title');
    });

    it('marks blocks as new when no source block exists', () => {
        const result = diffBlocks([], [makeInferred('paragraph', 'New paragraph', 'Paragraph')]);
        expect(result[0].state).toBe('new');
        expect('originalText' in result[0]).toBe(false);
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

    it('handles duplicate fingerprints correctly — each maps to a distinct source line', () => {
        const source = ['- Item', '- Item', '# Title'];
        const inferred: InferredBlock[] = [
            { blockType: 'list', text: '- Item', label: 'List item' },
            { blockType: 'list', text: '- Item', label: 'List item' },
            { blockType: 'heading-1', text: '# Title', label: 'H1' },
        ];
        const result = diffBlocks(source, inferred);
        expect(result[0].state).toBe('unchanged');
        expect(result[1].state).toBe('unchanged');
        expect(result[2].state).toBe('unchanged');
        // Both duplicate list items should reference distinct original texts
        expect((result[0] as Extract<typeof result[0], { state: 'unchanged' }>).originalText).toBe('- Item');
        expect((result[1] as Extract<typeof result[0], { state: 'unchanged' }>).originalText).toBe('- Item');
    });
});

// ── assembleMarkdown ──────────────────────────────────────────────────────────

describe('assembleMarkdown', () => {
    it('uses originalText for unchanged blocks (preserves inline formatting)', () => {
        const blocks: ExportBlock[] = [
            { state: 'unchanged', originalText: '# My [linked](url) Heading', inferredText: '# My linked Heading' },
        ];
        expect(assembleMarkdown(blocks, [])).toBe('# My [linked](url) Heading');
    });

    it('uses inferredText for new blocks', () => {
        const blocks: ExportBlock[] = [{ state: 'new', inferredText: 'New paragraph' }];
        expect(assembleMarkdown(blocks, [])).toBe('New paragraph');
    });

    it('uses originalText by default for modified blocks (conservative)', () => {
        const blocks: ExportBlock[] = [
            { state: 'modified', originalText: 'Old text', inferredText: 'New text' },
        ];
        expect(assembleMarkdown(blocks, [])).toBe('Old text');
    });

    it('respects BlockSelection to use inferred for modified block', () => {
        const blocks: ExportBlock[] = [
            { state: 'modified', originalText: 'Old text', inferredText: 'New text' },
        ];
        expect(assembleMarkdown(blocks, [{ blockIndex: 0, useOriginal: false }])).toBe('New text');
    });

    it('respects BlockSelection useOriginal=true to skip a new block', () => {
        const blocks: ExportBlock[] = [{ state: 'new', inferredText: 'Unwanted' }];
        expect(assembleMarkdown(blocks, [{ blockIndex: 0, useOriginal: true }])).toBe('');
    });

    it('separates blocks with a blank line', () => {
        const blocks: ExportBlock[] = [
            { state: 'unchanged', originalText: '# Title', inferredText: '# Title' },
            { state: 'new', inferredText: 'Body text' },
        ];
        expect(assembleMarkdown(blocks, [])).toBe('# Title\n\nBody text');
    });

    it('silently drops blocks with empty or whitespace-only text', () => {
        const blocks: ExportBlock[] = [
            { state: 'new', inferredText: '# Title' },
            { state: 'new', inferredText: '' },
            { state: 'new', inferredText: '   ' },
            { state: 'new', inferredText: 'Content' },
        ];
        const result = assembleMarkdown(blocks);
        const lines = result.split('\n\n');
        expect(lines.filter(l => l.trim().length > 0)).toHaveLength(2);
        expect(result).toContain('# Title');
        expect(result).toContain('Content');
    });
});

// ── exportFrame ───────────────────────────────────────────────────────────────

describe('exportFrame', () => {
    beforeEach(() => jest.clearAllMocks());

    it('returns hasStoredSource: true when markdownSource is present', async () => {
        const frame = makeMockFrame() as any;
        frame._pluginData['markdownSource'] = '# Hello\n\nWorld';
        frame._pluginData['markdownFilename'] = 'test.md';
        // Add a child text node
        const textNode = { type: 'TEXT', name: 'Body', characters: 'World', textStyleId: '',
            getTextStyleIdAsync: jest.fn().mockResolvedValue('') };
        frame.children = [textNode];
        const result = await exportFrame(frame);
        expect(result.hasStoredSource).toBe(true);
        expect(result.sourceTruncated).toBe(false);
    });

    it('returns hasStoredSource: true and sourceTruncated: true when truncated flag is set', async () => {
        const frame = makeMockFrame() as any;
        frame._pluginData['markdownSourceTruncated'] = 'true';
        frame.children = [];
        const result = await exportFrame(frame);
        expect(result.hasStoredSource).toBe(true);
        expect(result.sourceTruncated).toBe(true);
    });

    it('returns hasStoredSource: false for frames with no pluginData', async () => {
        const frame = makeMockFrame() as any;
        frame.children = [];
        const result = await exportFrame(frame);
        expect(result.hasStoredSource).toBe(false);
        expect(result.sourceTruncated).toBe(false);
    });

    it('uses markdownFilename for filename, then frame.name, then "export"', async () => {
        const frame1 = makeMockFrame() as any;
        frame1._pluginData['markdownSource'] = '# A';
        frame1._pluginData['markdownFilename'] = 'my-spec.md';
        frame1.children = [];
        const r1 = await exportFrame(frame1);
        expect(r1.filename).toBe('my-spec.md');

        const frame2 = makeMockFrame() as any;
        frame2.name = 'My Frame';
        frame2.children = [];
        const r2 = await exportFrame(frame2);
        expect(r2.filename).toBe('My Frame.md');

        const frame3 = makeMockFrame() as any;
        frame3.name = '';
        frame3.children = [];
        const r3 = await exportFrame(frame3);
        expect(r3.filename).toBe('export.md');
    });

    it('marks all blocks as new when no stored source', async () => {
        const frame = makeMockFrame() as any;
        const textNode = { type: 'TEXT', name: 'Body', characters: 'Hello', textStyleId: '',
            getTextStyleIdAsync: jest.fn().mockResolvedValue('') };
        frame.children = [textNode];
        const result = await exportFrame(frame);
        expect(result.blocks.every((b: any) => b.state === 'new')).toBe(true);
    });
});
