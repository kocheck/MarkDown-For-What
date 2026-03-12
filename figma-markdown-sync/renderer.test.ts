/**
 * Unit tests for renderer.ts
 * Tests renderBlocks list grouping, targetNode replacement (build-then-swap),
 * error placeholder fallback, and image failure tracking.
 */

import { renderBlocks, computeNewFrameX, componentName } from './renderer';
import { DEFAULT_SETTINGS } from './settings';
import { countAsyncStyleCalls } from './test-setup';
import type { Block } from './parser';

describe('computeNewFrameX', () => {
    beforeEach(() => {
        // Reset page children before each test
        (figma.currentPage as any).children = [];
    });

    it('returns 0 when the page is empty', () => {
        expect(computeNewFrameX(100)).toBe(0);
    });

    it('returns rightEdge + gap for a single frame', () => {
        (figma.currentPage as any).children = [{ x: 200, width: 400 }];
        // right edge = 200 + 400 = 600; + gap 100 = 700
        expect(computeNewFrameX(100)).toBe(700);
    });

    it('uses the maximum right edge across multiple frames', () => {
        (figma.currentPage as any).children = [
            { x: 0,   width: 300 }, // right = 300
            { x: 100, width: 400 }, // right = 500 ← max
            { x: 50,  width: 200 }, // right = 250
        ];
        expect(computeNewFrameX(100)).toBe(600); // 500 + 100
    });

    it('respects the gap parameter', () => {
        (figma.currentPage as any).children = [{ x: 0, width: 800 }];
        expect(computeNewFrameX(50)).toBe(850);  // 800 + 50
        expect(computeNewFrameX(200)).toBe(1000); // 800 + 200
    });

    it('clamps to 0 when all nodes have negative right edges', () => {
        (figma.currentPage as any).children = [{ x: -500, width: 100 }]; // right = -400
        // Clamped to 0, so result is 0 + gap = 100
        expect(computeNewFrameX(100)).toBe(100);
    });
});

describe('renderBlocks', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('list grouping', () => {
        it('groups consecutive list blocks into a single List Group frame', async () => {
            const blocks: Block[] = [
                { type: 'list', content: 'Item 1', tokens: [] },
                { type: 'list', content: 'Item 2', tokens: [] },
                { type: 'list', content: 'Item 3', tokens: [] },
            ];

            const result = await renderBlocks('Test', blocks, DEFAULT_SETTINGS);
            // All 3 list items should be in 1 List Group child of the root frame
            expect(result.frame.children).toHaveLength(1);
            expect(result.frame.children[0].name).toBe('List Group');
        });

        it('uses listSpacing inside a list group', async () => {
            const blocks: Block[] = [
                { type: 'list', content: 'Item 1', tokens: [] },
                { type: 'list', content: 'Item 2', tokens: [] },
            ];

            const settings = { ...DEFAULT_SETTINGS, listSpacing: 4 };
            const result = await renderBlocks('Test', blocks, settings);
            const listGroup = result.frame.children[0] as any;
            expect(listGroup.itemSpacing).toBe(4);
        });

        it('splits non-list blocks between list groups', async () => {
            const blocks: Block[] = [
                { type: 'list', content: 'Item 1', tokens: [] },
                { type: 'paragraph', content: 'Paragraph', tokens: [] },
                { type: 'list', content: 'Item 2', tokens: [] },
            ];

            const result = await renderBlocks('Test', blocks, DEFAULT_SETTINGS);
            // list group, paragraph, list group = 3 children
            expect(result.frame.children).toHaveLength(3);
            expect(result.frame.children[0].name).toBe('List Group');
            expect(result.frame.children[2].name).toBe('List Group');
        });
    });

    describe('targetNode replacement (build-then-swap)', () => {
        it('inserts the new frame at the targetNode position and removes targetNode', async () => {
            // Build a mock parent with a target node already in it
            const targetNode: any = {
                name: 'OldFrame',
                x: 50, y: 100,
                type: 'FRAME',
                remove: jest.fn(),
                parent: null as any,
            };
            const mockParent: any = {
                children: [targetNode],
                insertChild: jest.fn(function(index: number, child: any) {
                    this.children.splice(index, 0, child);
                }),
                indexOf: jest.fn((child: any) => mockParent.children.indexOf(child)),
            };
            targetNode.parent = mockParent;

            const blocks: Block[] = [{ type: 'paragraph', content: 'Hello', tokens: [] }];
            await renderBlocks('NewFrame', blocks, DEFAULT_SETTINGS, targetNode);

            expect(mockParent.insertChild).toHaveBeenCalled();
            expect(targetNode.remove).toHaveBeenCalled();
        });

        it('sets the new frame position to match the targetNode', async () => {
            const targetNode: any = {
                name: 'OldFrame',
                x: 120, y: 240,
                type: 'FRAME',
                remove: jest.fn(),
                parent: null as any,
            };
            const mockParent: any = {
                children: [targetNode],
                insertChild: jest.fn(function(index: number, child: any) {
                    this.children.splice(index, 0, child);
                    child.parent = mockParent;
                }),
                indexOf: jest.fn(() => 0),
            };
            targetNode.parent = mockParent;

            const blocks: Block[] = [{ type: 'paragraph', content: 'Test', tokens: [] }];
            const result = await renderBlocks('NewFrame', blocks, DEFAULT_SETTINGS, targetNode);

            expect(result.frame.x).toBe(120);
            expect(result.frame.y).toBe(240);
        });
    });

    describe('error placeholder fallback', () => {
        it('inserts an error placeholder when a block fails and continues rendering', async () => {
            // Make createRectangle throw to simulate separator failure
            (figma.createRectangle as jest.Mock).mockImplementationOnce(() => {
                throw new Error('Simulated failure');
            });

            const blocks: Block[] = [
                { type: 'separator' },
                { type: 'paragraph', content: 'Should still render', tokens: [] },
            ];

            const result = await renderBlocks('Test', blocks, DEFAULT_SETTINGS);
            // Both blocks produce children: error placeholder + paragraph
            expect(result.frame.children).toHaveLength(2);
        });
    });

    describe('image failure tracking', () => {
        it('returns imageFailures=1 when an image fails to load', async () => {
            (figma.createImageAsync as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

            const blocks: Block[] = [
                { type: 'image', imageUrl: 'https://example.com/broken.png', imageAlt: 'Broken' },
            ];

            const result = await renderBlocks('Test', blocks, DEFAULT_SETTINGS);
            expect(result.imageFailures).toBe(1);
        });

        it('returns imageFailures=0 when all images load successfully', async () => {
            (figma.createImageAsync as jest.Mock).mockResolvedValueOnce({
                hash: 'mock-hash',
                getSizeAsync: jest.fn().mockResolvedValue({ width: 400, height: 300 }),
            });

            const blocks: Block[] = [
                { type: 'image', imageUrl: 'https://example.com/ok.png', imageAlt: 'OK' },
            ];

            const result = await renderBlocks('Test', blocks, DEFAULT_SETTINGS);
            expect(result.imageFailures).toBe(0);
        });

        it('accumulates imageFailures across multiple failed images', async () => {
            (figma.createImageAsync as jest.Mock)
                .mockRejectedValueOnce(new Error('fail'))
                .mockRejectedValueOnce(new Error('fail'));

            const blocks: Block[] = [
                { type: 'image', imageUrl: 'https://example.com/1.png', imageAlt: 'A' },
                { type: 'image', imageUrl: 'https://example.com/2.png', imageAlt: 'B' },
            ];

            const result = await renderBlocks('Test', blocks, DEFAULT_SETTINGS);
            expect(result.imageFailures).toBe(2);
        });
    });

    describe('frame setup', () => {
        it('applies settings to the root frame', async () => {
            const settings = {
                ...DEFAULT_SETTINGS,
                framePadding: 20,
                blockSpacing: 12,
                frameWidth: 600,
                widthMode: 'custom' as const,
                customWidth: 600,
            };

            const result = await renderBlocks('Test', [], settings);
            const frame = result.frame as any;

            expect(frame.paddingTop).toBe(20);
            expect(frame.paddingBottom).toBe(20);
            expect(frame.paddingLeft).toBe(20);
            expect(frame.paddingRight).toBe(20);
            expect(frame.itemSpacing).toBe(12);
            expect(frame.width).toBe(600);
        });

        it('names the root frame correctly', async () => {
            const result = await renderBlocks('My Doc', [], DEFAULT_SETTINGS);
            expect(result.frame.name).toBe('My Doc');
        });

        it('places a new frame to the right of existing page content', async () => {
            // Simulate an existing frame on the page at x=0, width=800
            (figma.currentPage as any).children = [{ x: 0, width: 800 }];

            const result = await renderBlocks('Test', [], DEFAULT_SETTINGS);

            // New frame should be placed at 800 + 100 gap = 900
            expect(result.frame.x).toBe(900);
        });

        it('places a new frame at x=0 when the page is empty', async () => {
            (figma.currentPage as any).children = [];

            const result = await renderBlocks('Test', [], DEFAULT_SETTINGS);

            expect(result.frame.x).toBe(0);
        });

        it('applies frameFillColor to root frame', async () => {
            const settings = { ...DEFAULT_SETTINGS, frameFillColor: '#1E1E1E' };
            const result = await renderBlocks('Test', [], settings);
            expect((result.frame as any).fills).toEqual([{
                type: 'SOLID',
                color: {
                    r: expect.closeTo(0.118, 2),
                    g: expect.closeTo(0.118, 2),
                    b: expect.closeTo(0.118, 2),
                },
            }]);
        });

        it('applies white fill by default', async () => {
            const result = await renderBlocks('Test', [], DEFAULT_SETTINGS);
            expect((result.frame as any).fills).toEqual([{
                type: 'SOLID',
                color: { r: 1, g: 1, b: 1 },
            }]);
        });
    });

    describe('image handling', () => {
        it('throws an error placeholder when imageUrl is missing', async () => {
            const blocks: Block[] = [
                { type: 'image', imageAlt: 'No URL' },
            ];

            const result = await renderBlocks('Test', blocks, DEFAULT_SETTINGS);
            // Missing URL throws inside renderBlock → error placeholder frame is inserted
            expect(result.frame.children).toHaveLength(1);
        });

        it('scales images larger than frameWidth down to fit', async () => {
            (figma.createImageAsync as jest.Mock).mockResolvedValueOnce({
                hash: 'mock-hash',
                getSizeAsync: jest.fn().mockResolvedValue({ width: 1200, height: 800 }),
            });

            const settings = { ...DEFAULT_SETTINGS, frameWidth: 600, widthMode: 'custom' as const, customWidth: 600 };
            const blocks: Block[] = [
                { type: 'image', imageUrl: 'https://example.com/wide.png', imageAlt: 'Wide' },
            ];

            const result = await renderBlocks('Test', blocks, settings);
            const imgRect = result.frame.children[0] as any;
            // 1200 → scaled to 600; height scaled proportionally: 800 * (600/1200) = 400
            expect(imgRect.width).toBe(600);
            expect(imgRect.height).toBe(400);
        });
    });

    describe('targetNode replacement edge cases', () => {
        it('does not attempt replacement when targetNode has no parent', async () => {
            const targetNode: any = {
                name: 'Orphan',
                x: 0, y: 0,
                type: 'FRAME',
                remove: jest.fn(),
                parent: null,
            };

            const blocks: Block[] = [{ type: 'paragraph', content: 'Hello', tokens: [] }];
            const result = await renderBlocks('Test', blocks, DEFAULT_SETTINGS, targetNode);

            expect(targetNode.remove).not.toHaveBeenCalled();
            expect(result.frame).toBeDefined();
        });
    });

    describe('nested list rendering', () => {
        it('applies left padding based on depth', async () => {
            const blocks: Block[] = [
                { type: 'list', content: 'Top level', depth: 0, tokens: [] },
                { type: 'list', content: 'Nested', depth: 1, tokens: [] },
                { type: 'list', content: 'Deep nested', depth: 2, tokens: [] },
            ];

            const result = await renderBlocks('Test', blocks, DEFAULT_SETTINGS);
            const listGroup = result.frame.children[0] as any;

            // Each item is a text node — check if wrapper frame has padding
            // For depth > 0, we wrap in a frame with left padding
            expect(listGroup.children).toHaveLength(3);
        });

        it('uses different bullet characters per depth', async () => {
            const blocks: Block[] = [
                { type: 'list', content: 'Level 0', depth: 0, tokens: [] },
                { type: 'list', content: 'Level 1', depth: 1, tokens: [] },
            ];

            const result = await renderBlocks('Test', blocks, DEFAULT_SETTINGS);
            const listGroup = result.frame.children[0] as any;

            // Depth 0 uses '• ', depth 1 uses '◦ '
            expect(listGroup.children[0].characters).toContain('•');
            expect(listGroup.children[1].characters).toContain('◦');
        });

        it('applies paragraphIndent for nested unordered list items', async () => {
            const blocks: Block[] = [
                { type: 'list', content: 'Top level', depth: 0, tokens: [] },
                { type: 'list', content: 'Nested', depth: 1, tokens: [] },
                { type: 'list', content: 'Deep nested', depth: 2, tokens: [] },
            ];

            const result = await renderBlocks('Test', blocks, DEFAULT_SETTINGS);
            const listGroup = result.frame.children[0] as any;

            expect(listGroup.children[0].paragraphIndent).toBe(0);
            expect(listGroup.children[1].paragraphIndent).toBe(20);
            expect(listGroup.children[2].paragraphIndent).toBe(40);
        });

        it('applies paragraphIndent for nested ordered list items', async () => {
            const blocks: Block[] = [
                { type: 'orderedListItem', content: 'Top', index: 1, depth: 0, tokens: [] },
                { type: 'orderedListItem', content: 'Nested', index: 1, depth: 1, tokens: [] },
            ];

            const result = await renderBlocks('Test', blocks, DEFAULT_SETTINGS);
            const listGroup = result.frame.children[0] as any;

            expect(listGroup.children[0].paragraphIndent).toBe(0);
            expect(listGroup.children[1].paragraphIndent).toBe(20);
        });
    });

    describe('ordered list rendering', () => {
        it('renders orderedListItem with number prefix', async () => {
            const blocks: Block[] = [
                { type: 'orderedListItem', content: 'First item', index: 1, depth: 0, tokens: [] },
                { type: 'orderedListItem', content: 'Second item', index: 2, depth: 0, tokens: [] },
            ];

            const result = await renderBlocks('Test', blocks, DEFAULT_SETTINGS);

            // Ordered list items should be grouped like regular list items
            expect(result.frame.children).toHaveLength(1); // One list group
            const listGroup = result.frame.children[0] as any;
            expect(listGroup.children).toHaveLength(2);
            // Check that text contains the number prefix
            expect(listGroup.children[0].characters).toContain('1.');
            expect(listGroup.children[1].characters).toContain('2.');
        });

        it('groups consecutive ordered list items together', async () => {
            const blocks: Block[] = [
                { type: 'orderedListItem', content: 'First', index: 1, depth: 0, tokens: [] },
                { type: 'paragraph', content: 'Break', tokens: [] },
                { type: 'orderedListItem', content: 'Second', index: 1, depth: 0, tokens: [] },
            ];

            const result = await renderBlocks('Test', blocks, DEFAULT_SETTINGS);

            expect(result.frame.children).toHaveLength(3); // list group, paragraph, list group
        });
    });

    describe('task list rendering', () => {
        it('renders taskListItem with checkbox visual', async () => {
            const blocks: Block[] = [
                { type: 'taskListItem', content: 'Do the thing', checked: false, depth: 0, tokens: [] },
                { type: 'taskListItem', content: 'Done thing', checked: true, depth: 0, tokens: [] },
            ];

            const result = await renderBlocks('Test', blocks, DEFAULT_SETTINGS);

            // Task items should be grouped in a list group
            expect(result.frame.children).toHaveLength(1);
            const listGroup = result.frame.children[0] as any;
            expect(listGroup.children).toHaveLength(2);

            // Each task item should be a frame (horizontal auto layout: checkbox + text)
            expect(listGroup.children[0].type).toBe('FRAME');
            expect(listGroup.children[0].layoutMode).toBe('HORIZONTAL');
        });

        it('uses checkbox prefix characters', async () => {
            const blocks: Block[] = [
                { type: 'taskListItem', content: 'Unchecked', checked: false, depth: 0, tokens: [] },
                { type: 'taskListItem', content: 'Checked', checked: true, depth: 0, tokens: [] },
            ];

            const result = await renderBlocks('Test', blocks, DEFAULT_SETTINGS);
            const listGroup = result.frame.children[0] as any;

            // Find text nodes inside the task frames
            const uncheckedFrame = listGroup.children[0] as any;
            const checkedFrame = listGroup.children[1] as any;

            // The checkbox rectangle should exist as first child
            expect(uncheckedFrame.children[0].type).toBe('RECTANGLE');
            // Text node should be second child
            expect(uncheckedFrame.children[1].type).toBe('TEXT');
        });

        it('applies correct checkbox colors for checked and unchecked states', async () => {
            const blocks: Block[] = [
                { type: 'taskListItem', content: 'Unchecked', checked: false, depth: 0, tokens: [] },
                { type: 'taskListItem', content: 'Checked', checked: true, depth: 0, tokens: [] },
            ];

            const result = await renderBlocks('Test', blocks, DEFAULT_SETTINGS);
            const listGroup = result.frame.children[0] as any;

            const uncheckedCheckbox = listGroup.children[0].children[0] as any;
            const checkedCheckbox = listGroup.children[1].children[0] as any;

            // Checked: green fill
            expect(checkedCheckbox.fills).toEqual([{ type: 'SOLID', color: { r: 0.2, g: 0.6, b: 0.2 } }]);
            // Unchecked: light gray fill + gray stroke
            expect(uncheckedCheckbox.fills).toEqual([{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } }]);
            expect(uncheckedCheckbox.strokes).toEqual([{ type: 'SOLID', color: { r: 0.7, g: 0.7, b: 0.7 } }]);
        });

        it('dims text for checked task items', async () => {
            const blocks: Block[] = [
                { type: 'taskListItem', content: 'Unchecked', checked: false, depth: 0, tokens: [] },
                { type: 'taskListItem', content: 'Checked', checked: true, depth: 0, tokens: [] },
            ];

            const result = await renderBlocks('Test', blocks, DEFAULT_SETTINGS);
            const listGroup = result.frame.children[0] as any;

            const uncheckedText = listGroup.children[0].children[1] as any;
            const checkedText = listGroup.children[1].children[1] as any;

            expect(uncheckedText.opacity).toBe(1);
            expect(checkedText.opacity).toBe(0.6);
        });
    });

    describe('Integration — mixed block types', () => {
        it('renders a mix of list types without crashing', async () => {
            const blocks: Block[] = [
                { type: 'heading', content: 'Title', level: 1, tokens: [] },
                { type: 'paragraph', content: 'Hello world', tokens: [] },
                { type: 'orderedListItem', content: 'First', index: 1, depth: 0, tokens: [] },
                { type: 'orderedListItem', content: 'Second', index: 2, depth: 0, tokens: [] },
                { type: 'paragraph', content: 'Break', tokens: [] },
                { type: 'list', content: 'Bullet', depth: 0, tokens: [] },
                { type: 'list', content: 'Nested', depth: 1, tokens: [] },
                { type: 'paragraph', content: 'Another break', tokens: [] },
                { type: 'taskListItem', content: 'Todo', checked: false, depth: 0, tokens: [] },
                { type: 'taskListItem', content: 'Done', checked: true, depth: 0, tokens: [] },
            ];

            const result = await renderBlocks('Test', blocks, DEFAULT_SETTINGS);
            // heading, paragraph, list group, paragraph, list group, paragraph, list group
            expect(result.frame.children.length).toBe(7);
        });
    });

    describe('async API usage', () => {
        it('calls setTextStyleIdAsync on heading blocks', async () => {
            const blocks: Block[] = [
                { type: 'heading', content: 'Title', level: 1, tokens: [] },
            ];

            await renderBlocks('Test', blocks, DEFAULT_SETTINGS);

            expect(countAsyncStyleCalls()).toBe(1);
        });

        it('calls setTextStyleIdAsync for list blocks', async () => {
            const blocks: Block[] = [
                { type: 'list', content: 'Item 1', tokens: [] },
                { type: 'list', content: 'Item 2', tokens: [] },
            ];

            await renderBlocks('Test', blocks, DEFAULT_SETTINGS);

            // One call per list item
            expect(countAsyncStyleCalls()).toBe(2);
        });

        it('calls setTextStyleIdAsync on paragraph blocks', async () => {
            const blocks: Block[] = [
                { type: 'paragraph', content: 'Hello world', tokens: [] },
            ];

            await renderBlocks('Test', blocks, DEFAULT_SETTINGS);

            expect(countAsyncStyleCalls()).toBe(1);
        });

        it('calls setTextStyleIdAsync on code blocks', async () => {
            const blocks: Block[] = [
                { type: 'code', content: 'const x = 1;' },
            ];

            await renderBlocks('Test', blocks, DEFAULT_SETTINGS);

            expect(countAsyncStyleCalls()).toBe(1);
        });
    });

    describe('callout block rendering', () => {
        it('should render a callout as a frame with correct name', async () => {
            const blocks: Block[] = [{
                type: 'callout',
                calloutType: 'note',
                content: 'This is a note',
            }];
            const result = await renderBlocks('test', blocks, DEFAULT_SETTINGS);
            const calloutFrame = result.frame.children[0];
            expect(calloutFrame.type).toBe('FRAME');
            expect(calloutFrame.name).toBe('Callout: Note');
        });

        it('should render callout with label and body children', async () => {
            const blocks: Block[] = [{
                type: 'callout',
                calloutType: 'warning',
                content: 'Watch out!',
            }];
            const result = await renderBlocks('test', blocks, DEFAULT_SETTINGS);
            const calloutFrame = result.frame.children[0] as any;
            expect(calloutFrame.children.length).toBeGreaterThanOrEqual(2);
        });

        it('should render all five callout types without error', async () => {
            const types = ['note', 'tip', 'important', 'warning', 'caution'] as const;
            for (const t of types) {
                const blocks: Block[] = [{ type: 'callout', calloutType: t, content: 'Body' }];
                const result = await renderBlocks('test', blocks, DEFAULT_SETTINGS);
                expect(result.frame.children.length).toBe(1);
            }
        });

        it('should set left border on callout frame', async () => {
            const blocks: Block[] = [{
                type: 'callout',
                calloutType: 'tip',
                content: 'A tip',
            }];
            const result = await renderBlocks('test', blocks, DEFAULT_SETTINGS);
            const calloutFrame = result.frame.children[0] as any;
            expect(calloutFrame.strokeLeftWeight).toBe(4);
            expect(calloutFrame.strokeTopWeight).toBe(0);
        });
    });

    describe('TOC block rendering', () => {
        it('should render a TOC frame with correct name', async () => {
            const blocks: Block[] = [{
                type: 'toc',
                tocEntries: [
                    { text: 'Title', level: 1 },
                    { text: 'Section', level: 2 },
                ],
            }];
            const result = await renderBlocks('test', blocks, DEFAULT_SETTINGS);
            const tocFrame = result.frame.children[0];
            expect(tocFrame.type).toBe('FRAME');
            expect(tocFrame.name).toBe('Table of Contents');
        });

        it('should render Contents label and entries', async () => {
            const blocks: Block[] = [{
                type: 'toc',
                tocEntries: [
                    { text: 'Heading 1', level: 1 },
                    { text: 'Heading 2', level: 2 },
                    { text: 'Heading 3', level: 3 },
                ],
            }];
            const result = await renderBlocks('test', blocks, DEFAULT_SETTINGS);
            const tocFrame = result.frame.children[0] as any;
            // Label + 3 entries = 4 children
            expect(tocFrame.children.length).toBe(4);
        });

        it('should indent TOC entries by heading level', async () => {
            const blocks: Block[] = [{
                type: 'toc',
                tocEntries: [
                    { text: 'H1', level: 1 },
                    { text: 'H2', level: 2 },
                    { text: 'H3', level: 3 },
                ],
            }];
            const result = await renderBlocks('test', blocks, DEFAULT_SETTINGS);
            const tocFrame = result.frame.children[0] as any;
            // H1 has no indent, H2 has 20px, H3 has 40px
            expect(tocFrame.children[1].paragraphIndent).toBe(0);
            expect(tocFrame.children[2].paragraphIndent).toBe(20);
            expect(tocFrame.children[3].paragraphIndent).toBe(40);
        });
    });

    describe('definition list rendering', () => {
        it('should render a definition list with term and definition', async () => {
            const blocks: Block[] = [{
                type: 'definitionList',
                definitions: [
                    { term: 'API', definitions: ['Application Programming Interface'] }
                ],
            }];
            const result = await renderBlocks('test', blocks, DEFAULT_SETTINGS);
            const dlFrame = result.frame.children[0] as any;
            expect(dlFrame.type).toBe('FRAME');
            expect(dlFrame.name).toBe('Definition List');
            // Term + definition = 2 children
            expect(dlFrame.children.length).toBe(2);
        });

        it('should render term in bold', async () => {
            const blocks: Block[] = [{
                type: 'definitionList',
                definitions: [
                    { term: 'Bold Term', definitions: ['Some def'] }
                ],
            }];
            const result = await renderBlocks('test', blocks, DEFAULT_SETTINGS);
            const dlFrame = result.frame.children[0] as any;
            const termNode = dlFrame.children[0];
            expect(termNode.characters).toBe('Bold Term');
            expect(termNode.fontName).toEqual({ family: 'Inter', style: 'Bold' });
        });

        it('should indent definitions with paragraphIndent', async () => {
            const blocks: Block[] = [{
                type: 'definitionList',
                definitions: [
                    { term: 'Term', definitions: ['Def 1', 'Def 2'] }
                ],
            }];
            const result = await renderBlocks('test', blocks, DEFAULT_SETTINGS);
            const dlFrame = result.frame.children[0] as any;
            // Term + 2 definitions = 3 children
            expect(dlFrame.children.length).toBe(3);
            expect(dlFrame.children[1].paragraphIndent).toBe(20);
            expect(dlFrame.children[2].paragraphIndent).toBe(20);
        });

        it('should render multiple term-definition pairs', async () => {
            const blocks: Block[] = [{
                type: 'definitionList',
                definitions: [
                    { term: 'A', definitions: ['Def A'] },
                    { term: 'B', definitions: ['Def B'] },
                ],
            }];
            const result = await renderBlocks('test', blocks, DEFAULT_SETTINGS);
            const dlFrame = result.frame.children[0] as any;
            // 2 terms + 2 definitions = 4 children
            expect(dlFrame.children.length).toBe(4);
        });
    });

    describe('footnote section rendering', () => {
        it('should render a footnote section frame with correct name', async () => {
            const blocks: Block[] = [{
                type: 'footnoteSection',
                footnotes: [
                    { id: '1', index: 1, text: 'First footnote.' },
                ],
            }];
            const result = await renderBlocks('test', blocks, DEFAULT_SETTINGS);
            const fnFrame = result.frame.children[0] as any;
            expect(fnFrame.name).toBe('Footnotes');
            expect(fnFrame.layoutMode).toBe('VERTICAL');
        });

        it('should render each footnote as a numbered text entry', async () => {
            const blocks: Block[] = [{
                type: 'footnoteSection',
                footnotes: [
                    { id: '1', index: 1, text: 'First footnote.' },
                    { id: '2', index: 2, text: 'Second footnote.' },
                ],
            }];
            const result = await renderBlocks('test', blocks, DEFAULT_SETTINGS);
            const fnFrame = result.frame.children[0] as any;
            expect(fnFrame.children.length).toBe(2);
            expect(fnFrame.children[0].characters).toBe('1. First footnote.');
            expect(fnFrame.children[1].characters).toBe('2. Second footnote.');
        });

        it('should use smaller font size for footnote entries', async () => {
            const blocks: Block[] = [{
                type: 'footnoteSection',
                footnotes: [{ id: '1', index: 1, text: 'A footnote.' }],
            }];
            const result = await renderBlocks('test', blocks, DEFAULT_SETTINGS);
            const fnFrame = result.frame.children[0] as any;
            expect(fnFrame.children[0].fontSize).toBe(13);
        });
    });

    describe('badge row rendering', () => {
        it('should render a badge row frame with correct name', async () => {
            const blocks: Block[] = [{
                type: 'badgeRow',
                badges: [{ label: 'NEW' }],
            }];
            const result = await renderBlocks('test', blocks, DEFAULT_SETTINGS);
            const rowFrame = result.frame.children[0] as any;
            expect(rowFrame.name).toBe('Badge Row');
            expect(rowFrame.layoutMode).toBe('HORIZONTAL');
        });

        it('should render each badge as a pill with label text', async () => {
            const blocks: Block[] = [{
                type: 'badgeRow',
                badges: [
                    { label: 'Alpha' },
                    { label: 'Beta' },
                ],
            }];
            const result = await renderBlocks('test', blocks, DEFAULT_SETTINGS);
            const rowFrame = result.frame.children[0] as any;
            expect(rowFrame.children.length).toBe(2);
            expect(rowFrame.children[0].name).toBe('Badge: Alpha');
            expect(rowFrame.children[1].name).toBe('Badge: Beta');
        });

        it('should render pill text inside each badge frame', async () => {
            const blocks: Block[] = [{
                type: 'badgeRow',
                badges: [{ label: 'Draft' }],
            }];
            const result = await renderBlocks('test', blocks, DEFAULT_SETTINGS);
            const rowFrame = result.frame.children[0] as any;
            const pill = rowFrame.children[0] as any;
            expect(pill.children[0].characters).toBe('Draft');
        });

        it('should apply rounded corners to badge pills', async () => {
            const blocks: Block[] = [{
                type: 'badgeRow',
                badges: [{ label: 'Tag' }],
            }];
            const result = await renderBlocks('test', blocks, DEFAULT_SETTINGS);
            const pill = (result.frame.children[0] as any).children[0];
            expect(pill.cornerRadius).toBe(12);
        });
    });

    describe('mermaid block rendering', () => {
        it('should render a mermaid block as a frame with correct name', async () => {
            const blocks: Block[] = [{
                type: 'mermaid',
                content: 'graph TD\n  A-->B',
            }];
            const result = await renderBlocks('test', blocks, DEFAULT_SETTINGS);
            expect(result.frame.children).toHaveLength(1);
            const mermaidFrame = result.frame.children[0] as any;
            expect(mermaidFrame.name).toBe('Mermaid Diagram');
        });

        it('should render mermaid label and source children', async () => {
            const blocks: Block[] = [{
                type: 'mermaid',
                content: 'sequenceDiagram\n  A->>B: Hello',
            }];
            const result = await renderBlocks('test', blocks, DEFAULT_SETTINGS);
            const mermaidFrame = result.frame.children[0] as any;
            expect(mermaidFrame.children).toHaveLength(2);
            expect(mermaidFrame.children[0].characters).toBe('Mermaid Diagram');
            expect(mermaidFrame.children[1].characters).toBe('sequenceDiagram\n  A->>B: Hello');
        });

        it('should render mermaid with dashed border', async () => {
            const blocks: Block[] = [{
                type: 'mermaid',
                content: 'pie\n  "A" : 30',
            }];
            const result = await renderBlocks('test', blocks, DEFAULT_SETTINGS);
            const mermaidFrame = result.frame.children[0] as any;
            expect(mermaidFrame.dashPattern).toEqual([4, 4]);
        });

        it('should handle empty mermaid content', async () => {
            const blocks: Block[] = [{
                type: 'mermaid',
                content: '',
            }];
            const result = await renderBlocks('test', blocks, DEFAULT_SETTINGS);
            const mermaidFrame = result.frame.children[0] as any;
            expect(mermaidFrame.children[1].characters).toBe('');
        });
    });

    describe('math block rendering', () => {
        it('should render a math block as a frame with correct name', async () => {
            const blocks: Block[] = [{
                type: 'math',
                content: 'E = mc^2',
                displayMode: true,
            }];
            const result = await renderBlocks('test', blocks, DEFAULT_SETTINGS);
            expect(result.frame.children).toHaveLength(1);
            const mathFrame = result.frame.children[0] as any;
            expect(mathFrame.name).toBe('Math Block');
        });

        it('should render math content centered', async () => {
            const blocks: Block[] = [{
                type: 'math',
                content: '\\sum_{i=0}^{n} x_i',
                displayMode: true,
            }];
            const result = await renderBlocks('test', blocks, DEFAULT_SETTINGS);
            const mathFrame = result.frame.children[0] as any;
            const textNode = mathFrame.children[0] as any;
            expect(textNode.characters).toBe('\\sum_{i=0}^{n} x_i');
            expect(textNode.textAlignHorizontal).toBe('CENTER');
        });

        it('should render math block with warm background', async () => {
            const blocks: Block[] = [{
                type: 'math',
                content: 'f(x)',
                displayMode: true,
            }];
            const result = await renderBlocks('test', blocks, DEFAULT_SETTINGS);
            const mathFrame = result.frame.children[0] as any;
            expect(mathFrame.fills).toBeDefined();
            expect(mathFrame.fills[0].type).toBe('SOLID');
        });

        it('should handle empty math content', async () => {
            const blocks: Block[] = [{
                type: 'math',
                content: '',
                displayMode: true,
            }];
            const result = await renderBlocks('test', blocks, DEFAULT_SETTINGS);
            const mathFrame = result.frame.children[0] as any;
            expect(mathFrame.children[0].characters).toBe('');
        });
    });

    describe('component naming', () => {
        it('should return correct names for all block types', () => {
            expect(componentName({ type: 'heading', level: 1, content: 'Title' })).toBe('Heading/H1 — Title');
            expect(componentName({ type: 'heading', level: 2 })).toBe('Heading/H2');
            expect(componentName({ type: 'paragraph', content: 'Hello' })).toBe('Body/Paragraph — Hello');
            expect(componentName({ type: 'code', language: 'typescript' })).toBe('Code/typescript');
            expect(componentName({ type: 'code' })).toBe('Code/plain');
            expect(componentName({ type: 'quote', content: 'wisdom' })).toBe('Body/Blockquote — wisdom');
            expect(componentName({ type: 'separator' })).toBe('Divider/HR');
            expect(componentName({ type: 'table' })).toBe('Data/Table');
            expect(componentName({ type: 'image', imageAlt: 'photo' })).toBe('Media/Image — photo');
            expect(componentName({ type: 'list', content: 'item' })).toBe('List/Unordered — item');
            expect(componentName({ type: 'orderedListItem', content: 'step' })).toBe('List/Ordered — step');
            expect(componentName({ type: 'taskListItem', checked: true, content: 'done' })).toBe('List/Task ✓ — done');
            expect(componentName({ type: 'taskListItem', checked: false })).toBe('List/Task');
            expect(componentName({ type: 'callout', calloutType: 'warning' })).toBe('Callout/warning');
            expect(componentName({ type: 'toc' })).toBe('Navigation/TOC');
            expect(componentName({ type: 'definitionList' })).toBe('Body/Definition List');
            expect(componentName({ type: 'footnoteSection' })).toBe('Body/Footnotes');
            expect(componentName({ type: 'badgeRow' })).toBe('Badge/Row');
            expect(componentName({ type: 'mermaid' })).toBe('Diagram/Mermaid');
            expect(componentName({ type: 'math' })).toBe('Math/Display');
        });

        it('should truncate long content in names', () => {
            const longContent = 'A'.repeat(100);
            const name = componentName({ type: 'paragraph', content: longContent });
            expect(name.length).toBeLessThan(60);
            expect(name).toContain('…');
        });

        it('should apply component names when setting is enabled', async () => {
            const blocks: Block[] = [
                { type: 'heading', level: 1, content: 'Title' },
                { type: 'paragraph', content: 'Body text' },
            ];
            const settingsWithNames = { ...DEFAULT_SETTINGS, componentNames: true };
            const result = await renderBlocks('test', blocks, settingsWithNames);
            expect(result.frame.children[0].name).toBe('Heading/H1 — Title');
            expect(result.frame.children[1].name).toBe('Body/Paragraph — Body text');
        });

        it('should not apply component names when setting is disabled', async () => {
            const blocks: Block[] = [
                { type: 'separator' },
            ];
            const result = await renderBlocks('test', blocks, DEFAULT_SETTINGS);
            // Default name comes from the rectangle (figma mock)
            expect(result.frame.children[0].name).not.toBe('Divider/HR');
        });

        it('should apply component names to list items when enabled', async () => {
            const blocks: Block[] = [
                { type: 'list', content: 'Item 1', depth: 0 },
                { type: 'list', content: 'Item 2', depth: 0 },
            ];
            const settingsWithNames = { ...DEFAULT_SETTINGS, componentNames: true };
            const result = await renderBlocks('test', blocks, settingsWithNames);
            const listGroup = result.frame.children[0] as any;
            expect(listGroup.children[0].name).toBe('List/Unordered — Item 1');
            expect(listGroup.children[1].name).toBe('List/Unordered — Item 2');
        });
    });

    describe('component output mode', () => {
        /** Creates a mock TextNode for component output mode tests. */
        function makeMockTextLayer(name: string, fontStyle = 'Regular'): any {
            return {
                type: 'TEXT',
                name,
                characters: '',
                fontName: { family: 'Inter', style: fontStyle },
                fontSize: 16,
                fills: [],
                layoutAlign: 'MIN',
                layoutGrow: 0,
                textAlignHorizontal: 'LEFT',
                paragraphIndent: 0,
                opacity: 1,
                parent: null,
                setRangeFontName: jest.fn(),
                setRangeTextDecoration: jest.fn(),
                setRangeHyperlink: jest.fn(),
                setRangeFills: jest.fn(),
                insertCharacters: jest.fn(),
                remove: jest.fn(),
                setTextStyleIdAsync: jest.fn().mockResolvedValue(undefined),
            };
        }

        it('should show error placeholder when component binding points to non-existent node', async () => {
            (figma.getNodeByIdAsync as jest.Mock).mockResolvedValue(null);
            const blocks: Block[] = [
                { type: 'code', content: 'console.log("hi")', language: 'js' },
            ];
            const settings = {
                ...DEFAULT_SETTINGS,
                componentBindings: { codeBlock: 'nonexistent-id' },
            };
            const result = await renderBlocks('test', blocks, settings);
            expect(result.frame.children.length).toBe(1);
            // Should show error placeholder since component binding was configured but failed
            expect(result.frame.children[0].type).toBe('FRAME');
        });

        it('should show error placeholder when component has no #content layer', async () => {
            const mockInstance = {
                type: 'INSTANCE',
                layoutAlign: 'MIN',
                children: [
                    { type: 'RECTANGLE', name: 'background', children: undefined },
                ],
                remove: jest.fn(),
            };
            const mockComponent = {
                type: 'COMPONENT',
                name: 'My Code Block',
                createInstance: jest.fn(() => mockInstance),
            };
            (figma.getNodeByIdAsync as jest.Mock).mockResolvedValue(mockComponent);

            const blocks: Block[] = [
                { type: 'code', content: 'hello', language: 'py' },
            ];
            const settings = {
                ...DEFAULT_SETTINGS,
                componentBindings: { codeBlock: 'comp-123' },
            };
            const result = await renderBlocks('test', blocks, settings);
            expect(mockInstance.remove).toHaveBeenCalled();
            // Should show error placeholder, not silently fall back
            expect(result.frame.children[0].type).toBe('FRAME');
        });

        it('should use component instance when #content layer exists', async () => {
            const contentLayer = makeMockTextLayer('#content');
            const mockInstance = {
                type: 'INSTANCE',
                name: 'My Code Block',
                layoutAlign: 'MIN',
                children: [contentLayer],
                remove: jest.fn(),
            };
            const mockComponent = {
                type: 'COMPONENT',
                name: 'My Code Block',
                createInstance: jest.fn(() => mockInstance),
            };
            (figma.getNodeByIdAsync as jest.Mock).mockResolvedValue(mockComponent);

            const blocks: Block[] = [
                { type: 'quote', content: 'A wise saying' },
            ];
            const settings = {
                ...DEFAULT_SETTINGS,
                componentBindings: { blockquote: 'comp-456' },
            };
            const result = await renderBlocks('test', blocks, settings);
            expect(mockComponent.createInstance).toHaveBeenCalled();
            expect(contentLayer.characters).toBe('A wise saying');
            expect(result.frame.children[0]).toBe(mockInstance);
        });

        it('should find #body layer as alternative to #content', async () => {
            const bodyLayer = makeMockTextLayer('#body');
            const mockInstance = {
                type: 'INSTANCE',
                name: 'Quote Component',
                layoutAlign: 'MIN',
                children: [bodyLayer],
                remove: jest.fn(),
            };
            const mockComponent = {
                type: 'COMPONENT',
                name: 'Quote Component',
                createInstance: jest.fn(() => mockInstance),
            };
            (figma.getNodeByIdAsync as jest.Mock).mockResolvedValue(mockComponent);

            const blocks: Block[] = [
                { type: 'quote', content: 'Body layer test' },
            ];
            const settings = {
                ...DEFAULT_SETTINGS,
                componentBindings: { blockquote: 'comp-body-1' },
            };
            const result = await renderBlocks('test', blocks, settings);
            expect(bodyLayer.characters).toBe('Body layer test');
            expect(result.frame.children[0]).toBe(mockInstance);
        });

        it('should find #label layer as alternative to #title', async () => {
            const contentLayer = makeMockTextLayer('#content');
            const labelLayer = makeMockTextLayer('#label', 'Bold');
            const mockInstance = {
                type: 'INSTANCE',
                name: 'Callout Component',
                layoutAlign: 'MIN',
                children: [labelLayer, contentLayer],
                remove: jest.fn(),
            };
            const mockComponent = {
                type: 'COMPONENT',
                name: 'Callout Component',
                createInstance: jest.fn(() => mockInstance),
            };
            (figma.getNodeByIdAsync as jest.Mock).mockResolvedValue(mockComponent);

            const blocks: Block[] = [
                { type: 'callout', calloutType: 'tip', content: 'Label test' },
            ];
            const settings = {
                ...DEFAULT_SETTINGS,
                componentBindings: { callout: 'comp-label-1' },
            };
            const result = await renderBlocks('test', blocks, settings);
            expect(labelLayer.characters).toBe('tip');
            expect(contentLayer.characters).toBe('Label test');
        });

        it('should find #content layer nested inside frames', async () => {
            const contentLayer = makeMockTextLayer('#content');
            const mockInstance = {
                type: 'INSTANCE',
                name: 'Nested Component',
                layoutAlign: 'MIN',
                children: [
                    {
                        type: 'FRAME',
                        name: 'wrapper',
                        children: [
                            {
                                type: 'FRAME',
                                name: 'inner',
                                children: [contentLayer],
                            },
                        ],
                    },
                ],
                remove: jest.fn(),
            };
            const mockComponent = {
                type: 'COMPONENT',
                name: 'Nested Component',
                createInstance: jest.fn(() => mockInstance),
            };
            (figma.getNodeByIdAsync as jest.Mock).mockResolvedValue(mockComponent);

            const blocks: Block[] = [
                { type: 'quote', content: 'Deeply nested' },
            ];
            const settings = {
                ...DEFAULT_SETTINGS,
                componentBindings: { blockquote: 'comp-nested-1' },
            };
            const result = await renderBlocks('test', blocks, settings);
            expect(contentLayer.characters).toBe('Deeply nested');
            expect(result.frame.children[0]).toBe(mockInstance);
        });

        it('should handle figma.mixed fontName by using getRangeFontName', async () => {
            const contentLayer = makeMockTextLayer('#content');
            contentLayer.fontName = figma.mixed;
            contentLayer.getRangeFontName = jest.fn().mockReturnValue({ family: 'Roboto', style: 'Bold' });
            const mockInstance = {
                type: 'INSTANCE',
                name: 'Mixed Font Component',
                layoutAlign: 'MIN',
                children: [contentLayer],
                remove: jest.fn(),
            };
            const mockComponent = {
                type: 'COMPONENT',
                name: 'Mixed Font Component',
                createInstance: jest.fn(() => mockInstance),
            };
            (figma.getNodeByIdAsync as jest.Mock).mockResolvedValue(mockComponent);

            const blocks: Block[] = [
                { type: 'quote', content: 'Mixed font test' },
            ];
            const settings = {
                ...DEFAULT_SETTINGS,
                componentBindings: { blockquote: 'comp-mixed-1' },
            };
            const result = await renderBlocks('test', blocks, settings);
            expect(contentLayer.getRangeFontName).toHaveBeenCalledWith(0, 1);
            expect(contentLayer.characters).toBe('Mixed font test');
            expect(result.frame.children[0]).toBe(mockInstance);
        });

        it('should populate #title layer from calloutType', async () => {
            const contentLayer = makeMockTextLayer('#content');
            const titleLayer = makeMockTextLayer('#title', 'Bold');
            const mockInstance = {
                type: 'INSTANCE',
                name: 'Callout Component',
                layoutAlign: 'MIN',
                children: [titleLayer, contentLayer],
                remove: jest.fn(),
            };
            const mockComponent = {
                type: 'COMPONENT',
                name: 'Callout Component',
                createInstance: jest.fn(() => mockInstance),
            };
            (figma.getNodeByIdAsync as jest.Mock).mockResolvedValue(mockComponent);

            const blocks: Block[] = [
                { type: 'callout', calloutType: 'warning', content: 'Be careful!' },
            ];
            const settings = {
                ...DEFAULT_SETTINGS,
                componentBindings: { callout: 'comp-callout-1' },
            };
            const result = await renderBlocks('test', blocks, settings);
            expect(mockComponent.createInstance).toHaveBeenCalled();
            expect(titleLayer.characters).toBe('warning');
            expect(contentLayer.characters).toBe('Be careful!');
            expect(result.frame.children[0]).toBe(mockInstance);
        });

        it('should render successfully when titleText provided but no #title layer exists', async () => {
            const contentLayer = makeMockTextLayer('#content');
            const mockInstance = {
                type: 'INSTANCE',
                name: 'Callout No Title',
                layoutAlign: 'MIN',
                children: [contentLayer],
                remove: jest.fn(),
            };
            const mockComponent = {
                type: 'COMPONENT',
                name: 'Callout No Title',
                createInstance: jest.fn(() => mockInstance),
            };
            (figma.getNodeByIdAsync as jest.Mock).mockResolvedValue(mockComponent);

            const blocks: Block[] = [
                { type: 'callout', calloutType: 'warning', content: 'No title layer' },
            ];
            const settings = {
                ...DEFAULT_SETTINGS,
                componentBindings: { callout: 'comp-no-title-1' },
            };
            const result = await renderBlocks('test', blocks, settings);
            expect(contentLayer.characters).toBe('No title layer');
            expect(result.frame.children[0]).toBe(mockInstance);
        });

        it('should use applyInlineStyles when block has tokens in component mode', async () => {
            const contentLayer = makeMockTextLayer('#content');
            const mockInstance = {
                type: 'INSTANCE',
                name: 'Quote Component',
                layoutAlign: 'MIN',
                children: [contentLayer],
                remove: jest.fn(),
            };
            const mockComponent = {
                type: 'COMPONENT',
                name: 'Quote Component',
                createInstance: jest.fn(() => mockInstance),
            };
            (figma.getNodeByIdAsync as jest.Mock).mockResolvedValue(mockComponent);

            const blocks: Block[] = [
                {
                    type: 'quote',
                    content: 'bold text',
                    tokens: [
                        { type: 'strong', raw: '**bold text**', text: 'bold text', tokens: [
                            { type: 'text', raw: 'bold text', text: 'bold text' },
                        ] } as any,
                    ],
                },
            ];
            const settings = {
                ...DEFAULT_SETTINGS,
                componentBindings: { blockquote: 'comp-quote-1' },
            };
            const result = await renderBlocks('test', blocks, settings);
            expect(mockComponent.createInstance).toHaveBeenCalled();
            expect(contentLayer.characters).toBe('bold text');
            expect(contentLayer.setRangeFontName).toHaveBeenCalled();
            expect(result.frame.children[0]).toBe(mockInstance);
        });

        it('should show error placeholder when component node type is FRAME instead of COMPONENT', async () => {
            const mockFrameNode = {
                type: 'FRAME',
                name: 'Not A Component',
            };
            (figma.getNodeByIdAsync as jest.Mock).mockResolvedValue(mockFrameNode);

            const blocks: Block[] = [
                { type: 'code', content: 'let x = 1;', language: 'js' },
            ];
            const settings = {
                ...DEFAULT_SETTINGS,
                componentBindings: { codeBlock: 'frame-id-999' },
            };
            const result = await renderBlocks('test', blocks, settings);
            // Should show error placeholder since binding was misconfigured
            expect(result.frame.children.length).toBe(1);
            expect(result.frame.children[0].type).toBe('FRAME');
        });

        it('should show error placeholder when createInstance throws', async () => {
            const mockComponent = {
                type: 'COMPONENT',
                name: 'Broken Component',
                createInstance: jest.fn(() => { throw new Error('Instance creation failed'); }),
            };
            (figma.getNodeByIdAsync as jest.Mock).mockResolvedValue(mockComponent);

            const blocks: Block[] = [
                { type: 'quote', content: 'Should show error' },
            ];
            const settings = {
                ...DEFAULT_SETTINGS,
                componentBindings: { blockquote: 'comp-broken-1' },
            };
            const result = await renderBlocks('test', blocks, settings);
            // Should show error placeholder, not crash
            expect(result.frame.children.length).toBe(1);
            expect(result.frame.children[0].type).toBe('FRAME');
        });

        it('should render normally when componentBindings is empty', async () => {
            const blocks: Block[] = [
                { type: 'quote', content: 'Normal quote' },
            ];
            const result = await renderBlocks('test', blocks, DEFAULT_SETTINGS);
            expect(result.frame.children.length).toBe(1);
            expect(result.frame.children[0].type).toBe('TEXT');
        });

        it('should call getNodeByIdAsync only once for repeated component bindings in same batch', async () => {
            const contentLayer1 = makeMockTextLayer('#content');
            const contentLayer2 = makeMockTextLayer('#content');
            let callCount = 0;
            const mockComponent = {
                type: 'COMPONENT',
                name: 'Shared Component',
                createInstance: jest.fn(() => {
                    callCount++;
                    const layer = callCount === 1 ? contentLayer1 : contentLayer2;
                    return {
                        type: 'INSTANCE',
                        name: 'Shared Component',
                        layoutAlign: 'MIN',
                        children: [layer],
                        remove: jest.fn(),
                    };
                }),
            };
            (figma.getNodeByIdAsync as jest.Mock).mockResolvedValue(mockComponent);

            const blocks: Block[] = [
                { type: 'quote', content: 'Quote one' },
                { type: 'quote', content: 'Quote two' },
            ];
            const settings = {
                ...DEFAULT_SETTINGS,
                componentBindings: { blockquote: 'comp-shared-1' },
            };
            const result = await renderBlocks('test', blocks, settings);
            // Cache should prevent duplicate lookups
            expect(figma.getNodeByIdAsync).toHaveBeenCalledTimes(1);
            expect(mockComponent.createInstance).toHaveBeenCalledTimes(2);
            expect(contentLayer1.characters).toBe('Quote one');
            expect(contentLayer2.characters).toBe('Quote two');
        });

        it('should populate table component with serialized row data', async () => {
            const contentLayer = makeMockTextLayer('#content');
            const titleLayer = makeMockTextLayer('#title', 'Bold');
            const mockInstance = {
                type: 'INSTANCE',
                name: 'Table Component',
                layoutAlign: 'MIN',
                children: [titleLayer, contentLayer],
                remove: jest.fn(),
            };
            const mockComponent = {
                type: 'COMPONENT',
                name: 'Table Component',
                createInstance: jest.fn(() => mockInstance),
            };
            (figma.getNodeByIdAsync as jest.Mock).mockResolvedValue(mockComponent);

            const blocks: Block[] = [
                {
                    type: 'table',
                    header: [{ text: 'Name' }, { text: 'Age' }] as any,
                    rows: [
                        [{ text: 'Alice' }, { text: '30' }],
                        [{ text: 'Bob' }, { text: '25' }],
                    ] as any,
                    align: [null, null],
                },
            ];
            const settings = {
                ...DEFAULT_SETTINGS,
                componentBindings: { table: 'comp-table-1' },
            };
            const result = await renderBlocks('test', blocks, settings);
            expect(titleLayer.characters).toBe('Name | Age');
            expect(contentLayer.characters).toBe('Alice | 30\nBob | 25');
            expect(result.frame.children[0]).toBe(mockInstance);
        });

        it('should populate image component with imageUrl as content', async () => {
            const contentLayer = makeMockTextLayer('#content');
            const titleLayer = makeMockTextLayer('#title', 'Bold');
            const mockInstance = {
                type: 'INSTANCE',
                name: 'Image Component',
                layoutAlign: 'MIN',
                children: [titleLayer, contentLayer],
                remove: jest.fn(),
            };
            const mockComponent = {
                type: 'COMPONENT',
                name: 'Image Component',
                createInstance: jest.fn(() => mockInstance),
            };
            (figma.getNodeByIdAsync as jest.Mock).mockResolvedValue(mockComponent);

            const blocks: Block[] = [
                {
                    type: 'image',
                    imageUrl: 'https://example.com/photo.png',
                    imageAlt: 'A photo',
                },
            ];
            const settings = {
                ...DEFAULT_SETTINGS,
                componentBindings: { image: 'comp-image-1' },
            };
            const result = await renderBlocks('test', blocks, settings);
            expect(titleLayer.characters).toBe('A photo');
            expect(contentLayer.characters).toBe('https://example.com/photo.png');
            expect(result.frame.children[0]).toBe(mockInstance);
        });

        it('should set content to empty string when block.content is undefined', async () => {
            const contentLayer = makeMockTextLayer('#content');
            const mockInstance = {
                type: 'INSTANCE',
                name: 'Quote Component',
                layoutAlign: 'MIN',
                children: [contentLayer],
                remove: jest.fn(),
            };
            const mockComponent = {
                type: 'COMPONENT',
                name: 'Quote Component',
                createInstance: jest.fn(() => mockInstance),
            };
            (figma.getNodeByIdAsync as jest.Mock).mockResolvedValue(mockComponent);

            const blocks: Block[] = [
                { type: 'quote', content: undefined },
            ];
            const settings = {
                ...DEFAULT_SETTINGS,
                componentBindings: { blockquote: 'comp-undef-1' },
            };
            const result = await renderBlocks('test', blocks, settings);
            expect(contentLayer.characters).toBe('');
            expect(result.frame.children[0]).toBe(mockInstance);
        });

        it('should clean up instance when font loading fails', async () => {
            const contentLayer = makeMockTextLayer('#content');
            // Use an unusual font that will trigger the loadFontAsync call in tryRenderWithComponent
            contentLayer.fontName = { family: 'MissingFont', style: 'Regular' };
            const mockInstance = {
                type: 'INSTANCE',
                name: 'Font Fail Component',
                layoutAlign: 'MIN',
                children: [contentLayer],
                remove: jest.fn(),
            };
            const mockComponent = {
                type: 'COMPONENT',
                name: 'Font Fail Component',
                createInstance: jest.fn(() => mockInstance),
            };
            (figma.getNodeByIdAsync as jest.Mock).mockResolvedValue(mockComponent);
            // Reject only for the specific font used by the content layer
            const originalLoadFont = (figma.loadFontAsync as jest.Mock).getMockImplementation() || (() => Promise.resolve(undefined));
            (figma.loadFontAsync as jest.Mock).mockImplementation((font: any) => {
                if (font.family === 'MissingFont') return Promise.reject(new Error('Font not found'));
                return Promise.resolve(undefined);
            });

            const blocks: Block[] = [
                { type: 'quote', content: 'Should fail on font' },
            ];
            const settings = {
                ...DEFAULT_SETTINGS,
                componentBindings: { blockquote: 'comp-fontfail-1' },
            };
            const result = await renderBlocks('test', blocks, settings);
            // Instance should be cleaned up
            expect(mockInstance.remove).toHaveBeenCalled();
            // Should show error placeholder
            expect(result.frame.children.length).toBe(1);
            expect(result.frame.children[0].type).toBe('FRAME');

            // Restore original mock
            (figma.loadFontAsync as jest.Mock).mockImplementation(() => Promise.resolve(undefined));
        });

        it('should set layoutAlign to STRETCH on component instance', async () => {
            const contentLayer = makeMockTextLayer('#content');
            const mockInstance = {
                type: 'INSTANCE',
                name: 'Stretch Test',
                layoutAlign: 'MIN',
                children: [contentLayer],
                remove: jest.fn(),
            };
            const mockComponent = {
                type: 'COMPONENT',
                name: 'Stretch Test',
                createInstance: jest.fn(() => mockInstance),
            };
            (figma.getNodeByIdAsync as jest.Mock).mockResolvedValue(mockComponent);

            const blocks: Block[] = [
                { type: 'quote', content: 'stretch test' },
            ];
            const settings = {
                ...DEFAULT_SETTINGS,
                componentBindings: { blockquote: 'comp-stretch-1' },
            };
            await renderBlocks('test', blocks, settings);
            expect(mockInstance.layoutAlign).toBe('STRETCH');
        });
    });
});
