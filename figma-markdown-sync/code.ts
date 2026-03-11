import { parseMarkdownToBlocks } from './parser';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, loadHistory, recordImport, clearHistory } from './settings';
import { loadFont } from './styles';
import { renderBlocks, RenderResult } from './renderer';
import { errorMessage } from './utils';
import {
    MSG_GET_SETTINGS, MSG_SAVE_SETTINGS, MSG_RESET_SETTINGS,
    MSG_GET_LOCAL_STYLES, MSG_GET_LOCAL_COMPONENTS,
    MSG_GET_HISTORY, MSG_CLEAR_HISTORY, MSG_IMPORT_BATCH,
    MSG_STATUS, MSG_SETTINGS, MSG_LOCAL_STYLES, MSG_LOCAL_COMPONENTS, MSG_HISTORY,
} from './messages';

// Initialize UI — 400×500 px panel, Figma Design only (not FigJam or Slides)
figma.showUI(__html__, { width: 400, height: 500 });

// Top-level return is invalid in TS modules, so use an IIFE for the guard clause.
(() => {
    if (figma.editorType !== 'figma') {
        figma.closePlugin('MarkDown For What only supports Figma Design — not FigJam or Slides.');
        return;
    }

    // Message handler — see messages.ts for all supported message types
    figma.ui.onmessage = async (msg) => {
    try {
        if (msg.type === MSG_GET_SETTINGS) {
            const settings = await loadSettings();
            figma.ui.postMessage({ type: MSG_SETTINGS, settings });
            return;
        }

        if (msg.type === MSG_SAVE_SETTINGS) {
            if (!msg.settings || typeof msg.settings !== 'object') {
                figma.ui.postMessage({ type: MSG_STATUS, message: 'Invalid settings payload.', error: true });
                return;
            }
            try {
                await saveSettings(msg.settings);
                figma.ui.postMessage({ type: MSG_STATUS, message: 'Settings saved.', error: false });
            } catch (saveErr) {
                figma.ui.postMessage({
                    type: MSG_STATUS,
                    message: `Failed to save settings: ${errorMessage(saveErr)}`,
                    error: true
                });
            }
            return;
        }

        if (msg.type === MSG_RESET_SETTINGS) {
            try {
                await saveSettings(DEFAULT_SETTINGS);
                figma.ui.postMessage({ type: MSG_SETTINGS, settings: DEFAULT_SETTINGS });
                figma.ui.postMessage({ type: MSG_STATUS, message: 'Settings reset to defaults.', error: false });
            } catch (err) {
                figma.ui.postMessage({
                    type: MSG_STATUS,
                    message: `Failed to reset settings: ${errorMessage(err)}`,
                    error: true,
                });
            }
            return;
        }

        if (msg.type === MSG_GET_LOCAL_STYLES) {
            try {
                const textStyles = await figma.getLocalTextStylesAsync();
                figma.ui.postMessage({
                    type: MSG_LOCAL_STYLES,
                    textStyles: textStyles.map((s: any) => ({ id: s.id, name: s.name })),
                });
            } catch (err) {
                console.error('[MarkDown For What] Failed to fetch local styles:', err);
                figma.ui.postMessage({ type: MSG_LOCAL_STYLES, textStyles: [] });
            }
            return;
        }

        if (msg.type === MSG_GET_LOCAL_COMPONENTS) {
            try {
                const components = figma.currentPage.findAllWithCriteria({ types: ['COMPONENT'] }) as ComponentNode[];
                figma.ui.postMessage({
                    type: MSG_LOCAL_COMPONENTS,
                    components: components.map(c => ({ id: c.id, name: c.name })),
                });
            } catch (err) {
                console.error('[MarkDown For What] Failed to fetch local components:', err);
                figma.ui.postMessage({ type: MSG_LOCAL_COMPONENTS, components: [] });
            }
            return;
        }

        if (msg.type === MSG_GET_HISTORY) {
            const history = await loadHistory();
            figma.ui.postMessage({ type: MSG_HISTORY, entries: history });
            return;
        }

        if (msg.type === MSG_CLEAR_HISTORY) {
            await clearHistory();
            figma.ui.postMessage({ type: MSG_HISTORY, entries: [] });
            figma.ui.postMessage({ type: MSG_STATUS, message: 'Import history cleared.', error: false });
            return;
        }

        if (msg.type === MSG_IMPORT_BATCH) {
            const files = msg.files;

            if (!files || files.length === 0) {
                figma.ui.postMessage({ type: MSG_STATUS, message: 'No files request received.', error: true });
                return;
            }

            const settings = await loadSettings();

            // Pre-load common fonts — use allSettled so a single font failure doesn't abort the batch
            const fontResults = await Promise.allSettled([
                loadFont('Inter', 'Regular'),
                loadFont('Inter', 'Bold'),
                loadFont('Inter', 'Italic'),
                loadFont('Inter', 'Bold Italic'),
                loadFont('Roboto Mono', 'Regular'),
            ]);
            if (fontResults.some(r => r.status === 'rejected')) {
                console.warn('[MarkDown For What] Font pre-load partial failure — rendering will use available fallbacks:', fontResults);
                figma.ui.postMessage({
                    type: MSG_STATUS,
                    message: 'Warning: some fonts unavailable. Output may use fallback fonts.',
                    warning: true
                });
            }

            let updatedCount = 0;
            let failedCount = 0;
            let totalImageFailures = 0;
            const allFrames = figma.currentPage.findAll(n => n.type === 'FRAME');

            const excludedBlocks: Record<number, number[]> = msg.excludedBlocks ?? {};

            for (let fi = 0; fi < files.length; fi++) {
                const file = files[fi];
                const nameNoExt = file.name.replace(/\.(md|markdown|txt)$/i, '');
                const target = allFrames.find(n => n.name === file.name || n.name === nameNoExt);

                try {
                    let blocks = parseMarkdownToBlocks(file.content, { generateToc: settings.generateToc });

                    // Filter out excluded blocks (selective import)
                    const excluded = excludedBlocks[fi];
                    if (excluded && excluded.length > 0) {
                        const excludeSet = new Set(excluded);
                        blocks = blocks.filter((_, idx) => !excludeSet.has(idx));
                    }

                    const result: RenderResult = await renderBlocks(nameNoExt, blocks, settings, target as SceneNode);
                    updatedCount++;
                    totalImageFailures += result.imageFailures;
                    // Record in import history (fire-and-forget — don't block render)
                    recordImport(file.name, blocks.length).catch(() => {});
                } catch (e) {
                    failedCount++;
                    console.error(`Failed to import ${file.name}`, e);
                    figma.ui.postMessage({
                        type: MSG_STATUS,
                        message: `Error importing ${file.name}: ${errorMessage(e)}`,
                        error: true
                    });
                }
            }

            let statusMessage = failedCount === 0
                ? `Processed ${updatedCount} Markdown file${updatedCount === 1 ? '' : 's'}.`
                : `Processed ${updatedCount} file${updatedCount === 1 ? '' : 's'}, ${failedCount} failed.`;

            if (totalImageFailures > 0) {
                statusMessage += ` (${totalImageFailures} image${totalImageFailures === 1 ? '' : 's'} failed to load)`;
            }

            figma.ui.postMessage({
                type: MSG_STATUS,
                message: statusMessage,
                error: failedCount > 0
            });
        }
    } catch (err) {
        console.error('[MarkDown For What] Unhandled error in message handler:', err);
        figma.ui.postMessage({
            type: MSG_STATUS,
            message: `Unexpected error: ${errorMessage(err)}`,
            error: true
        });
    }
    };
})();
