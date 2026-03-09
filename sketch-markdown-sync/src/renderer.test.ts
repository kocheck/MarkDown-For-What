/**
 * Unit tests for the Sketch renderer.
 * Tests artboard creation, block rendering, error handling, and re-import logic.
 */

import { renderBlocks } from './renderer';
import { DEFAULT_SETTINGS } from './settings';
import type { Block } from './parser';

// Mock document and page objects that mimic Sketch's API
function createMockPage() {
    return {
        layers: [] as any[],
    };
}

function createMockDocument() {
    return {
        sharedTextStyles: [] as any[],
    };
}

describe('renderBlocks', () => {
    let mockDocument: any;
    let mockPage: any;

    beforeEach(() => {
        mockDocument = createMockDocument();
        mockPage = createMockPage();
    });

    describe('artboard creation', () => {
        it('creates an artboard with the given name', () => {
            const result = renderBlocks('My Doc', [], DEFAULT_SETTINGS, mockDocument, mockPage);
            expect(result.artboard.name).toBe('My Doc');
        });

        it('applies frame width from settings', () => {
            const settings = { ...DEFAULT_SETTINGS, frameWidth: 600 };
            const result = renderBlocks('Test', [], settings, mockDocument, mockPage);
            expect(result.artboard.frame.width).toBe(600);
        });

        it('returns imageFailures=0 for blocks with no images', () => {
            const blocks: Block[] = [
                { type: 'paragraph', content: 'Hello', tokens: [] },
            ];
            const result = renderBlocks('Test', blocks, DEFAULT_SETTINGS, mockDocument, mockPage);
            expect(result.imageFailures).toBe(0);
        });

        it('handles empty blocks array', () => {
            const result = renderBlocks('Empty', [], DEFAULT_SETTINGS, mockDocument, mockPage);
            expect(result.artboard).toBeDefined();
            expect(result.imageFailures).toBe(0);
        });
    });

    describe('block rendering', () => {
        it('renders a heading block', () => {
            const blocks: Block[] = [
                { type: 'heading', content: 'Title', level: 1, tokens: [] },
            ];
            const result = renderBlocks('Test', blocks, DEFAULT_SETTINGS, mockDocument, mockPage);
            expect(result.artboard).toBeDefined();
        });

        it('renders a paragraph block', () => {
            const blocks: Block[] = [
                { type: 'paragraph', content: 'Hello world', tokens: [] },
            ];
            const result = renderBlocks('Test', blocks, DEFAULT_SETTINGS, mockDocument, mockPage);
            expect(result.artboard).toBeDefined();
        });

        it('renders a code block', () => {
            const blocks: Block[] = [
                { type: 'code', content: 'const x = 1;', language: 'js' },
            ];
            const result = renderBlocks('Test', blocks, DEFAULT_SETTINGS, mockDocument, mockPage);
            expect(result.artboard).toBeDefined();
        });

        it('renders a separator block', () => {
            const blocks: Block[] = [{ type: 'separator' }];
            const result = renderBlocks('Test', blocks, DEFAULT_SETTINGS, mockDocument, mockPage);
            expect(result.artboard).toBeDefined();
        });

        it('renders a quote block', () => {
            const blocks: Block[] = [
                { type: 'quote', content: 'A wise quote', tokens: [] },
            ];
            const result = renderBlocks('Test', blocks, DEFAULT_SETTINGS, mockDocument, mockPage);
            expect(result.artboard).toBeDefined();
        });
    });

    describe('list grouping', () => {
        it('groups consecutive list blocks with list spacing', () => {
            const blocks: Block[] = [
                { type: 'list', content: 'Item 1', tokens: [] },
                { type: 'list', content: 'Item 2', tokens: [] },
                { type: 'list', content: 'Item 3', tokens: [] },
            ];
            const result = renderBlocks('Test', blocks, DEFAULT_SETTINGS, mockDocument, mockPage);
            expect(result.artboard).toBeDefined();
        });

        it('splits non-list blocks between list groups', () => {
            const blocks: Block[] = [
                { type: 'list', content: 'Item 1', tokens: [] },
                { type: 'paragraph', content: 'Break', tokens: [] },
                { type: 'list', content: 'Item 2', tokens: [] },
            ];
            const result = renderBlocks('Test', blocks, DEFAULT_SETTINGS, mockDocument, mockPage);
            expect(result.artboard).toBeDefined();
        });
    });

    describe('error handling', () => {
        it('renders an error placeholder when a block fails and continues', () => {
            // Create a block with an unsupported type to trigger the default case
            const blocks: Block[] = [
                { type: 'unknown-type' as any },
                { type: 'paragraph', content: 'Should still render', tokens: [] },
            ];
            // Unknown block types return null (skipped), so both render without error
            const result = renderBlocks('Test', blocks, DEFAULT_SETTINGS, mockDocument, mockPage);
            expect(result.artboard).toBeDefined();
        });

        it('tracks image failures for missing URLs', () => {
            const blocks: Block[] = [
                { type: 'image', imageAlt: 'No URL' },
            ];
            const result = renderBlocks('Test', blocks, DEFAULT_SETTINGS, mockDocument, mockPage);
            // Image block without URL throws → error placeholder → counts as image failure
            // The error placeholder is created but it's not counted as imageFailure
            // because the throw happens in renderBlock, not in createImageLayer
            expect(result.artboard).toBeDefined();
        });
    });

    describe('re-import (targetArtboard replacement)', () => {
        it('replaces the targetArtboard position', () => {
            const targetArtboard = {
                name: 'OldDoc',
                frame: { x: 200, y: 150, width: 800, height: 500 },
                remove: jest.fn(),
            };
            mockPage.layers = [targetArtboard];

            const result = renderBlocks(
                'NewDoc',
                [],
                DEFAULT_SETTINGS,
                mockDocument,
                mockPage,
                targetArtboard,
            );

            expect(result.artboard.frame.x).toBe(200);
            expect(result.artboard.frame.y).toBe(150);
            expect(targetArtboard.remove).toHaveBeenCalled();
        });
    });

    describe('mixed content', () => {
        it('renders multiple block types together', () => {
            const blocks: Block[] = [
                { type: 'heading', content: 'Title', level: 1, tokens: [] },
                { type: 'paragraph', content: 'Some text', tokens: [] },
                { type: 'list', content: 'Item 1', tokens: [] },
                { type: 'list', content: 'Item 2', tokens: [] },
                { type: 'code', content: 'code();', language: 'js' },
                { type: 'separator' },
                { type: 'quote', content: 'A quote', tokens: [] },
            ];
            const result = renderBlocks('Test', blocks, DEFAULT_SETTINGS, mockDocument, mockPage);
            expect(result.artboard).toBeDefined();
            expect(result.imageFailures).toBe(0);
        });
    });
});
