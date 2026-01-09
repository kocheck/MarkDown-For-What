/**
 * Unit tests for Markdown parsing logic
 * Tests the core functionality we fixed: image extraction, block parsing, and inline styles
 */

import { marked } from 'marked';

// Import the functions we want to test
const {
    extractImagesFromTokens,
    parseMarkdownToBlocks,
    flattenTokens
} = require('./code.ts');

// Define Block type for test assertions
interface Block {
    type: 'heading' | 'paragraph' | 'list' | 'code' | 'quote' | 'separator' | 'table' | 'image';
    content?: string;
    level?: number;
    items?: string[];
    language?: string;
    tokens?: marked.Token[];
    header?: marked.Tokens.TableCell[];
    align?: ('left' | 'center' | 'right' | null)[];
    rows?: marked.Tokens.TableCell[][];
    imageUrl?: string;
    imageAlt?: string;
}

describe('extractImagesFromTokens', () => {
    test('should extract image tokens from mixed content', () => {
        const tokens: marked.Token[] = [
            { type: 'text', raw: 'Some text', text: 'Some text' } as marked.Tokens.Text,
            { type: 'image', raw: '![alt](url)', href: 'https://example.com/image.png', text: 'alt' } as marked.Tokens.Image,
            { type: 'text', raw: 'More text', text: 'More text' } as marked.Tokens.Text
        ];

        const result = extractImagesFromTokens(tokens);

        expect(result.images).toHaveLength(1);
        expect(result.images[0].href).toBe('https://example.com/image.png');
        expect(result.images[0].text).toBe('alt');
        expect(result.textTokens).toHaveLength(2);
    });

    test('should handle tokens with only images', () => {
        const tokens: marked.Token[] = [
            { type: 'image', raw: '![alt1](url1)', href: 'https://example.com/1.png', text: 'alt1' } as marked.Tokens.Image,
            { type: 'image', raw: '![alt2](url2)', href: 'https://example.com/2.png', text: 'alt2' } as marked.Tokens.Image
        ];

        const result = extractImagesFromTokens(tokens);

        expect(result.images).toHaveLength(2);
        expect(result.textTokens).toHaveLength(0);
    });

    test('should handle tokens with no images', () => {
        const tokens: marked.Token[] = [
            { type: 'text', raw: 'Only text', text: 'Only text' } as marked.Tokens.Text,
            { type: 'strong', raw: '**bold**', text: 'bold', tokens: [] } as marked.Tokens.Strong
        ];

        const result = extractImagesFromTokens(tokens);

        expect(result.images).toHaveLength(0);
        expect(result.textTokens).toHaveLength(2);
    });

    test('should handle empty token array', () => {
        const result = extractImagesFromTokens([]);

        expect(result.images).toHaveLength(0);
        expect(result.textTokens).toHaveLength(0);
    });
});

describe('parseMarkdownToBlocks', () => {
    test('should parse headings correctly', () => {
        const markdown = '# H1\n## H2\n### H3';
        const blocks = parseMarkdownToBlocks(markdown);

        expect(blocks).toHaveLength(3);
        expect(blocks[0].type).toBe('heading');
        expect(blocks[0].level).toBe(1);
        expect(blocks[0].content).toBe('H1');
        expect(blocks[1].level).toBe(2);
        expect(blocks[2].level).toBe(3);
    });

    test('should extract standalone images into separate blocks', () => {
        const markdown = 'Some text\n\n![Image Alt](https://example.com/image.png)\n\nMore text';
        const blocks = parseMarkdownToBlocks(markdown);

        const imageBlocks = blocks.filter((b: Block) => b.type === 'image');
        expect(imageBlocks).toHaveLength(1);
        expect(imageBlocks[0].imageUrl).toBe('https://example.com/image.png');
        expect(imageBlocks[0].imageAlt).toBe('Image Alt');
    });

    test('should extract inline images from paragraphs', () => {
        const markdown = 'Text before ![Image](https://example.com/img.png) text after';
        const blocks = parseMarkdownToBlocks(markdown);

        const imageBlocks = blocks.filter((b: Block) => b.type === 'image');

        // Should have both paragraph with text and separate image block
        expect(imageBlocks.length).toBeGreaterThan(0);
        expect(imageBlocks[0].imageUrl).toBe('https://example.com/img.png');
    });

    test('should handle multiple inline images', () => {
        const markdown = '![Image 1](https://example.com/1.png) and ![Image 2](https://example.com/2.png)';
        const blocks = parseMarkdownToBlocks(markdown);

        const imageBlocks = blocks.filter((b: Block) => b.type === 'image');
        expect(imageBlocks).toHaveLength(2);
        expect(imageBlocks[0].imageUrl).toBe('https://example.com/1.png');
        expect(imageBlocks[1].imageUrl).toBe('https://example.com/2.png');
    });

    test('should parse code blocks', () => {
        const markdown = '```javascript\nconst x = 1;\n```';
        const blocks = parseMarkdownToBlocks(markdown);

        expect(blocks).toHaveLength(1);
        expect(blocks[0].type).toBe('code');
        expect(blocks[0].content).toBe('const x = 1;');
        expect(blocks[0].language).toBe('javascript');
    });

    test('should parse lists', () => {
        const markdown = '- Item 1\n- Item 2\n- Item 3';
        const blocks = parseMarkdownToBlocks(markdown);

        const listBlocks = blocks.filter((b: Block) => b.type === 'list');
        expect(listBlocks).toHaveLength(3);
        expect(listBlocks[0].content).toBe('Item 1');
    });

    test('should parse tables', () => {
        const markdown = '| Header 1 | Header 2 |\n|----------|----------|\n| Cell 1   | Cell 2   |';
        const blocks = parseMarkdownToBlocks(markdown);

        expect(blocks).toHaveLength(1);
        expect(blocks[0].type).toBe('table');
        expect(blocks[0].header).toBeDefined();
        expect(blocks[0].rows).toBeDefined();
        expect(blocks[0].header?.length).toBe(2);
    });

    test('should parse blockquotes', () => {
        const markdown = '> This is a quote';
        const blocks = parseMarkdownToBlocks(markdown);

        expect(blocks).toHaveLength(1);
        expect(blocks[0].type).toBe('quote');
    });

    test('should parse horizontal rules', () => {
        const markdown = 'Before\n\n---\n\nAfter';
        const blocks = parseMarkdownToBlocks(markdown);

        const separatorBlocks = blocks.filter((b: Block) => b.type === 'separator');
        expect(separatorBlocks).toHaveLength(1);
    });

    test('should handle mixed content correctly', () => {
        const markdown = `# Title

Some paragraph text

![Image](https://example.com/image.png)

- List item 1
- List item 2

\`\`\`js
code here
\`\`\`
`;
        const blocks = parseMarkdownToBlocks(markdown);

        expect(blocks.length).toBeGreaterThan(4);
        expect(blocks.some((b: Block) => b.type === 'heading')).toBe(true);
        expect(blocks.some((b: Block) => b.type === 'paragraph')).toBe(true);
        expect(blocks.some((b: Block) => b.type === 'image')).toBe(true);
        expect(blocks.some((b: Block) => b.type === 'list')).toBe(true);
        expect(blocks.some((b: Block) => b.type === 'code')).toBe(true);
    });
});

describe('flattenTokens', () => {
    test('should handle bold text', () => {
        const tokens: marked.Token[] = [
            {
                type: 'strong',
                raw: '**bold**',
                text: 'bold',
                tokens: [{ type: 'text', raw: 'bold', text: 'bold' } as marked.Tokens.Text]
            } as marked.Tokens.Strong
        ];

        const segments = flattenTokens(tokens, { bold: false, italic: false, code: false });

        expect(segments).toHaveLength(1);
        expect(segments[0].text).toBe('bold');
        expect(segments[0].bold).toBe(true);
    });

    test('should handle italic text', () => {
        const tokens: marked.Token[] = [
            {
                type: 'em',
                raw: '*italic*',
                text: 'italic',
                tokens: [{ type: 'text', raw: 'italic', text: 'italic' } as marked.Tokens.Text]
            } as marked.Tokens.Em
        ];

        const segments = flattenTokens(tokens, { bold: false, italic: false, code: false });

        expect(segments).toHaveLength(1);
        expect(segments[0].text).toBe('italic');
        expect(segments[0].italic).toBe(true);
    });

    test('should handle code spans', () => {
        const tokens: marked.Token[] = [
            {
                type: 'codespan',
                raw: '`code`',
                text: 'code'
            } as marked.Tokens.Codespan
        ];

        const segments = flattenTokens(tokens, { bold: false, italic: false, code: false });

        expect(segments).toHaveLength(1);
        expect(segments[0].text).toBe('code');
        expect(segments[0].code).toBe(true);
    });

    test('should handle nested formatting', () => {
        const tokens: marked.Token[] = [
            {
                type: 'strong',
                raw: '**bold with *italic***',
                text: 'bold with italic',
                tokens: [
                    { type: 'text', raw: 'bold with ', text: 'bold with ' } as marked.Tokens.Text,
                    {
                        type: 'em',
                        raw: '*italic*',
                        text: 'italic',
                        tokens: [{ type: 'text', raw: 'italic', text: 'italic' } as marked.Tokens.Text]
                    } as marked.Tokens.Em
                ]
            } as marked.Tokens.Strong
        ];

        const segments = flattenTokens(tokens, { bold: false, italic: false, code: false });

        expect(segments).toHaveLength(2);
        expect(segments[0].text).toBe('bold with ');
        expect(segments[0].bold).toBe(true);
        expect(segments[0].italic).toBeFalsy();

        expect(segments[1].text).toBe('italic');
        expect(segments[1].bold).toBe(true);
        expect(segments[1].italic).toBe(true);
    });

    test('should handle plain text', () => {
        const tokens: marked.Token[] = [
            { type: 'text', raw: 'plain text', text: 'plain text' } as marked.Tokens.Text
        ];

        const segments = flattenTokens(tokens, { bold: false, italic: false, code: false });

        expect(segments).toHaveLength(1);
        expect(segments[0].text).toBe('plain text');
        expect(segments[0].bold).toBeFalsy();
        expect(segments[0].italic).toBeFalsy();
        expect(segments[0].code).toBeFalsy();
    });

    test('should handle empty tokens array', () => {
        const segments = flattenTokens([], { bold: false, italic: false, code: false });

        expect(segments).toHaveLength(0);
    });

    test('should treat links as text', () => {
        const tokens: marked.Token[] = [
            {
                type: 'link',
                raw: '[link](url)',
                text: 'link',
                href: 'url',
                tokens: [{ type: 'text', raw: 'link', text: 'link' } as marked.Tokens.Text]
            } as marked.Tokens.Link
        ];

        const segments = flattenTokens(tokens, { bold: false, italic: false, code: false });

        expect(segments).toHaveLength(1);
        expect(segments[0].text).toBe('link');
    });
});

describe('Regression Tests', () => {
    test('should handle image with title attribute', () => {
        const markdown = '![Alt text](https://example.com/img.png "Image Title")';
        const blocks = parseMarkdownToBlocks(markdown);

        const imageBlock = blocks.find((b: Block) => b.type === 'image');
        expect(imageBlock).toBeDefined();
        expect(imageBlock?.imageUrl).toBe('https://example.com/img.png');
        // Alt text or title should be captured
        expect(imageBlock?.imageAlt).toBeTruthy();
    });

    test('should not lose text when extracting images', () => {
        const markdown = 'Text before image ![img](url) text after image';
        const blocks = parseMarkdownToBlocks(markdown);

        // Should have extracted the image into a separate block
        const hasImage = blocks.some((b: Block) => b.type === 'image');
        expect(hasImage).toBe(true);

        // Should also have text content (might be split)
        const hasText = blocks.some((b: Block) => b.type === 'paragraph' && b.content && b.content.trim().length > 0);
        expect(hasText).toBe(true);
    });

    test('should handle empty paragraphs gracefully', () => {
        const markdown = '\n\n\n';
        const blocks = parseMarkdownToBlocks(markdown);

        // Should not create empty paragraph blocks
        const nonEmptyBlocks = blocks.filter((b: Block) => {
            if (b.type === 'paragraph') {
                return b.content && b.content.trim().length > 0;
            }
            return true;
        });

        expect(nonEmptyBlocks.length).toBe(blocks.length);
    });
});
