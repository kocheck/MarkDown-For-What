/**
 * index.ts
 *
 * Sketch plugin entry point — equivalent to Figma's code.ts.
 *
 * Key differences from Figma:
 *   - Figma: figma.showUI(__html__) → embedded iframe
 *   - Sketch: BrowserWindow from sketch-module-web-view → native macOS webview
 *   - Figma: figma.ui.onmessage / figma.ui.postMessage
 *   - Sketch: webContents.on('nativeLog') / webContents.executeJavaScript()
 *   - Figma: async font loading required before render
 *   - Sketch: system fonts available synchronously
 *   - Figma: figma.currentPage.findAll() for re-import
 *   - Sketch: document.selectedPage.layers for re-import
 *
 * Exports a single command handler: onImportMarkdown
 */

import BrowserWindow from 'sketch-module-web-view';
import { parseMarkdownToBlocks } from './parser';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings';
import { renderBlocks, RenderResult } from './renderer';
import { errorMessage } from './utils';

const WEBVIEW_IDENTIFIER = 'markdown-for-what.webview';

/**
 * Main command handler — opens the import panel.
 * Called when the user selects Plugins → MarkDown For What → Import Markdown.
 */
export function onImportMarkdown(): void {
    const sketch = require('sketch');
    const document = sketch.getSelectedDocument();

    if (!document) {
        sketch.UI.message('Please open a document first.');
        return;
    }

    const page = document.selectedPage;

    // Create or focus the BrowserWindow
    const options = {
        identifier: WEBVIEW_IDENTIFIER,
        width: 400,
        height: 500,
        show: false,
        resizable: false,
        title: 'MarkDown For What',
        alwaysOnTop: true,
    };

    const browserWindow = new BrowserWindow(options);
    const webContents = browserWindow.webContents;

    // Load the UI HTML
    browserWindow.loadURL(require('./ui/ui.html'));

    /**
     * Send a message to the UI webview.
     * Calls window.pluginMessage(json) in the webview context.
     */
    function sendToUI(msg: Record<string, unknown>): void {
        const json = JSON.stringify(msg).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        webContents.executeJavaScript(`window.pluginMessage('${json}')`);
    }

    // Handle messages from the UI
    webContents.on('nativeLog', (msgString: string) => {
        try {
            const msg = JSON.parse(msgString);
            handleMessage(msg, document, page, sendToUI);
        } catch (err) {
            console.error('[MarkDown For What] Failed to parse UI message:', err);
        }
    });

    browserWindow.once('ready-to-show', () => {
        browserWindow.show();
    });
}

/**
 * Processes a message from the UI webview.
 * Equivalent to Figma's figma.ui.onmessage handler.
 */
function handleMessage(
    msg: any,
    document: any,
    page: any,
    sendToUI: (msg: Record<string, unknown>) => void
): void {
    const sketch = require('sketch');

    try {
        if (msg.type === 'get-settings') {
            const settings = loadSettings();
            sendToUI({ type: 'settings', settings });
            return;
        }

        if (msg.type === 'save-settings') {
            if (!msg.settings || typeof msg.settings !== 'object') {
                sendToUI({ type: 'status', message: 'Invalid settings payload.', error: true });
                return;
            }
            try {
                saveSettings(msg.settings);
                sendToUI({ type: 'status', message: 'Settings saved.', error: false });
            } catch (saveErr) {
                sendToUI({
                    type: 'status',
                    message: `Failed to save settings: ${errorMessage(saveErr)}`,
                    error: true,
                });
            }
            return;
        }

        if (msg.type === 'reset-settings') {
            saveSettings(DEFAULT_SETTINGS);
            sendToUI({ type: 'settings', settings: DEFAULT_SETTINGS });
            sendToUI({ type: 'status', message: 'Settings reset to defaults.', error: false });
            return;
        }

        if (msg.type === 'import-markdown-batch') {
            const files = msg.files;

            if (!files || files.length === 0) {
                sendToUI({ type: 'status', message: 'No files received.', error: true });
                return;
            }

            const settings = loadSettings();

            let updatedCount = 0;
            let failedCount = 0;
            let totalImageFailures = 0;

            // Get all existing artboards for re-import matching
            const allArtboards = page.layers.filter(
                (layer: any) => layer.type === 'Artboard'
            );

            for (const file of files) {
                const nameNoExt = file.name.replace(/\.(md|markdown|txt)$/i, '');

                // Find existing artboard for re-import
                const target = allArtboards.find(
                    (ab: any) => ab.name === file.name || ab.name === nameNoExt
                );

                try {
                    const blocks = parseMarkdownToBlocks(file.content);
                    const result: RenderResult = renderBlocks(
                        nameNoExt, blocks, settings, document, page, target
                    );
                    updatedCount++;
                    totalImageFailures += result.imageFailures;
                } catch (e) {
                    failedCount++;
                    console.error(`[MarkDown For What] Failed to import ${file.name}:`, e);
                    sendToUI({
                        type: 'status',
                        message: `Error importing ${file.name}: ${errorMessage(e)}`,
                        error: true,
                    });
                }
            }

            let statusMessage = failedCount === 0
                ? `Processed ${updatedCount} Markdown file${updatedCount === 1 ? '' : 's'}.`
                : `Processed ${updatedCount} file${updatedCount === 1 ? '' : 's'}, ${failedCount} failed.`;

            if (totalImageFailures > 0) {
                statusMessage += ` (${totalImageFailures} image${totalImageFailures === 1 ? '' : 's'} failed to load)`;
            }

            sendToUI({
                type: 'status',
                message: statusMessage,
                error: failedCount > 0,
            });

            // Refresh the Sketch UI to show new artboards
            sketch.UI.message(statusMessage);
        }
    } catch (err) {
        console.error('[MarkDown For What] Unhandled error in message handler:', err);
        sendToUI({
            type: 'status',
            message: `Unexpected error: ${errorMessage(err)}`,
            error: true,
        });
    }
}
