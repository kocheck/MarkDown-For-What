import { parseMarkdownToBlocks } from './parser';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings';
import { loadFont } from './styles';
import { renderBlocks, RenderResult } from './renderer';

// Display UI
figma.showUI(__html__, { width: 400, height: 500 });

// This plugin only supports Figma Design — not FigJam or Slides.
if (figma.editorType !== 'figma') {
    figma.closePlugin('MarkDown For What only supports Figma Design — not FigJam.');
}

// Handle Messages
figma.ui.onmessage = async (msg) => {
    try {
        if (msg.type === 'get-settings') {
            const settings = await loadSettings();
            figma.ui.postMessage({ type: 'settings', settings });
            return;
        }

        if (msg.type === 'save-settings') {
            if (!msg.settings || typeof msg.settings !== 'object') {
                figma.ui.postMessage({ type: 'status', message: 'Invalid settings payload.', error: true });
                return;
            }
            await saveSettings(msg.settings);
            figma.ui.postMessage({ type: 'status', message: 'Settings saved.', error: false });
            return;
        }

        if (msg.type === 'reset-settings') {
            await saveSettings(DEFAULT_SETTINGS);
            figma.ui.postMessage({ type: 'settings', settings: DEFAULT_SETTINGS });
            figma.ui.postMessage({ type: 'status', message: 'Settings reset to defaults.', error: false });
            return;
        }

        if (msg.type === 'import-markdown-batch') {
            const files = msg.files;

            if (!files || files.length === 0) {
                figma.ui.postMessage({ type: 'status', message: 'No files request received.', error: true });
                return;
            }

            const settings = await loadSettings();

            // Pre-load common fonts
            try {
                await Promise.all([
                    loadFont('Inter', 'Regular'),
                    loadFont('Inter', 'Bold'),
                    loadFont('Inter', 'Italic'),
                    loadFont('Inter', 'Bold Italic'),
                    loadFont('Roboto Mono', 'Regular'),
                ]);
            } catch (fontErr) {
                console.warn('[MarkDown For What] Font pre-load failed — rendering will use available fallbacks:', fontErr);
                figma.ui.postMessage({
                    type: 'status',
                    message: 'Warning: some fonts unavailable. Output may use fallback fonts.',
                    error: false
                });
            }

            let updatedCount = 0;
            let failedCount = 0;
            let totalImageFailures = 0;
            const allFrames = figma.currentPage.findAll(n => n.name.length > 0);

            for (const file of files) {
                const nameNoExt = file.name.replace(/\.(md|markdown|txt)$/i, '');
                const target = allFrames.find(n => n.name === file.name || n.name === nameNoExt);

                try {
                    const blocks = parseMarkdownToBlocks(file.content);
                    const result: RenderResult = await renderBlocks(nameNoExt, blocks, settings, target as SceneNode);
                    updatedCount++;
                    totalImageFailures += result.imageFailures;
                } catch (e) {
                    failedCount++;
                    console.error(`Failed to import ${file.name}`, e);
                    figma.ui.postMessage({
                        type: 'status',
                        message: `Error importing ${file.name}: ${e instanceof Error ? e.message : String(e)}`,
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
                type: 'status',
                message: statusMessage,
                error: failedCount > 0
            });
        }
    } catch (err) {
        console.error('[MarkDown For What] Unhandled error in message handler:', err);
        figma.ui.postMessage({
            type: 'status',
            message: `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
            error: true
        });
    }
};
