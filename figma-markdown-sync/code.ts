import { parseMarkdownToBlocks } from './parser';
import type { Block } from './parser';
import { STYLE_NAMES, DEFAULT_STYLES, StyleConfig, loadFont, getOrCreateTextStyle, applyInlineStyles, initializeStyles } from './styles';

// Display UI
figma.showUI(__html__, { width: 400, height: 500 });

const FRAME_WIDTH = 800; // Default width for content frames

/**
 * --- Helper function to create table frames ---
 */

async function createTableFrame(block: Block): Promise<FrameNode> {
    if (!block.header || !block.rows) {
        throw new Error('Invalid table block');
    }

    // Main table container (Vertical Auto Layout)
    const tableFrame = figma.createFrame();
    tableFrame.name = 'Table';
    tableFrame.layoutMode = 'VERTICAL';
    tableFrame.itemSpacing = 0;
    tableFrame.primaryAxisSizingMode = 'AUTO';
    tableFrame.counterAxisSizingMode = 'AUTO';
    tableFrame.layoutAlign = 'STRETCH';
    
    // Add stroke around table
    tableFrame.strokes = [{ type: 'SOLID', color: { r: 0.8, g: 0.8, b: 0.8 } }];
    tableFrame.strokeWeight = 1;

    const bodyStyle = await getOrCreateTextStyle(STYLE_NAMES.BODY, DEFAULT_STYLES[STYLE_NAMES.BODY]);
    
    // Load fonts once at the beginning
    const bodyConfig = DEFAULT_STYLES[STYLE_NAMES.BODY];
    const headerFont = await loadFont(bodyConfig.family, 'Bold');

    // Create header row
    const headerRow = figma.createFrame();
    headerRow.name = 'Header Row';
    headerRow.layoutMode = 'HORIZONTAL';
    headerRow.itemSpacing = 0;
    headerRow.primaryAxisSizingMode = 'AUTO';
    headerRow.counterAxisSizingMode = 'AUTO';
    headerRow.fills = [{ type: 'SOLID', color: { r: 0.95, g: 0.95, b: 0.97 } }]; // Light blue-gray background
    headerRow.layoutAlign = 'STRETCH';

    for (let i = 0; i < block.header.length; i++) {
        const cell = block.header[i];
        const cellFrame = figma.createFrame();
        cellFrame.name = `Header Cell ${i}`;
        cellFrame.layoutMode = 'HORIZONTAL';
        cellFrame.paddingTop = 12;
        cellFrame.paddingBottom = 12;
        cellFrame.paddingLeft = 16;
        cellFrame.paddingRight = 16;
        cellFrame.primaryAxisSizingMode = 'FIXED'; // Fill container instead of hug contents
        cellFrame.counterAxisSizingMode = 'AUTO';
        cellFrame.layoutGrow = 1; // Equal column widths
        
        // Add right border (except last cell)
        if (i < block.header.length - 1) {
            cellFrame.strokes = [{ type: 'SOLID', color: { r: 0.8, g: 0.8, b: 0.8 } }];
            cellFrame.strokeWeight = 1;
            cellFrame.strokeRightWeight = 1;
            cellFrame.strokeTopWeight = 0;
            cellFrame.strokeBottomWeight = 0;
            cellFrame.strokeLeftWeight = 0;
        }

        const textNode = figma.createText();
        textNode.characters = cell.text;
        
        // Apply header font (bold) and base text style properties
        textNode.fontName = headerFont;
        textNode.fontSize = bodyStyle.fontSize;
        textNode.lineHeight = bodyStyle.lineHeight;
        
        // Apply alignment
        const alignment = block.align && block.align[i];
        if (alignment === 'center') {
            textNode.textAlignHorizontal = 'CENTER';
            cellFrame.primaryAxisAlignItems = 'CENTER';
        } else if (alignment === 'right') {
            textNode.textAlignHorizontal = 'RIGHT';
            cellFrame.primaryAxisAlignItems = 'MAX';
        } else {
            textNode.textAlignHorizontal = 'LEFT';
            cellFrame.primaryAxisAlignItems = 'MIN';
        }

        cellFrame.appendChild(textNode);
        headerRow.appendChild(cellFrame);
    }

    tableFrame.appendChild(headerRow);

    // Create data rows
    for (let rowIndex = 0; rowIndex < block.rows.length; rowIndex++) {
        const row = block.rows[rowIndex];
        const rowFrame = figma.createFrame();
        rowFrame.name = `Row ${rowIndex + 1}`;
        rowFrame.layoutMode = 'HORIZONTAL';
        rowFrame.itemSpacing = 0;
        rowFrame.primaryAxisSizingMode = 'AUTO';
        rowFrame.counterAxisSizingMode = 'AUTO';
        rowFrame.layoutAlign = 'STRETCH';
        
        // Add bottom border
        rowFrame.strokes = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } }];
        rowFrame.strokeWeight = 1;
        rowFrame.strokeBottomWeight = 1;
        rowFrame.strokeTopWeight = 0;
        rowFrame.strokeLeftWeight = 0;
        rowFrame.strokeRightWeight = 0;

        for (let colIndex = 0; colIndex < row.length; colIndex++) {
            const cell = row[colIndex];
            const cellFrame = figma.createFrame();
            cellFrame.name = `Cell ${rowIndex + 1},${colIndex + 1}`;
            cellFrame.layoutMode = 'HORIZONTAL';
            cellFrame.paddingTop = 10;
            cellFrame.paddingBottom = 10;
            cellFrame.paddingLeft = 16;
            cellFrame.paddingRight = 16;
            cellFrame.primaryAxisSizingMode = 'FIXED'; // Fill container instead of hug contents
            cellFrame.counterAxisSizingMode = 'AUTO';
            cellFrame.layoutGrow = 1; // Equal column widths
            
            // Add right border (except last cell)
            if (colIndex < row.length - 1) {
                cellFrame.strokes = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } }];
                cellFrame.strokeWeight = 1;
                cellFrame.strokeRightWeight = 1;
                cellFrame.strokeTopWeight = 0;
                cellFrame.strokeBottomWeight = 0;
                cellFrame.strokeLeftWeight = 0;
            }

            const textNode = figma.createText();
            textNode.textStyleId = bodyStyle.id;
            textNode.characters = cell.text;
            
            // Apply alignment
            const alignment = block.align && block.align[colIndex];
            if (alignment === 'center') {
                textNode.textAlignHorizontal = 'CENTER';
                cellFrame.primaryAxisAlignItems = 'CENTER';
            } else if (alignment === 'right') {
                textNode.textAlignHorizontal = 'RIGHT';
                cellFrame.primaryAxisAlignItems = 'MAX';
            } else {
                textNode.textAlignHorizontal = 'LEFT';
                cellFrame.primaryAxisAlignItems = 'MIN';
            }

            cellFrame.appendChild(textNode);
            rowFrame.appendChild(cellFrame);
        }

        tableFrame.appendChild(rowFrame);
    }

    return tableFrame;
}

/**
 * --- Helper function to create image nodes ---
 */

async function createImageNode(block: Block): Promise<RectangleNode | FrameNode> {
    if (!block.imageUrl) {
        throw new Error('Invalid image block');
    }

    try {
        // Create a rectangle for the image
        const imageRect = figma.createRectangle();
        imageRect.name = block.imageAlt || 'Image';
        imageRect.layoutAlign = 'STRETCH';
        
        // Set default size (will be adjusted after image loads)
        imageRect.resize(600, 400);

        // Fetch the image asynchronously
        const image = await figma.createImageAsync(block.imageUrl);
        
        // Get image dimensions
        const imageSize = await image.getSizeAsync();
        
        // Scale image to fit max width (parent frame width) while maintaining aspect ratio
        const maxWidth = FRAME_WIDTH;
        if (imageSize.width > maxWidth) {
            const scale = maxWidth / imageSize.width;
            imageRect.resize(maxWidth, imageSize.height * scale);
        } else {
            imageRect.resize(imageSize.width, imageSize.height);
        }

        // Apply image fill
        imageRect.fills = [
            {
                type: 'IMAGE',
                imageHash: image.hash,
                scaleMode: 'FILL'
            }
        ];

        return imageRect;
    } catch (error) {
        // If image loading fails, create a placeholder
        console.error(`Failed to load image: ${block.imageUrl}`, error);
        
        const placeholderFrame = figma.createFrame();
        placeholderFrame.name = `Image Error: ${block.imageAlt || 'Unknown'}`;
        placeholderFrame.layoutMode = 'VERTICAL';
        placeholderFrame.primaryAxisAlignItems = 'CENTER';
        placeholderFrame.counterAxisAlignItems = 'CENTER';
        placeholderFrame.paddingTop = 40;
        placeholderFrame.paddingBottom = 40;
        placeholderFrame.paddingLeft = 40;
        placeholderFrame.paddingRight = 40;
        placeholderFrame.fills = [{ type: 'SOLID', color: { r: 0.95, g: 0.95, b: 0.95 } }];
        placeholderFrame.strokes = [{ type: 'SOLID', color: { r: 0.8, g: 0.2, b: 0.2 } }];
        placeholderFrame.strokeWeight = 2;
        placeholderFrame.dashPattern = [5, 5];
        placeholderFrame.resize(600, 200);
        placeholderFrame.layoutAlign = 'STRETCH';

        const errorText = figma.createText();
        const fontName = await loadFont('Inter', 'Regular');
        errorText.fontName = fontName;
        errorText.fontSize = 14;
        errorText.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.1, b: 0.1 } }];
        errorText.characters = `⚠️ Failed to load image\n${block.imageAlt || 'Unknown'}\nURL: ${block.imageUrl}`;
        errorText.textAlignHorizontal = 'CENTER';

        placeholderFrame.appendChild(errorText);
        return placeholderFrame;
    }
}

/**
 * --- Main Logic ---
 */

async function createMarkdownFrame(name: string, markdown: string, targetNode?: SceneNode) {
    const blocks = parseMarkdownToBlocks(markdown);

    // Ensure all Markdown/* text styles exist (creates missing ones, never overwrites existing)
    await initializeStyles();

    let frame: FrameNode;
    if (targetNode && targetNode.parent) {
         frame = figma.createFrame();
         frame.x = targetNode.x;
         frame.y = targetNode.y;
         targetNode.parent.insertChild(targetNode.parent.children.indexOf(targetNode), frame);
         targetNode.remove();
    } else {
        frame = figma.createFrame();
    }

    frame.name = name;
    frame.layoutMode = 'VERTICAL';
    frame.itemSpacing = 16;
    frame.paddingTop = 40;
    frame.paddingBottom = 40;
    frame.paddingLeft = 40;
    frame.paddingRight = 40;
    frame.primaryAxisSizingMode = 'AUTO';
    frame.counterAxisSizingMode = 'FIXED';
    frame.resize(FRAME_WIDTH, frame.height);

    for (const block of blocks) {
        let node: SceneNode | null = null;
        let styleName: string = STYLE_NAMES.BODY;

        switch (block.type) {
            case 'heading':
                node = figma.createText();
                if (block.level === 1) styleName = STYLE_NAMES.H1;
                else if (block.level === 2) styleName = STYLE_NAMES.H2;
                else styleName = STYLE_NAMES.H3;
                break;
            case 'paragraph':
                node = figma.createText();
                styleName = STYLE_NAMES.BODY;
                break;
            case 'quote':
                 node = figma.createText();
                 styleName = STYLE_NAMES.QUOTE;
                 break;
            case 'list':
                node = figma.createText();
                styleName = STYLE_NAMES.LIST;
                // Add bullet to content manually before parsing?
                // Or handle bullet as part of text.
                // The 'tokens' for list items usually don't include the bullet.
                // We'll prepend a bullet string but we need to be careful with tokens.
                // Simplest: Just use text for list items for now, or construct a "bullet" segment.
                // Let's stick to simple text for list items to avoid complex token shifting.
                if (block.content) block.content = `• ${block.content}`;
                break;
            case 'code':
                const codeFrame = figma.createFrame();
                codeFrame.layoutMode = 'VERTICAL';
                codeFrame.fills = [{ type: 'SOLID', color: { r: 0.95, g: 0.95, b: 0.95 } }];
                codeFrame.paddingTop = 16;
                codeFrame.paddingBottom = 16;
                codeFrame.paddingLeft = 16;
                codeFrame.paddingRight = 16;
                codeFrame.cornerRadius = 8;
                codeFrame.layoutAlign = 'STRETCH';
                codeFrame.counterAxisSizingMode = 'FIXED';

                const codeText = figma.createText();
                await figma.loadFontAsync({ family: 'Roboto Mono', style: 'Regular' });
                const codeStyle = await getOrCreateTextStyle(STYLE_NAMES.CODE, DEFAULT_STYLES[STYLE_NAMES.CODE]);
                codeText.textStyleId = codeStyle.id;
                codeText.characters = block.content || '';

                codeFrame.appendChild(codeText);
                node = codeFrame;
                break;
            case 'separator':
                const line = figma.createRectangle();
                line.resize(FRAME_WIDTH, 1);
                line.fills = [{type: 'SOLID', color: {r: 0.8, g: 0.8, b: 0.8}}];
                line.layoutAlign = 'STRETCH';
                node = line;
                break;
            case 'table':
                node = await createTableFrame(block);
                break;
            case 'image':
                node = await createImageNode(block);
                break;
        }

        if (node) {
            if (node.type === 'TEXT') {
                 // 1. Assign Base Style (sets Size, LineHeight which we want generally)
                 const style = await getOrCreateTextStyle(styleName, DEFAULT_STYLES[styleName]);
                 node.textStyleId = style.id;
                 node.layoutAlign = 'STRETCH';

                 // 2. Apply Inline Styles (overrides font family/weight for ranges)
                 if (block.tokens && block.type !== 'code' && block.type !== 'list') {
                     // Only apply sophisticated parsing for non-list/non-code blocks for now to reduce risk
                     await applyInlineStyles(node, block.tokens, styleName);
                 } else if (block.content) {
                     node.characters = block.content;
                 }
            }
            frame.appendChild(node);
        }
    }

    return frame;
}

// Handle Messages
figma.ui.onmessage = async (msg) => {
    if (msg.type === 'import-markdown-batch') {
        const files = msg.files;

        if (!files || files.length === 0) {
            figma.ui.postMessage({ type: 'status', message: 'No files request received.', error: true });
            return;
        }

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
                await createMarkdownFrame(nameNoExt, file.content, target as SceneNode);
                updatedCount++;
            } catch (e) {
                console.error(`Failed to import ${file.name}`, e);
            }
        }

        figma.ui.postMessage({
            type: 'status',
            message: `Processed ${updatedCount} Markdown files.`,
            error: false
        });
    }
};

