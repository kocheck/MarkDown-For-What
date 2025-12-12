
// This shows the HTML page in "ui.html".
figma.showUI(__html__, { width: 400, height: 500 });

// Calls to "parent.postMessage" from within the HTML page will trigger this
// callback. The callback will be passed the "pluginMessage" property of the
// posted message.
figma.ui.onmessage = async (msg) => {
  if (msg.type === 'import-markdown') {
    const selection = figma.currentPage.selection;

    if (selection.length === 0) {
      figma.ui.postMessage({ type: 'status', message: 'Please select at least one text layer.', error: true });
      return;
    }

    const textNodes = selection.filter(node => node.type === 'TEXT') as TextNode[];

    if (textNodes.length === 0) {
      figma.ui.postMessage({ type: 'status', message: 'No text layers selected.', error: true });
      return;
    }

    let updatedCount = 0;

    for (const node of textNodes) {
      try {
        // We need to load the font before we can set characters
        // Even if we aren't changing the font, we need to load the existing one
        // to change the text content.
        await figma.loadFontAsync(node.fontName as FontName);

        // For MVP, we are just doing invalid content replacement
        // In later phases we will parse markdown
        node.characters = msg.content;
        updatedCount++;
      } catch (error) {
        console.error('Error updating text layer:', error);
        // Continue to next node even if one fails
      }
    }

    if (updatedCount > 0) {
        figma.ui.postMessage({
            type: 'status',
            message: `Successfully updated ${updatedCount} text layer${updatedCount === 1 ? '' : 's'}.`,
            error: false
        });
    } else {
        figma.ui.postMessage({
            type: 'status',
            message: 'Failed to update text layers. Check console for details.',
            error: true
        });
    }
  }

  // Make sure to close the plugin when you're done. Otherwise the plugin will
  // keep running, which shows the cancel button at the bottom of the screen.
  // We keep it open here so user can import multiple times if they want.
  // figma.closePlugin();
};
