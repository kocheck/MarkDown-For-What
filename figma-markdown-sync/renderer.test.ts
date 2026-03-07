/**
 * Unit tests for renderer.ts
 * Tests renderBlocks list grouping, targetNode replacement (build-then-swap),
 * error placeholder fallback, and image failure tracking.
 */

import { renderBlocks, computeNewFrameX } from './renderer';
import { DEFAULT_SETTINGS } from './settings';
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

            const settings = { ...DEFAULT_SETTINGS, frameWidth: 600 };
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
});
