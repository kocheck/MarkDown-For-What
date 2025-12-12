import { marked } from 'marked';

// Display UI
figma.showUI(__html__, { width: 400, height: 500 });

// Helper to determine if a font style exists and load it
async function loadFontWithFallback(family: string, style: string): Promise<FontName | null> {
    const font: FontName = { family, style };
    try {
        await figma.loadFontAsync(font);
        return font;
    } catch (e) {
        console.warn(`Font not found: ${family} ${style}`);
        return null;
    }
}

// Structure to hold text segments and their styles
interface StyledSegment {
    text: string;
    bold?: boolean;
    italic?: boolean;
    code?: boolean;
    headerLevel?: number; // 0 for normal, 1-6 for headers
    listLevel?: number; // 0 for no list, 1+ for depth
}

// Global variable to track segments during recursion
let segments: StyledSegment[] = [];

// Recursive function to process tokens
function processTokens(tokens: marked.Token[] | marked.Tokens.Generic[], context: { bold: boolean, italic: boolean, code: boolean, headerLevel: number, listLevel: number }) {
    if (!tokens) return;

    for (const token of tokens) {
        switch (token.type) {
            case 'heading': {
                const hToken = token as marked.Tokens.Heading;
                processTokens(hToken.tokens, { ...context, headerLevel: hToken.depth });
                segments.push({ text: '\n', ...context }); // Newline after heading
                break;
            }
            case 'paragraph': {
                const pToken = token as marked.Tokens.Paragraph;
                processTokens(pToken.tokens, { ...context });
                segments.push({ text: '\n\n', ...context }); // Double newline after paragraph
                break;
            }
            case 'list': {
                const lToken = token as marked.Tokens.List;
                processTokens(lToken.items, { ...context, listLevel: context.listLevel + 1 });
                break;
            }
            case 'list_item': {
                const liToken = token as marked.Tokens.ListItem;
                // Add bullet point
                segments.push({ text: '  '.repeat(context.listLevel - 1) + '• ', ...context });
                processTokens(liToken.tokens, { ...context });
                if (!liToken.raw.endsWith('\n')) {
                     segments.push({ text: '\n', ...context });
                }
                break;
            }
            case 'strong': {
                const sToken = token as marked.Tokens.Strong;
                processTokens(sToken.tokens, { ...context, bold: true });
                break;
            }
            case 'em': {
                const eToken = token as marked.Tokens.Em;
                processTokens(eToken.tokens, { ...context, italic: true });
                break;
            }
            case 'codespan': {
                const cToken = token as marked.Tokens.Codespan;
                segments.push({ text: cToken.text, ...context, code: true });
                break;
            }
            case 'code': {
                const cToken = token as marked.Tokens.Code;
                segments.push({ text: cToken.text + '\n\n', ...context, code: true });
                break;
            }
            case 'text': {
                const tToken = token as marked.Tokens.Text;
                if (tToken.tokens) {
                     processTokens(tToken.tokens, context);
                } else {
                    segments.push({ text: tToken.text, ...context });
                }
                break;
            }
            case 'space': {
                // segments.push({ text: token.raw, ...context });
                break;
            }
            default:
                // Fallback for unhandled tokens: treat as text if possible
                if ('text' in token) {
                    segments.push({ text: (token as any).text, ...context });
                }
                break;
        }
    }
}

async function updateTextNodeWithMarkdown(node: TextNode, markdown: string) {
    // 1. Strip FrontMatter (YAML)
    // Remove --- ... --- at the start of the file
    const frontMatterRegex = /^---[\s\S]*?---\n/;
    const cleanMarkdown = markdown.replace(frontMatterRegex, '');

    // 2. Parse markdown
    const tokens = marked.lexer(cleanMarkdown);

    // 3. Flatten tokens into segments
    segments = []; // Reset
    processTokens(tokens, { bold: false, italic: false, code: false, headerLevel: 0, listLevel: 0 });

    // 4. Build full string
    const fullText = segments.map(s => s.text).join('');

    // 5. Load Base Font
    // We assume the node's current font is the base family we want to use.
    // However, node.fontName might be figma.mixed. If so, we pick the first partial font or fallback to Inter.
    let baseFont: FontName = { family: 'Inter', style: 'Regular' };
    if (node.fontName !== figma.mixed) {
        baseFont = node.fontName as FontName;
    } else {
        // If mixed, try to get range 0. Avoid error if text is empty.
        if (node.characters.length > 0) {
            const f = node.getRangeFontName(0, 1);
            if (f !== figma.mixed) baseFont = f as FontName;
        }
    }

    // Load standard weights for this family
    const regularFont = await loadFontWithFallback(baseFont.family, 'Regular') || baseFont;
    const boldFont = await loadFontWithFallback(baseFont.family, 'Bold') || regularFont;
    const italicFont = await loadFontWithFallback(baseFont.family, 'Italic') || regularFont;
    const boldItalicFont = await loadFontWithFallback(baseFont.family, 'Bold Italic') || boldFont;

    // Load Monospace Font for Code
    const codeFont = await loadFontWithFallback('Roboto Mono', 'Regular') || regularFont;

    // Pre-load them all to be safe
    // If fallback returned null (unlikely with || baseFont), we might still have issues, but let's assume one loaded.
    await figma.loadFontAsync(regularFont);
    await figma.loadFontAsync(boldFont);
    await figma.loadFontAsync(italicFont);
    await figma.loadFontAsync(boldItalicFont);
    await figma.loadFontAsync(codeFont);

    // 6. Update content
    node.characters = fullText;

    // 7. Apply styles
    let currentIndex = 0;
    for (const segment of segments) {
        const start = currentIndex;
        const end = currentIndex + segment.text.length;

        if (end > start) {
            // Font Style (Bold/Italic/Code)
            let targetFont = regularFont;

            if (segment.code) {
                targetFont = codeFont;
            } else if (segment.bold && segment.italic) {
                targetFont = boldItalicFont;
            } else if (segment.bold) {
                targetFont = boldFont;
            } else if (segment.italic) {
                targetFont = italicFont;
            }

            // Apply Font
             node.setRangeFontName(start, end, targetFont);

            // Font Size (Headers)
            // Assuming base size is what was there.
            // We can't easily get 'base size' if mixed.
            // Let's assume 16 as default or try to read.
            let baseSize = 16;
            if (node.fontSize !== figma.mixed) {
                baseSize = node.fontSize as number;
            }

            if (segment.headerLevel !== undefined && segment.headerLevel > 0) {
                 // H1 = 2x, H2 = 1.5x, H3 = 1.25x
                 const multiplier = segment.headerLevel === 1 ? 2 : segment.headerLevel === 2 ? 1.5 : 1.25;
                 node.setRangeFontSize(start, end, baseSize * multiplier);
            } else {
                 node.setRangeFontSize(start, end, baseSize);
            }
        }
        currentIndex = end;
    }
}


// Handle Messages
figma.ui.onmessage = async (msg) => {
  if (msg.type === 'import-markdown-batch') {
    const files = msg.files;

    if (!files || files.length === 0) {
         figma.ui.postMessage({ type: 'status', message: 'No files request received.', error: true });
         return;
    }

    const selection = figma.currentPage.selection;
    const selectedTextNodes = selection.filter(node => node.type === 'TEXT') as TextNode[];

    let updatedCount = 0;

    // SCENARIO 1: Single File Import into Selection
    // If user selected layers and imported exactly one file, assume they want to fill those layers.
    if (files.length === 1 && selectedTextNodes.length > 0) {
        const content = files[0].content;
        for (const node of selectedTextNodes) {
             try {
                await updateTextNodeWithMarkdown(node, content);
                updatedCount++;
            } catch (error) {
                console.error('Error updating text layer:', error);
            }
        }
    }
    // SCENARIO 2: Batch Import / Name Matching
    // If multiple files OR no selection, map files to layers by name.
    else {
        // Find all text nodes in the current page.
        // potentially expensive, but necessary for mapping.
        const allTextNodes = figma.currentPage.findAll(n => n.type === 'TEXT') as TextNode[];

        for (const file of files) {
             // Match "filename.md" or "filename"
             const nameNoExt = file.name.replace(/\.(md|markdown|txt)$/i, '');

             const targets = allTextNodes.filter(node =>
                node.name === file.name || node.name === nameNoExt
             );

             for (const node of targets) {
                 try {
                     await updateTextNodeWithMarkdown(node, file.content);
                     updatedCount++;
                 } catch (error) {
                     console.error(`Error updating layer ${node.name}:`, error);
                 }
             }
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
            message: 'No matching text layers found to update.',
            error: true
        });
    }
  }
};
