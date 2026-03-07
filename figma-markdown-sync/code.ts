import { parseMarkdownToBlocks } from './parser';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings';
import { loadFont } from './styles';
import { renderBlocks } from './renderer';

// Display UI
figma.showUI(__html__, { width: 400, height: 500 });

// Handle Messages
figma.ui.onmessage = async (msg) => {
    if (msg.type === 'get-settings') {
        const settings = await loadSettings();
        figma.ui.postMessage({ type: 'settings', settings });
        return;
    }

    if (msg.type === 'save-settings') {
        await saveSettings(msg.settings);
        return;
    }

    if (msg.type === 'reset-settings') {
        await saveSettings(DEFAULT_SETTINGS);
        figma.ui.postMessage({ type: 'settings', settings: DEFAULT_SETTINGS });
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
        await Promise.all([
            loadFont('Inter', 'Regular'),
            loadFont('Inter', 'Bold'),
            loadFont('Inter', 'Italic'),
            loadFont('Inter', 'Bold Italic'),
            loadFont('Roboto Mono', 'Regular'),
        ]);

        let updatedCount = 0;
        const allFrames = figma.currentPage.findAll(n => n.type === 'FRAME' && n.name.length > 0);

        for (const file of files) {
            const nameNoExt = file.name.replace(/\.(md|markdown|txt)$/i, '');
            const target = allFrames.find(n => n.name === file.name || n.name === nameNoExt);

            try {
                const blocks = parseMarkdownToBlocks(file.content);
                await renderBlocks(nameNoExt, blocks, settings, target as SceneNode);
                updatedCount++;
            } catch (e) {
                console.error(`Failed to import ${file.name}`, e);
                figma.ui.postMessage({
                    type: 'status',
                    message: `Error importing ${file.name}: ${e instanceof Error ? e.message : String(e)}`,
                    error: true
                });
            }
        }

        figma.ui.postMessage({
            type: 'status',
            message: `Processed ${updatedCount} Markdown files.`,
            error: false
        });
    }
};
