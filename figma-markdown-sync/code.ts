import { parseMarkdownToBlocks } from './parser';
import { loadSettings } from './settings';
import { loadFont } from './styles';
import { renderBlocks } from './renderer';

// Display UI
figma.showUI(__html__, { width: 400, height: 500 });

// Handle Messages
figma.ui.onmessage = async (msg) => {
    if (msg.type === 'import-markdown-batch') {
        const files = msg.files;

        if (!files || files.length === 0) {
            figma.ui.postMessage({ type: 'status', message: 'No files request received.', error: true });
            return;
        }

        const settings = await loadSettings();

        // Pre-load common fonts
        await loadFont('Inter', 'Regular');
        await loadFont('Inter', 'Bold');
        await loadFont('Inter', 'Italic');
        await loadFont('Inter', 'Bold Italic');
        await loadFont('Roboto Mono', 'Regular');

        let updatedCount = 0;
        const allTextNodes = figma.currentPage.findAll(n => n.name.length > 0);

        for (const file of files) {
            const nameNoExt = file.name.replace(/\.(md|markdown|txt)$/i, '');
            const target = allTextNodes.find(n => n.name === file.name || n.name === nameNoExt);

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
