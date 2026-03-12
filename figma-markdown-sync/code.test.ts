/**
 * Unit tests for code.ts message handlers.
 *
 * The IIFE in code.ts runs immediately on import and registers handlers on
 * figma.ui.onmessage and figma.on('selectionchange', ...). We import code.ts
 * once and then drive behaviour by calling figma.ui.onmessage / the
 * selectionchange listener directly.
 */

import { ExportFrameResult, BlockSelection } from './exporter';
import {
    MSG_GET_SELECTION, MSG_SELECTION_CHANGED,
    MSG_EXPORT_REQUEST, MSG_EXPORT_RESULT,
    MSG_EXPORT_DOWNLOAD, MSG_EXPORT_MARKDOWN,
    MSG_STATUS,
} from './messages';

// ─── Mock exporter before importing code.ts ──────────────────────────────────

const mockExportFrame = jest.fn<Promise<ExportFrameResult>, [any]>();
const mockAssembleMarkdown = jest.fn<string, [any, any]>();

jest.mock('./exporter', () => ({
    ...jest.requireActual('./exporter'),
    exportFrame: (frame: any) => mockExportFrame(frame),
    assembleMarkdown: (blocks: any, selections: any) => mockAssembleMarkdown(blocks, selections),
}));

// ─── Import code.ts (runs the IIFE) ──────────────────────────────────────────

// Capture the selectionchange callback before jest.clearAllMocks() erases it.
// code.ts registers via figma.on() at module-load time inside the IIFE.
let selectionChangeCallback: (() => void) | null = null;
(figma as any).on = jest.fn((event: string, cb: () => void) => {
    if (event === 'selectionchange') selectionChangeCallback = cb;
});

import './code';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Dispatch a message through the registered onmessage handler. */
async function sendMessage(msg: Record<string, any>): Promise<void> {
    await (figma.ui as any).onmessage(msg);
}

/** Return all postMessage calls since the last jest.clearAllMocks(). */
function postedMessages(): any[] {
    return (figma.ui.postMessage as jest.Mock).mock.calls.map(c => c[0]);
}

/** Invoke the selectionchange callback registered by code.ts. */
function fireSelectionChange(): void {
    if (!selectionChangeCallback) throw new Error('selectionchange listener not registered');
    selectionChangeCallback();
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
    jest.clearAllMocks();
    // Reset selection to empty by default
    (figma.currentPage as any).selection = [];
    // Reset findOne to return null by default
    (figma.currentPage as any).findOne = jest.fn(() => null);
});

// ─── selectionchange listener ─────────────────────────────────────────────────

describe('selectionchange listener', () => {
    it('posts selection-changed with empty array when nothing is selected', () => {
        (figma.currentPage as any).selection = [];
        fireSelectionChange();
        const msgs = postedMessages();
        expect(msgs).toContainEqual({ type: MSG_SELECTION_CHANGED, frameIds: [] });
    });

    it('posts selection-changed with frame IDs for selected FRAME nodes', () => {
        (figma.currentPage as any).selection = [
            { type: 'FRAME', id: 'frame-1' },
            { type: 'FRAME', id: 'frame-2' },
        ];
        fireSelectionChange();
        const msgs = postedMessages();
        expect(msgs).toContainEqual({ type: MSG_SELECTION_CHANGED, frameIds: ['frame-1', 'frame-2'] });
    });

    it('filters out non-FRAME nodes', () => {
        (figma.currentPage as any).selection = [
            { type: 'TEXT', id: 'text-1' },
            { type: 'FRAME', id: 'frame-1' },
        ];
        fireSelectionChange();
        const msgs = postedMessages();
        expect(msgs).toContainEqual({ type: MSG_SELECTION_CHANGED, frameIds: ['frame-1'] });
    });
});

// ─── MSG_GET_SELECTION handler ────────────────────────────────────────────────

describe('MSG_GET_SELECTION handler', () => {
    it('posts selection-changed with empty array when nothing is selected', async () => {
        (figma.currentPage as any).selection = [];
        await sendMessage({ type: MSG_GET_SELECTION });
        expect(figma.ui.postMessage).toHaveBeenCalledWith({
            type: MSG_SELECTION_CHANGED,
            frameIds: [],
        });
    });

    it('posts selection-changed with frame IDs for selected frames', async () => {
        (figma.currentPage as any).selection = [
            { type: 'FRAME', id: 'frame-a' },
            { type: 'FRAME', id: 'frame-b' },
        ];
        await sendMessage({ type: MSG_GET_SELECTION });
        expect(figma.ui.postMessage).toHaveBeenCalledWith({
            type: MSG_SELECTION_CHANGED,
            frameIds: ['frame-a', 'frame-b'],
        });
    });

    it('filters out non-FRAME nodes from selection', async () => {
        (figma.currentPage as any).selection = [
            { type: 'TEXT', id: 'text-1' },
            { type: 'FRAME', id: 'frame-1' },
        ];
        await sendMessage({ type: MSG_GET_SELECTION });
        expect(figma.ui.postMessage).toHaveBeenCalledWith({
            type: MSG_SELECTION_CHANGED,
            frameIds: ['frame-1'],
        });
    });
});

// ─── MSG_EXPORT_REQUEST handler ───────────────────────────────────────────────

describe('MSG_EXPORT_REQUEST handler', () => {
    it('calls exportFrame for each frameId and posts export-result', async () => {
        const mockFrame = { type: 'FRAME', id: 'frame-1', name: 'My Frame' };
        (figma.currentPage as any).findOne = jest.fn((pred: (n: any) => boolean) =>
            pred(mockFrame) ? mockFrame : null
        );

        const fakeResult: ExportFrameResult = {
            frameId: 'frame-1',
            filename: 'my-frame.md',
            hasStoredSource: false,
            sourceTruncated: false,
            blocks: [],
            skippedLayers: [],
        };
        mockExportFrame.mockResolvedValue(fakeResult);

        await sendMessage({ type: MSG_EXPORT_REQUEST, frameIds: ['frame-1'] });

        expect(mockExportFrame).toHaveBeenCalledWith(mockFrame);
        expect(figma.ui.postMessage).toHaveBeenCalledWith({
            type: MSG_EXPORT_RESULT,
            frames: [fakeResult],
        });
    });

    it('posts error status if frameId not found', async () => {
        (figma.currentPage as any).findOne = jest.fn(() => null);

        await sendMessage({ type: MSG_EXPORT_REQUEST, frameIds: ['nonexistent-id'] });

        const msgs = postedMessages();
        expect(msgs).toContainEqual(
            expect.objectContaining({ type: MSG_STATUS, error: true })
        );
        expect(mockExportFrame).not.toHaveBeenCalled();
    });
});

// ─── MSG_EXPORT_DOWNLOAD handler ──────────────────────────────────────────────

describe('MSG_EXPORT_DOWNLOAD handler', () => {
    it('calls assembleMarkdown with selections and posts export-markdown', async () => {
        const mockFrame = {
            type: 'FRAME',
            id: 'frame-dl',
            name: 'Download Frame',
            _pluginData: { markdownSource: '# Hello', markdownFilename: 'hello.md' },
            getPluginData: jest.fn(function(this: any, key: string) {
                return this._pluginData[key] ?? '';
            }),
        };
        (figma.currentPage as any).findOne = jest.fn((pred: (n: any) => boolean) =>
            pred(mockFrame) ? mockFrame : null
        );

        const fakeResult: ExportFrameResult = {
            frameId: 'frame-dl',
            filename: 'hello.md',
            hasStoredSource: true,
            sourceTruncated: false,
            blocks: [{ state: 'unchanged', originalText: '# Hello', inferredText: '# Hello' }],
            skippedLayers: [],
        };
        mockExportFrame.mockResolvedValue(fakeResult);

        const assembled = '# Hello\n\nSome content';
        mockAssembleMarkdown.mockReturnValue(assembled);

        const selections: BlockSelection[] = [{ blockIndex: 0, useOriginal: true }];

        await sendMessage({
            type: MSG_EXPORT_DOWNLOAD,
            frameId: 'frame-dl',
            selections,
        });

        expect(mockExportFrame).toHaveBeenCalledWith(mockFrame);
        expect(mockAssembleMarkdown).toHaveBeenCalledWith(fakeResult.blocks, selections);
        expect(figma.ui.postMessage).toHaveBeenCalledWith({
            type: MSG_EXPORT_MARKDOWN,
            filename: 'hello.md',
            content: assembled,
        });
    });

    it('posts error status if frameId not found', async () => {
        (figma.currentPage as any).findOne = jest.fn(() => null);

        await sendMessage({
            type: MSG_EXPORT_DOWNLOAD,
            frameId: 'missing-frame',
            selections: [],
        });

        const msgs = postedMessages();
        expect(msgs).toContainEqual(
            expect.objectContaining({ type: MSG_STATUS, error: true })
        );
        expect(mockExportFrame).not.toHaveBeenCalled();
    });
});
