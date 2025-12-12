import { marked } from 'marked';

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
 * --- Interfaces ---
 */

interface Block {
    type: 'heading' | 'paragraph' | 'list' | 'code' | 'quote' | 'separator';
    content?: string; // For text-based blocks
    level?: number; // For headings
    items?: string[]; // For lists
    language?: string; // For code
    tokens?: marked.Token[]; // Inline tokens for rich text
}

interface StyledSegment {
    text: string;
    bold?: boolean;
    italic?: boolean;
    code?: boolean;
}

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
 * --- Markdown Parsing Logic ---
 */

function parseMarkdownToBlocks(markdown: string): Block[] {
    const tokens = marked.lexer(markdown);
    const blocks: Block[] = [];

    for (const token of tokens) {
        switch (token.type) {
            case 'heading':
                const hToken = token as marked.Tokens.Heading;
                blocks.push({
                    type: 'heading',
                    content: hToken.text,
                    level: hToken.depth,
                    tokens: hToken.tokens
                });
                break;
            case 'paragraph':
                const pToken = token as marked.Tokens.Paragraph;
                blocks.push({
                    type: 'paragraph',
                    content: pToken.text,
                    tokens: pToken.tokens
                });
                break;
            case 'code':
                const cToken = token as marked.Tokens.Code;
                blocks.push({
                    type: 'code',
                    content: cToken.text,
                    language: cToken.lang || undefined
                });
                break;
             case 'blockquote':
                const bToken = token as marked.Tokens.Blockquote;
                // Treat blockquote content as text for now, extracting raw text
                // Improvement: Parse inner tokens? For now, simplistic.
                blocks.push({
                    type: 'quote',
                    content: bToken.text
                });
                break;
            case 'list':
                const listToken = token as marked.Tokens.List;
                listToken.items.forEach(item => {
                    blocks.push({
                        type: 'list',
                        content: item.text,
                        tokens: item.tokens
                    });
                });
                break;
            case 'hr':
                 blocks.push({ type: 'separator' });
                 break;
        }
    }
    return blocks;
}

/**
 * --- Inline Style Parsing ---
 */

function flattenTokens(tokens: marked.Token[], context: { bold: boolean, italic: boolean, code: boolean }): StyledSegment[] {
    let segments: StyledSegment[] = [];

    if (!tokens) return segments;

    for (const token of tokens) {
        switch (token.type) {
            case 'strong':
                segments = segments.concat(flattenTokens((token as marked.Tokens.Strong).tokens, { ...context, bold: true }));
                break;
            case 'em':
                segments = segments.concat(flattenTokens((token as marked.Tokens.Em).tokens, { ...context, italic: true }));
                break;
            case 'codespan':
                segments.push({ text: (token as marked.Tokens.Codespan).text, ...context, code: true });
                break;
            case 'text':
                const tToken = token as marked.Tokens.Text;
                if (tToken.tokens) {
                    segments = segments.concat(flattenTokens(tToken.tokens, context));
                } else {
                    segments.push({ text: tToken.text, ...context });
                }
                break;
            case 'link':
                 // Treat link as text for now
                 const lToken = token as marked.Tokens.Link;
                 segments.push({ text: lToken.text, ...context });
                 break;
            default:
                if ('text' in token) {
                     segments.push({ text: (token as any).text, ...context });
                }
                break;
        }
    }
    return segments;
}


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
 * --- main Logic ---
 */

async function createMarkdownFrame(name: string, markdown: string, targetNode?: SceneNode) {
    const frontMatterRegex = /^---[\s\S]*?---\n/;
    const cleanMarkdown = markdown.replace(frontMatterRegex, '');

    const blocks = parseMarkdownToBlocks(cleanMarkdown);

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
    frame.resize(800, frame.height);

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
                line.resize(800, 1);
                line.fills = [{type: 'SOLID', color: {r: 0.8, g: 0.8, b: 0.8}}];
                line.layoutAlign = 'STRETCH';
                node = line;
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
