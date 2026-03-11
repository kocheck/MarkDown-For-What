/**
 * Unit tests for Markdown parsing logic
 * Tests the core functionality we fixed: image extraction, block parsing, and inline styles
 */

import { marked } from 'marked';
import type { Block } from './parser';

// Import the functions we want to test
const {
    extractImagesFromTokens,
    parseMarkdownToBlocks,
    flattenTokens,
    DEFAULT_FLATTEN_CONTEXT
} = require('./parser');

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

        // heading, paragraph, image, list×2, code
        expect(blocks).toHaveLength(6);
        expect(blocks[0].type).toBe('heading');
        expect(blocks[1].type).toBe('paragraph');
        expect(blocks[2].type).toBe('image');
        expect(blocks[3].type).toBe('list');
        expect(blocks[4].type).toBe('list');
        expect(blocks[5].type).toBe('code');
    });
});

describe('parseMarkdownToBlocks — strikethrough', () => {
    test('should preserve strikethrough tokens in paragraph', () => {
        const markdown = 'This is ~~deleted~~ text';
        const blocks = parseMarkdownToBlocks(markdown);

        expect(blocks).toHaveLength(1);
        expect(blocks[0].type).toBe('paragraph');
        // The tokens array should contain a 'del' token
        const hasDel = blocks[0].tokens?.some((t: any) => t.type === 'del');
        expect(hasDel).toBe(true);
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

        const segments = flattenTokens(tokens, DEFAULT_FLATTEN_CONTEXT);

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

        const segments = flattenTokens(tokens, DEFAULT_FLATTEN_CONTEXT);

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

        const segments = flattenTokens(tokens, DEFAULT_FLATTEN_CONTEXT);

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

        const segments = flattenTokens(tokens, DEFAULT_FLATTEN_CONTEXT);

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

        const segments = flattenTokens(tokens, DEFAULT_FLATTEN_CONTEXT);

        expect(segments).toHaveLength(1);
        expect(segments[0].text).toBe('plain text');
        expect(segments[0].bold).toBeFalsy();
        expect(segments[0].italic).toBeFalsy();
        expect(segments[0].code).toBeFalsy();
    });

    test('should handle empty tokens array', () => {
        const segments = flattenTokens([], DEFAULT_FLATTEN_CONTEXT);

        expect(segments).toHaveLength(0);
    });

    test('default branch: unknown token with text property falls back to text', () => {
        const tokens: marked.Token[] = [
            { type: 'space', raw: '\n' } as any,
            { type: 'unknown-type', raw: 'raw', text: 'fallback text' } as any,
        ];
        const segments = flattenTokens(tokens, DEFAULT_FLATTEN_CONTEXT);
        // 'space' has no 'text' property, so produces no segment
        // 'unknown-type' has 'text', so produces one segment
        expect(segments).toHaveLength(1);
        expect(segments[0].text).toBe('fallback text');
    });

    test('should preserve link URL on segments', () => {
        const tokens: marked.Token[] = [
            {
                type: 'link',
                raw: '[link](url)',
                text: 'link',
                href: 'url',
                tokens: [{ type: 'text', raw: 'link', text: 'link' } as marked.Tokens.Text]
            } as marked.Tokens.Link
        ];

        const segments = flattenTokens(tokens, DEFAULT_FLATTEN_CONTEXT);

        expect(segments).toHaveLength(1);
        expect(segments[0].text).toBe('link');
        expect(segments[0].link).toBe('url');
    });
});

describe('flattenTokens — strikethrough', () => {
    test('should handle strikethrough (del) tokens', () => {
        const tokens: marked.Token[] = [
            {
                type: 'del',
                raw: '~~struck~~',
                text: 'struck',
                tokens: [{ type: 'text', raw: 'struck', text: 'struck' } as marked.Tokens.Text]
            } as marked.Tokens.Del
        ];

        const segments = flattenTokens(tokens, DEFAULT_FLATTEN_CONTEXT);

        expect(segments).toHaveLength(1);
        expect(segments[0].text).toBe('struck');
        expect(segments[0].strikethrough).toBe(true);
    });

    test('should combine strikethrough with bold', () => {
        const tokens: marked.Token[] = [
            {
                type: 'strong',
                raw: '**~~bold struck~~**',
                text: 'bold struck',
                tokens: [
                    {
                        type: 'del',
                        raw: '~~bold struck~~',
                        text: 'bold struck',
                        tokens: [{ type: 'text', raw: 'bold struck', text: 'bold struck' } as marked.Tokens.Text]
                    } as marked.Tokens.Del
                ]
            } as marked.Tokens.Strong
        ];

        const segments = flattenTokens(tokens, DEFAULT_FLATTEN_CONTEXT);

        expect(segments).toHaveLength(1);
        expect(segments[0].bold).toBe(true);
        expect(segments[0].strikethrough).toBe(true);
    });
});

describe('flattenTokens — inline links', () => {
    test('should preserve link URL in segment', () => {
        const tokens: marked.Token[] = [
            {
                type: 'link',
                raw: '[Example](https://example.com)',
                text: 'Example',
                href: 'https://example.com',
                tokens: [{ type: 'text', raw: 'Example', text: 'Example' } as marked.Tokens.Text]
            } as marked.Tokens.Link
        ];

        const segments = flattenTokens(tokens, DEFAULT_FLATTEN_CONTEXT);

        expect(segments).toHaveLength(1);
        expect(segments[0].text).toBe('Example');
        expect(segments[0].link).toBe('https://example.com');
    });

    test('should handle link with bold text inside', () => {
        const tokens: marked.Token[] = [
            {
                type: 'link',
                raw: '[**Bold Link**](https://example.com)',
                text: 'Bold Link',
                href: 'https://example.com',
                tokens: [
                    {
                        type: 'strong',
                        raw: '**Bold Link**',
                        text: 'Bold Link',
                        tokens: [{ type: 'text', raw: 'Bold Link', text: 'Bold Link' } as marked.Tokens.Text]
                    } as marked.Tokens.Strong
                ]
            } as marked.Tokens.Link
        ];

        const segments = flattenTokens(tokens, DEFAULT_FLATTEN_CONTEXT);

        expect(segments).toHaveLength(1);
        expect(segments[0].text).toBe('Bold Link');
        expect(segments[0].bold).toBe(true);
        expect(segments[0].link).toBe('https://example.com');
    });

    test('should handle mixed text and links', () => {
        const tokens: marked.Token[] = [
            { type: 'text', raw: 'Visit ', text: 'Visit ' } as marked.Tokens.Text,
            {
                type: 'link',
                raw: '[here](https://example.com)',
                text: 'here',
                href: 'https://example.com',
                tokens: [{ type: 'text', raw: 'here', text: 'here' } as marked.Tokens.Text]
            } as marked.Tokens.Link,
            { type: 'text', raw: ' for more', text: ' for more' } as marked.Tokens.Text,
        ];

        const segments = flattenTokens(tokens, DEFAULT_FLATTEN_CONTEXT);

        expect(segments).toHaveLength(3);
        expect(segments[0].link).toBeUndefined();
        expect(segments[1].link).toBe('https://example.com');
        expect(segments[2].link).toBeUndefined();
    });
});

describe('parseMarkdownToBlocks — ordered lists', () => {
    test('should parse ordered list items as orderedListItem blocks', () => {
        const markdown = '1. First\n2. Second\n3. Third';
        const blocks = parseMarkdownToBlocks(markdown);

        const orderedBlocks = blocks.filter((b: Block) => b.type === 'orderedListItem');
        expect(orderedBlocks).toHaveLength(3);
        expect(orderedBlocks[0].content).toBe('First');
        expect(orderedBlocks[0].index).toBe(1);
        expect(orderedBlocks[1].index).toBe(2);
        expect(orderedBlocks[2].index).toBe(3);
    });

    test('should respect start number', () => {
        const markdown = '5. Fifth\n6. Sixth';
        const blocks = parseMarkdownToBlocks(markdown);

        const orderedBlocks = blocks.filter((b: Block) => b.type === 'orderedListItem');
        expect(orderedBlocks).toHaveLength(2);
        expect(orderedBlocks[0].index).toBe(5);
        expect(orderedBlocks[1].index).toBe(6);
    });

    test('ordered list items should have depth 0 by default', () => {
        const markdown = '1. First\n2. Second';
        const blocks = parseMarkdownToBlocks(markdown);

        const orderedBlocks = blocks.filter((b: Block) => b.type === 'orderedListItem');
        expect(orderedBlocks[0].depth).toBe(0);
    });
});

describe('parseMarkdownToBlocks — nested lists', () => {
    test('should parse nested unordered lists with depth', () => {
        const markdown = '- Item 1\n  - Nested 1\n  - Nested 2\n- Item 2';
        const blocks = parseMarkdownToBlocks(markdown);

        const listBlocks = blocks.filter((b: Block) => b.type === 'list');
        expect(listBlocks.length).toBeGreaterThanOrEqual(4);
        expect(listBlocks[0].depth).toBe(0);
        expect(listBlocks[0].content).toBe('Item 1');
        // Nested items should have depth 1
        const nestedBlocks = listBlocks.filter((b: Block) => b.depth === 1);
        expect(nestedBlocks.length).toBe(2);
    });

    test('should parse deeply nested lists up to depth 3', () => {
        const markdown = '- Level 0\n  - Level 1\n    - Level 2\n      - Level 3\n        - Level 4 (clamped)';
        const blocks = parseMarkdownToBlocks(markdown);

        const listBlocks = blocks.filter((b: Block) => b.type === 'list');
        const depths = listBlocks.map((b: Block) => b.depth);
        // Depth should be 0, 1, 2, 3, 3 (clamped)
        expect(depths).toContain(0);
        expect(depths).toContain(1);
        expect(depths).toContain(2);
        expect(depths).toContain(3);
        // No depth > 3
        expect(depths.every((d: number) => d !== undefined && d <= 3)).toBe(true);
    });

    test('should parse nested ordered lists with depth', () => {
        const markdown = '1. First\n   1. Nested First\n   2. Nested Second\n2. Second';
        const blocks = parseMarkdownToBlocks(markdown);

        const orderedBlocks = blocks.filter((b: Block) => b.type === 'orderedListItem');
        expect(orderedBlocks.length).toBeGreaterThanOrEqual(4);
        const nestedBlocks = orderedBlocks.filter((b: Block) => b.depth === 1);
        expect(nestedBlocks.length).toBe(2);
    });

    test('flat lists still work with depth 0', () => {
        const markdown = '- Item 1\n- Item 2\n- Item 3';
        const blocks = parseMarkdownToBlocks(markdown);

        const listBlocks = blocks.filter((b: Block) => b.type === 'list');
        expect(listBlocks).toHaveLength(3);
        listBlocks.forEach((b: Block) => expect(b.depth).toBe(0));
    });
});

describe('parseMarkdownToBlocks — task lists', () => {
    test('should parse task list items as taskListItem blocks', () => {
        const markdown = '- [ ] Unchecked\n- [x] Checked\n- [ ] Another';
        const blocks = parseMarkdownToBlocks(markdown);

        const taskBlocks = blocks.filter((b: Block) => b.type === 'taskListItem');
        expect(taskBlocks).toHaveLength(3);
        expect(taskBlocks[0].checked).toBe(false);
        expect(taskBlocks[0].content).toContain('Unchecked');
        expect(taskBlocks[1].checked).toBe(true);
        expect(taskBlocks[1].content).toContain('Checked');
    });

    test('task list items always have depth 0 (flat per spec)', () => {
        const markdown = '- [ ] Unchecked\n- [x] Checked';
        const blocks = parseMarkdownToBlocks(markdown);

        const taskBlocks = blocks.filter((b: Block) => b.type === 'taskListItem');
        taskBlocks.forEach((b: Block) => expect(b.depth).toBe(0));
    });

    test('should handle mixed regular and task list items', () => {
        const markdown = '- Regular item\n- [ ] Task item\n- Another regular';
        const blocks = parseMarkdownToBlocks(markdown);

        const taskBlocks = blocks.filter((b: Block) => b.type === 'taskListItem');
        const listBlocks = blocks.filter((b: Block) => b.type === 'list');
        expect(taskBlocks).toHaveLength(1);
        expect(listBlocks).toHaveLength(2);
    });
});

describe('Integration — all P0 content types together', () => {
    test('should parse a document with all new content types', () => {
        const markdown = `# Title

Some ~~struck~~ and [linked](https://example.com) text.

1. First ordered
2. Second ordered

- Bullet 1
  - Nested bullet
- Bullet 2

- [ ] Unchecked task
- [x] Checked task
`;
        const blocks = parseMarkdownToBlocks(markdown);

        const types = blocks.map((b: Block) => b.type);
        expect(types).toContain('heading');
        expect(types).toContain('paragraph');
        expect(types).toContain('orderedListItem');
        expect(types).toContain('list');
        expect(types).toContain('taskListItem');
    });
});

describe('Regression Tests', () => {
    test('should handle image with title attribute', () => {
        const markdown = '![Alt text](https://example.com/img.png "Image Title")';
        const blocks = parseMarkdownToBlocks(markdown);

        const imageBlock = blocks.find((b: Block) => b.type === 'image');
        expect(imageBlock).toBeDefined();
        expect(imageBlock?.imageUrl).toBe('https://example.com/img.png');
        expect(imageBlock?.imageAlt).toBe('Alt text');
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

    test('strips YAML front matter with CRLF line endings', () => {
        const markdown = '---\r\ntitle: My Doc\r\n---\r\n# Actual Content';
        const blocks = parseMarkdownToBlocks(markdown);
        const yamlBlock = blocks.find((b: Block) => b.content?.includes('title:'));
        expect(yamlBlock).toBeUndefined();
        expect(blocks[0].type).toBe('heading');
        expect(blocks[0].content).toBe('Actual Content');
    });

    test('strips YAML front matter before parsing', () => {
        const markdown = '---\ntitle: My Doc\nauthor: Me\n---\n# Actual Content';
        const blocks = parseMarkdownToBlocks(markdown);
        const yamlBlock = blocks.find((b: Block) => b.content?.includes('title:'));
        expect(yamlBlock).toBeUndefined();
        expect(blocks[0].type).toBe('heading');
        expect(blocks[0].content).toBe('Actual Content');
    });

    test('ordered list items are parsed as orderedListItem blocks', () => {
        const markdown = '1. First\n2. Second\n3. Third';
        const blocks = parseMarkdownToBlocks(markdown);
        const orderedBlocks = blocks.filter((b: Block) => b.type === 'orderedListItem');
        expect(orderedBlocks).toHaveLength(3);
        expect(orderedBlocks[0].content).toBe('First');
        expect(orderedBlocks[1].content).toBe('Second');
    });

    test('blockquote block includes the quoted content', () => {
        const markdown = '> This is a quote';
        const blocks = parseMarkdownToBlocks(markdown);
        expect(blocks[0].type).toBe('quote');
        expect(blocks[0].content).toContain('This is a quote');
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

describe('callout / admonition parsing', () => {
    it('should parse > [!NOTE] as a callout block', () => {
        const blocks = parseMarkdownToBlocks('> [!NOTE]\n> This is a note');
        expect(blocks).toHaveLength(1);
        expect(blocks[0].type).toBe('callout');
        expect(blocks[0].calloutType).toBe('note');
        expect(blocks[0].content).toBe('This is a note');
    });

    it('should parse > [!WARNING] as a callout block', () => {
        const blocks = parseMarkdownToBlocks('> [!WARNING]\n> Be careful here');
        expect(blocks).toHaveLength(1);
        expect(blocks[0].type).toBe('callout');
        expect(blocks[0].calloutType).toBe('warning');
        expect(blocks[0].content).toBe('Be careful here');
    });

    it('should parse all five callout types', () => {
        const types = ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'];
        for (const t of types) {
            const blocks = parseMarkdownToBlocks(`> [!${t}]\n> Body`);
            expect(blocks[0].type).toBe('callout');
            expect(blocks[0].calloutType).toBe(t.toLowerCase());
        }
    });

    it('should be case-insensitive for callout type', () => {
        const blocks = parseMarkdownToBlocks('> [!note]\n> lowercase');
        expect(blocks[0].type).toBe('callout');
        expect(blocks[0].calloutType).toBe('note');
    });

    it('should fall back to regular quote for unrecognized type', () => {
        const blocks = parseMarkdownToBlocks('> [!UNKNOWN]\n> Some text');
        expect(blocks[0].type).toBe('quote');
    });

    it('should fall back to regular quote for normal blockquotes', () => {
        const blocks = parseMarkdownToBlocks('> Just a regular quote');
        expect(blocks[0].type).toBe('quote');
    });

    it('should handle multiline callout body', () => {
        const blocks = parseMarkdownToBlocks('> [!TIP]\n> Line one\n> Line two');
        expect(blocks[0].type).toBe('callout');
        expect(blocks[0].content).toContain('Line one');
        expect(blocks[0].content).toContain('Line two');
    });
});

describe('table of contents generation', () => {
    it('should generate TOC from headings when enabled', () => {
        const md = '# Title\n\n## Section A\n\n### Sub A\n\n## Section B';
        const blocks = parseMarkdownToBlocks(md, { generateToc: true });
        expect(blocks[0].type).toBe('toc');
        expect(blocks[0].tocEntries).toEqual([
            { text: 'Title', level: 1 },
            { text: 'Section A', level: 2 },
            { text: 'Sub A', level: 3 },
            { text: 'Section B', level: 2 },
        ]);
    });

    it('should not generate TOC when disabled', () => {
        const md = '# Title\n\n## Section';
        const blocks = parseMarkdownToBlocks(md);
        expect(blocks[0].type).not.toBe('toc');
    });

    it('should insert TOC before all other blocks', () => {
        const md = '# Title\n\nSome text\n\n## Section';
        const blocks = parseMarkdownToBlocks(md, { generateToc: true });
        expect(blocks[0].type).toBe('toc');
        expect(blocks[1].type).toBe('heading');
    });

    it('should not generate TOC if no headings found', () => {
        const md = 'Just a paragraph with no headings.';
        const blocks = parseMarkdownToBlocks(md, { generateToc: true });
        expect(blocks[0].type).not.toBe('toc');
    });

    it('should handle TOC frontmatter flag', () => {
        const md = '---\ntoc: true\n---\n# Title\n\n## Section';
        const blocks = parseMarkdownToBlocks(md, { generateToc: false });
        expect(blocks[0].type).toBe('toc');
    });
});

describe('P1 integration', () => {
    it('should parse document with TOC, callouts, and standard content', () => {
        const md = [
            '# Guide',
            '',
            '## Getting Started',
            '',
            '> [!NOTE]',
            '> Read this first',
            '',
            '## Advanced',
            '',
            '> [!WARNING]',
            '> This is dangerous',
        ].join('\n');

        const blocks = parseMarkdownToBlocks(md, { generateToc: true });

        // TOC should be first
        expect(blocks[0].type).toBe('toc');
        expect(blocks[0].tocEntries).toHaveLength(3);

        // Should have callout blocks
        const callouts = blocks.filter((b: Block) => b.type === 'callout');
        expect(callouts).toHaveLength(2);
        expect(callouts[0].calloutType).toBe('note');
        expect(callouts[1].calloutType).toBe('warning');
    });
});

describe('definition list parsing', () => {
    it('should parse a simple definition list', () => {
        const md = 'API\n: Application Programming Interface\n';
        const blocks: Block[] = parseMarkdownToBlocks(md);
        const dl = blocks.find((b: Block) => b.type === 'definitionList');
        expect(dl).toBeDefined();
        expect(dl!.definitions).toEqual([
            { term: 'API', definitions: ['Application Programming Interface'] }
        ]);
    });

    it('should parse multiple definitions for one term', () => {
        const md = 'Term\n: First definition\n: Second definition\n';
        const blocks: Block[] = parseMarkdownToBlocks(md);
        const dl = blocks.find((b: Block) => b.type === 'definitionList');
        expect(dl).toBeDefined();
        expect(dl!.definitions![0].definitions).toEqual(['First definition', 'Second definition']);
    });

    it('should parse multiple term-definition pairs', () => {
        const md = 'Term A\n: Def A\n\nTerm B\n: Def B\n';
        const blocks: Block[] = parseMarkdownToBlocks(md);
        const dls = blocks.filter((b: Block) => b.type === 'definitionList');
        // May be one block with two items or two blocks depending on how the extension consumes
        const allItems = dls.flatMap((d: Block) => d.definitions ?? []);
        expect(allItems).toHaveLength(2);
        expect(allItems[0].term).toBe('Term A');
        expect(allItems[1].term).toBe('Term B');
    });

    it('should not interfere with regular paragraphs', () => {
        const md = 'Just a paragraph\n\nAnother paragraph\n';
        const blocks: Block[] = parseMarkdownToBlocks(md);
        expect(blocks.every((b: Block) => b.type !== 'definitionList')).toBe(true);
    });

    it('should coexist with other block types', () => {
        const md = '# Title\n\nSome text\n\nTerm\n: Definition\n\n- List item\n';
        const blocks: Block[] = parseMarkdownToBlocks(md);
        expect(blocks.some((b: Block) => b.type === 'heading')).toBe(true);
        expect(blocks.some((b: Block) => b.type === 'paragraph')).toBe(true);
        expect(blocks.some((b: Block) => b.type === 'definitionList')).toBe(true);
        expect(blocks.some((b: Block) => b.type === 'list')).toBe(true);
    });
});

// ─── Footnotes ──────────────────────────────────────────────────────────────

describe('parseMarkdownToBlocks — footnotes', () => {
    it('should parse footnote definitions and create a footnoteSection block', () => {
        const md = 'Some text with a reference[^1].\n\n[^1]: This is the footnote text.\n';
        const blocks: Block[] = parseMarkdownToBlocks(md);
        // Should have: paragraph, separator, footnoteSection
        expect(blocks.some((b: Block) => b.type === 'footnoteSection')).toBe(true);
        const fnBlock = blocks.find((b: Block) => b.type === 'footnoteSection')!;
        expect(fnBlock.footnotes).toHaveLength(1);
        expect(fnBlock.footnotes![0].id).toBe('1');
        expect(fnBlock.footnotes![0].text).toBe('This is the footnote text.');
        expect(fnBlock.footnotes![0].index).toBe(1);
    });

    it('should add a separator before the footnote section', () => {
        const md = 'Text[^a].\n\n[^a]: Footnote A.\n';
        const blocks: Block[] = parseMarkdownToBlocks(md);
        const fnIdx = blocks.findIndex((b: Block) => b.type === 'footnoteSection');
        expect(fnIdx).toBeGreaterThan(0);
        expect(blocks[fnIdx - 1].type).toBe('separator');
    });

    it('should handle multiple footnotes ordered by first reference', () => {
        const md = 'First[^2] then second[^1].\n\n[^1]: Footnote one.\n[^2]: Footnote two.\n';
        const blocks: Block[] = parseMarkdownToBlocks(md);
        const fnBlock = blocks.find((b: Block) => b.type === 'footnoteSection')!;
        expect(fnBlock.footnotes).toHaveLength(2);
        // [^2] is referenced first, so it gets index 1
        expect(fnBlock.footnotes![0].id).toBe('2');
        expect(fnBlock.footnotes![0].index).toBe(1);
        expect(fnBlock.footnotes![1].id).toBe('1');
        expect(fnBlock.footnotes![1].index).toBe(2);
    });

    it('should not create a footnoteSection when there are no footnote definitions', () => {
        const md = '# Just a heading\n\nRegular paragraph.\n';
        const blocks: Block[] = parseMarkdownToBlocks(md);
        expect(blocks.some((b: Block) => b.type === 'footnoteSection')).toBe(false);
    });

    it('should include unreferenced footnote definitions', () => {
        const md = '[^unused]: An unreferenced footnote.\n';
        const blocks: Block[] = parseMarkdownToBlocks(md);
        const fnBlock = blocks.find((b: Block) => b.type === 'footnoteSection');
        expect(fnBlock).toBeDefined();
        expect(fnBlock!.footnotes![0].id).toBe('unused');
    });
});

describe('flattenTokens — footnote references', () => {
    it('should produce a segment with footnoteRef for [^id] tokens', () => {
        // Simulate a footnoteRef inline token as emitted by the custom extension
        const tokens = [
            { type: 'text', raw: 'Hello ', text: 'Hello ' },
            { type: 'footnoteRef', raw: '[^1]', id: '1' },
            { type: 'text', raw: ' world', text: ' world' },
        ] as any[];
        const segments = flattenTokens(tokens, DEFAULT_FLATTEN_CONTEXT);
        expect(segments).toHaveLength(3);
        expect(segments[1].footnoteRef).toBeDefined();
        expect(segments[1].footnoteRef.id).toBe('1');
        expect(segments[1].text).toBe('[1]');
    });
});

// ─── Badge Pills ────────────────────────────────────────────────────────────

describe('parseMarkdownToBlocks — badge pills', () => {
    it('should extract frontmatter tags as a badgeRow block', () => {
        const md = '---\ntags: [design, v2, draft]\n---\n# Title\n';
        const blocks: Block[] = parseMarkdownToBlocks(md);
        const badgeBlock = blocks.find((b: Block) => b.type === 'badgeRow');
        expect(badgeBlock).toBeDefined();
        expect(badgeBlock!.badges).toHaveLength(3);
        expect(badgeBlock!.badges![0].label).toBe('design');
        expect(badgeBlock!.badges![1].label).toBe('v2');
        expect(badgeBlock!.badges![2].label).toBe('draft');
    });

    it('should place frontmatter badge row at the top of blocks', () => {
        const md = '---\ntags: [alpha]\n---\n# Title\n\nParagraph.\n';
        const blocks: Block[] = parseMarkdownToBlocks(md);
        expect(blocks[0].type).toBe('badgeRow');
    });

    it('should not create badgeRow when frontmatter has no tags', () => {
        const md = '---\ntitle: Hello\n---\n# Title\n';
        const blocks: Block[] = parseMarkdownToBlocks(md);
        expect(blocks.some((b: Block) => b.type === 'badgeRow')).toBe(false);
    });
});

describe('flattenTokens — inline badge tokens', () => {
    it('should produce a segment with badge for [badge:Label] tokens', () => {
        const tokens = [
            { type: 'text', raw: 'Status: ', text: 'Status: ' },
            { type: 'badge', raw: '[badge:Approved]', label: 'Approved', color: undefined },
        ] as any[];
        const segments = flattenTokens(tokens, DEFAULT_FLATTEN_CONTEXT);
        expect(segments).toHaveLength(2);
        expect(segments[1].badge).toBeDefined();
        expect(segments[1].badge.label).toBe('Approved');
        expect(segments[1].text).toBe('Approved');
    });

    it('should pass color through for [badge:Label:color] tokens', () => {
        const tokens = [
            { type: 'badge', raw: '[badge:NEW:green]', label: 'NEW', color: 'green' },
        ] as any[];
        const segments = flattenTokens(tokens, DEFAULT_FLATTEN_CONTEXT);
        expect(segments[0].badge!.color).toBe('green');
    });
});

// ─── Mermaid Diagram Parsing ─────────────────────────────────────────────────

describe('mermaid block parsing', () => {
    it('should parse ```mermaid code blocks as mermaid type', () => {
        const md = '```mermaid\ngraph TD\n  A-->B\n```';
        const blocks: Block[] = parseMarkdownToBlocks(md);
        expect(blocks).toHaveLength(1);
        expect(blocks[0].type).toBe('mermaid');
        expect(blocks[0].content).toBe('graph TD\n  A-->B');
    });

    it('should not treat non-mermaid code blocks as mermaid', () => {
        const md = '```javascript\nconsole.log("hi")\n```';
        const blocks: Block[] = parseMarkdownToBlocks(md);
        expect(blocks).toHaveLength(1);
        expect(blocks[0].type).toBe('code');
        expect(blocks[0].language).toBe('javascript');
    });

    it('should parse mermaid alongside other blocks', () => {
        const md = '# Title\n\n```mermaid\nsequenceDiagram\n  A->>B: Hello\n```\n\nSome text';
        const blocks: Block[] = parseMarkdownToBlocks(md);
        expect(blocks[0].type).toBe('heading');
        const mermaidBlock = blocks.find(b => b.type === 'mermaid');
        expect(mermaidBlock).toBeDefined();
        expect(mermaidBlock!.content).toContain('sequenceDiagram');
    });

    it('should handle empty mermaid blocks', () => {
        const md = '```mermaid\n```';
        const blocks: Block[] = parseMarkdownToBlocks(md);
        expect(blocks).toHaveLength(1);
        expect(blocks[0].type).toBe('mermaid');
        expect(blocks[0].content).toBe('');
    });
});

// ─── Math/LaTeX Parsing ──────────────────────────────────────────────────────

describe('math block parsing', () => {
    it('should parse display math ($$...$$) as math type', () => {
        const md = '$$\nE = mc^2\n$$';
        const blocks: Block[] = parseMarkdownToBlocks(md);
        const mathBlock = blocks.find(b => b.type === 'math');
        expect(mathBlock).toBeDefined();
        expect(mathBlock!.content).toBe('E = mc^2');
        expect(mathBlock!.displayMode).toBe(true);
    });

    it('should parse inline display math on single line', () => {
        const md = '$$x^2 + y^2 = z^2$$';
        const blocks: Block[] = parseMarkdownToBlocks(md);
        const mathBlock = blocks.find(b => b.type === 'math');
        expect(mathBlock).toBeDefined();
        expect(mathBlock!.content).toBe('x^2 + y^2 = z^2');
    });

    it('should parse math alongside other content', () => {
        const md = '# Formula\n\n$$\n\\int_0^1 f(x) dx\n$$\n\nEnd.';
        const blocks: Block[] = parseMarkdownToBlocks(md);
        expect(blocks[0].type).toBe('heading');
        const mathBlock = blocks.find(b => b.type === 'math');
        expect(mathBlock).toBeDefined();
        const endBlock = blocks.find(b => b.type === 'paragraph' && b.content?.includes('End'));
        expect(endBlock).toBeDefined();
    });
});

describe('inline math parsing', () => {
    it('should parse $...$ as inline math in flattenTokens', () => {
        const tokens = [
            { type: 'mathInline', raw: '$x^2$', text: 'x^2' },
        ] as any[];
        const segments = flattenTokens(tokens, DEFAULT_FLATTEN_CONTEXT);
        expect(segments).toHaveLength(1);
        expect(segments[0].text).toBe('x^2');
        expect(segments[0].italic).toBe(true);
        expect(segments[0].code).toBe(true);
    });

    it('should handle inline math mixed with text tokens', () => {
        const tokens = [
            { type: 'text', raw: 'where ', text: 'where ' } as any,
            { type: 'mathInline', raw: '$n > 0$', text: 'n > 0' } as any,
        ];
        const segments = flattenTokens(tokens, DEFAULT_FLATTEN_CONTEXT);
        expect(segments).toHaveLength(2);
        expect(segments[0].text).toBe('where ');
        expect(segments[0].italic).toBe(false);
        expect(segments[1].text).toBe('n > 0');
        expect(segments[1].italic).toBe(true);
        expect(segments[1].code).toBe(true);
    });
});
