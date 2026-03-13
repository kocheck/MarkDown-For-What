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
    // Reset findAllWithCriteria to return empty array by default
    (figma.currentPage as any).findAllWithCriteria = jest.fn(() => []);
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
        (figma.currentPage as any).findAllWithCriteria = jest.fn(() => [mockFrame]);

        const fakeResult: ExportFrameResult = {
            frameId: 'frame-1',
            filename: 'my-frame.md',
            sourceStatus: 'none',
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
        // findAllWithCriteria returns empty — no frames on page
        (figma.currentPage as any).findAllWithCriteria = jest.fn(() => []);

        await sendMessage({ type: MSG_EXPORT_REQUEST, frameIds: ['nonexistent-id'] });

        const msgs = postedMessages();
        expect(msgs).toContainEqual(
            expect.objectContaining({ type: MSG_STATUS, error: true })
        );
        expect(mockExportFrame).not.toHaveBeenCalled();
    });

    it('skips missing frames and still sends export-result with found frames', async () => {
        // Two frame IDs requested; only one exists on the page
        const foundFrame = { id: 'frame-1', type: 'FRAME', name: 'Found' };
        (figma.currentPage as any).findAllWithCriteria = jest.fn(() => [foundFrame]);

        const mockResult: ExportFrameResult = {
            frameId: 'frame-1',
            filename: 'Found',
            sourceStatus: 'none',
            blocks: [],
            skippedLayers: [],
        };
        mockExportFrame.mockResolvedValueOnce(mockResult);

        await sendMessage({ type: MSG_EXPORT_REQUEST, frameIds: ['frame-1', 'frame-missing'] });

        // Should have sent an error status for the missing frame
        expect(figma.ui.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({ type: MSG_STATUS, error: true })
        );
        // But should still send export-result with the found frames
        expect(figma.ui.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({ type: MSG_EXPORT_RESULT, frames: [mockResult] })
        );
    });
});

// ─── MSG_EXPORT_DOWNLOAD handler ──────────────────────────────────────────────

describe('MSG_EXPORT_DOWNLOAD handler', () => {
    it('uses cached export result and assembles markdown without re-inferring', async () => {
        const mockFrame = { type: 'FRAME', id: 'frame-dl', name: 'Download Frame' };
        (figma.currentPage as any).findAllWithCriteria = jest.fn(() => [mockFrame]);

        const fakeResult: ExportFrameResult = {
            frameId: 'frame-dl',
            filename: 'hello.md',
            sourceStatus: 'present',
            blocks: [{ state: 'unchanged', originalText: '# Hello', inferredText: '# Hello' }],
            skippedLayers: [],
        };
        mockExportFrame.mockResolvedValue(fakeResult);

        const assembled = '# Hello\n\nSome content';
        mockAssembleMarkdown.mockReturnValue(assembled);

        // Populate cache via MSG_EXPORT_REQUEST first
        await sendMessage({ type: MSG_EXPORT_REQUEST, frameIds: ['frame-dl'] });
        jest.clearAllMocks(); // clear postMessage calls so we can assert only download messages
        mockAssembleMarkdown.mockReturnValue(assembled);

        const selections: BlockSelection[] = [{ blockIndex: 0, action: 'use-original' }];
        await sendMessage({ type: MSG_EXPORT_DOWNLOAD, frameId: 'frame-dl', selections });

        // exportFrame should NOT be called again — cache hit
        expect(mockExportFrame).not.toHaveBeenCalled();
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

    it('calls exportFrame and assembles markdown when cache miss but frame is found', async () => {
        const frameId = 'frame-1';
        const mockResult: ExportFrameResult = {
            frameId,
            filename: 'my-doc.md',
            sourceStatus: 'present',
            blocks: [{ state: 'new', inferredText: '# Hello' }],
            skippedLayers: [],
        };
        mockExportFrame.mockResolvedValue(mockResult);
        mockAssembleMarkdown.mockReturnValue('# Hello');

        // No prior MSG_EXPORT_REQUEST — cache is empty
        // Set up findOne to return a frame
        (figma.currentPage as any).findOne = jest.fn().mockReturnValue({ id: frameId, name: 'my-doc', type: 'FRAME' });

        await sendMessage({ type: MSG_EXPORT_DOWNLOAD, frameId, selections: [] });

        expect(mockExportFrame).toHaveBeenCalledTimes(1);
        const posted = (figma.ui.postMessage as jest.Mock).mock.calls.find(
            c => c[0].type === MSG_EXPORT_MARKDOWN
        );
        expect(posted).toBeDefined();
        expect(posted[0].filename).toBe('my-doc.md');
        expect(posted[0].content).toBe('# Hello');
    });
});

// ─── MSG_EXPORT_REQUEST handler — additional cases ────────────────────────────

describe('MSG_EXPORT_REQUEST handler — additional cases', () => {
    it('posts MSG_STATUS error for each frame where exportFrame rejects, but still sends MSG_EXPORT_RESULT', async () => {
        const goodFrameId = 'frame-good';
        const badFrameId  = 'frame-bad';

        const mockGoodResult: ExportFrameResult = {
            frameId: goodFrameId,
            filename: 'good.md',
            sourceStatus: 'none',
            blocks: [{ state: 'new', inferredText: '# Good' }],
            skippedLayers: [],
        };
        (figma.currentPage as any).findAllWithCriteria = jest.fn().mockReturnValue([
            { id: goodFrameId, name: 'good', type: 'FRAME' },
            { id: badFrameId,  name: 'bad',  type: 'FRAME' },
        ]);
        mockExportFrame
            .mockResolvedValueOnce(mockGoodResult)
            .mockRejectedValueOnce(new Error('Figma API failure'));

        await sendMessage({ type: MSG_EXPORT_REQUEST, frameIds: [goodFrameId, badFrameId] });

        const statusMessages = (figma.ui.postMessage as jest.Mock).mock.calls.filter(
            c => c[0].type === MSG_STATUS && c[0].error
        );
        expect(statusMessages.length).toBeGreaterThanOrEqual(1);
        expect(statusMessages.some((c: any[]) => c[0].message.includes('bad'))).toBe(true);

        const resultMsg = (figma.ui.postMessage as jest.Mock).mock.calls.find(
            c => c[0].type === MSG_EXPORT_RESULT
        );
        expect(resultMsg).toBeDefined();
        expect(resultMsg[0].frames).toHaveLength(1);
        expect(resultMsg[0].frames[0].frameId).toBe(goodFrameId);
    });

    it('sends MSG_EXPORT_RESULT with empty frames array for empty frameIds', async () => {
        (figma.currentPage as any).findAllWithCriteria = jest.fn().mockReturnValue([]);
        await sendMessage({ type: MSG_EXPORT_REQUEST, frameIds: [] });

        const resultMsg = (figma.ui.postMessage as jest.Mock).mock.calls.find(
            c => c[0].type === MSG_EXPORT_RESULT
        );
        expect(resultMsg).toBeDefined();
        expect(resultMsg[0].frames).toEqual([]);
        expect(mockExportFrame).not.toHaveBeenCalled();
    });
});
