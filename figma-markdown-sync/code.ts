import { type marked } from 'marked';
import { parseMarkdownToBlocks, flattenTokens } from './parser';
import type { Block, StyledSegment } from './parser';

// Display UI
figma.showUI(__html__, { width: 400, height: 500 });

/**
 * --- Constants & Configuration ---
 */

const STYLE_NAMES = {
    H1: 'Markdown/H1',
    H2: 'Markdown/H2',
    H3: 'Markdown/H3',
    BODY: 'Markdown/Body',
    CODE: 'Markdown/Code',
    LIST: 'Markdown/List',
    QUOTE: 'Markdown/Quote',
};

const FRAME_WIDTH = 800; // Default width for content frames

interface StyleConfig {
    family: string;
    style: string;
    size: number;
    lineHeight: number; // as percentage (e.g., 1.5 = 150%)
}

const DEFAULT_STYLES: Record<string, StyleConfig> = {
    [STYLE_NAMES.H1]: { family: 'Inter', style: 'Bold', size: 32, lineHeight: 1.2 },
    [STYLE_NAMES.H2]: { family: 'Inter', style: 'Bold', size: 24, lineHeight: 1.3 },
    [STYLE_NAMES.H3]: { family: 'Inter', style: 'Bold', size: 20, lineHeight: 1.4 },
    [STYLE_NAMES.BODY]: { family: 'Inter', style: 'Regular', size: 16, lineHeight: 1.5 },
    [STYLE_NAMES.CODE]: { family: 'Roboto Mono', style: 'Regular', size: 14, lineHeight: 1.4 },
    [STYLE_NAMES.LIST]: { family: 'Inter', style: 'Regular', size: 16, lineHeight: 1.5 },
    [STYLE_NAMES.QUOTE]: { family: 'Inter', style: 'Italic', size: 16, lineHeight: 1.5 },
};

/**
 * --- Helper Functions ---
 */

async function loadFont(family: string, style: string): Promise<FontName> {
    const font: FontName = { family, style };
    try {
        await figma.loadFontAsync(font);
        return font;
    } catch (e) {
        console.warn(`Font not found: ${family} ${style}, falling back to Inter Regular`);
        const fallback: FontName = { family: 'Inter', style: 'Regular' };
        await figma.loadFontAsync(fallback);
        return fallback;
    }
}

async function getOrCreateTextStyle(name: string, config: StyleConfig): Promise<TextStyle> {
    const styles = figma.getLocalTextStyles();
    let style = styles.find(s => s.name === name);

    if (!style) {
        style = figma.createTextStyle();
        style.name = name;
    }

    await loadFont(config.family, config.style);

    style.fontName = { family: config.family, style: config.style };
    style.fontSize = config.size;
    style.lineHeight = { value: config.lineHeight * 100, unit: 'PERCENT' };

    return style;
}

/**
 * --- Inline Style Parsing ---
 */

async function applyInlineStyles(node: TextNode, tokens: marked.Token[] | undefined, baseStyleName: string) {
    if (!tokens || tokens.length === 0) {
        // Fallback if no tokens (unexpected for simple text, but possible)
        return;
    }

    const segments = flattenTokens(tokens, { bold: false, italic: false, code: false });
    const fullText = segments.map(s => s.text).join('');

    // Set Characters first
    node.characters = fullText;

    // Load Fonts required for styles
    const baseConfig = DEFAULT_STYLES[baseStyleName];
    // derive variants
    const regularFont = await loadFont(baseConfig.family, 'Regular');
    const boldFont = await loadFont(baseConfig.family, 'Bold');
    const italicFont = await loadFont(baseConfig.family, 'Italic');
    const boldItalicFont = await loadFont(baseConfig.family, 'Bold Italic');
    const codeFont = await loadFont('Roboto Mono', 'Regular');

    let currentIndex = 0;
    for (const segment of segments) {
        const start = currentIndex;
        const end = currentIndex + segment.text.length;

        if (end > start) {
            let font = regularFont; // Default to Regular variant of the base family

            // Note: If base style (like H1) is already Bold, we should respect that?
            // Current strict logic: H1 is Bold by default.
            // If H1 text has **bold**, it remains Bold.
            // If H1 text has *italic*, it becomes Bold Italic?

            const isBaseBold = baseConfig.style.includes('Bold');

            if (segment.code) {
                font = codeFont;
            } else {
                const effectiveBold = segment.bold || isBaseBold;
                const effectiveItalic = segment.italic;

                if (effectiveBold && effectiveItalic) font = boldItalicFont;
                else if (effectiveBold) font = boldFont;
                else if (effectiveItalic) font = italicFont;
                else font = regularFont;
            }

            node.setRangeFontName(start, end, font);

            // If code span, maybe add color? (Not fully supported in setRangeTextStyleId mixed with fonts easily without resetting)
            // For now, font change is good.
        }
        currentIndex = end;
    }
}


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

    // Load all base fonts
    await Promise.all(Object.keys(DEFAULT_STYLES).map(k => getOrCreateTextStyle(k, DEFAULT_STYLES[k])));

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
        let styleName = STYLE_NAMES.BODY;

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

