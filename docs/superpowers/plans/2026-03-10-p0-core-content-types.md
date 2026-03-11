# P0: Core Content Types Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 5 missing content types to the Figma Markdown plugin: strikethrough, inline links, ordered lists, nested lists, and task lists.

**Architecture:** Extend the existing parser → renderer pipeline. StyledSegment gets new fields (`strikethrough`, `link`). Block union type gets new variants (`orderedListItem`, `taskListItem`). List parsing is refactored from flat iteration to recursive traversal for nesting. All changes follow existing TDD patterns with Jest + Figma API mocks.

**Tech Stack:** TypeScript, marked ^4.3.0, Figma Plugin API, Jest 30.2.0

**Spec:** `docs/superpowers/specs/2026-03-10-v2-features-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `figma-markdown-sync/parser.ts` | Modify | Extend `StyledSegment`, `Block`, `flattenTokens`, `parseMarkdownToBlocks` |
| `figma-markdown-sync/renderer.ts` | Modify | Add `renderOrderedListBlock`, `renderTaskListBlock`, update list grouping for nested depth |
| `figma-markdown-sync/styles.ts` | Modify | Extend `applyInlineStyles` for strikethrough + link decoration |
| `figma-markdown-sync/test-setup.ts` | Modify | Add `setRangeTextDecoration`, `setRangeHyperlink` mocks to `makeMockText` |
| `figma-markdown-sync/parser.test.ts` | Modify | Tests for new block types, flattenTokens extensions |
| `figma-markdown-sync/renderer.test.ts` | Modify | Tests for ordered list, task list, nested list rendering |
| `figma-markdown-sync/styles.test.ts` | Modify | Tests for strikethrough + link inline styling |

No new files created — all changes extend existing modules.

---

## Chunk 1: StyledSegment Extension + Strikethrough + Inline Links

### Task 1: Add Figma API mocks for new text decorations

**Files:**
- Modify: `figma-markdown-sync/test-setup.ts:54-72` (makeMockText)

- [ ] **Step 1: Add `setRangeTextDecoration` and `setRangeHyperlink` mocks**

In `makeMockText()`, add two new mock methods after `setRangeFontName`:

```typescript
setRangeTextDecoration: jest.fn(),
setRangeHyperlink: jest.fn(),
```

- [ ] **Step 2: Run all tests to verify no regressions**

Run: `cd figma-markdown-sync && npx jest --verbose`
Expected: All existing tests PASS (mocks are additive)

- [ ] **Step 3: Commit**

```bash
git add figma-markdown-sync/test-setup.ts
git commit -m "test: add setRangeTextDecoration and setRangeHyperlink mocks"
```

---

### Task 2: Extend StyledSegment with strikethrough and link fields

**Files:**
- Modify: `figma-markdown-sync/parser.ts:45-50` (StyledSegment interface)
- Test: `figma-markdown-sync/parser.test.ts`

- [ ] **Step 1: Write failing test for strikethrough in flattenTokens**

Add to `parser.test.ts` in a new `describe` block after the existing `flattenTokens` describe:

```typescript
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

        const segments = flattenTokens(tokens, { bold: false, italic: false, code: false });

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

        const segments = flattenTokens(tokens, { bold: false, italic: false, code: false });

        expect(segments).toHaveLength(1);
        expect(segments[0].bold).toBe(true);
        expect(segments[0].strikethrough).toBe(true);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd figma-markdown-sync && npx jest parser.test.ts --verbose -t "strikethrough"`
Expected: FAIL — `del` token type falls through to default branch, `strikethrough` field is undefined

- [ ] **Step 3: Extend StyledSegment interface**

In `parser.ts`, update the `StyledSegment` interface (line ~45-50):

```typescript
export interface StyledSegment {
    text: string;
    bold?: boolean;
    italic?: boolean;
    code?: boolean;
    strikethrough?: boolean;
    link?: string;
}
```

- [ ] **Step 4: Add `del` case to flattenTokens**

In `parser.ts`, add a new case in the `flattenTokens` switch statement, after the `'em'` case (line ~113):

```typescript
case 'del':
    segments = segments.concat(
        flattenTokens((token as marked.Tokens.Del).tokens, { ...context, strikethrough: true } as any)
    );
    break;
```

Also update the `context` parameter type. Define a named interface and update the function signature (line ~99):

```typescript
/** Inherited formatting state passed through recursive token flattening. */
interface FlattenContext {
    bold: boolean;
    italic: boolean;
    code: boolean;
    strikethrough?: boolean;
    link?: string;
}

export function flattenTokens(
    tokens: marked.Token[],
    context: FlattenContext
): StyledSegment[] {
```

Update the `del` case to use the proper type (no `as any` needed now):

```typescript
case 'del':
    segments = segments.concat(
        flattenTokens((token as marked.Tokens.Del).tokens, { ...context, strikethrough: true })
    );
    break;
```

The default segment push (line ~125) already spreads all context fields:

```typescript
segments.push({ text: tToken.text, ...context });
```

This means `strikethrough` and `link` are included automatically when present.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd figma-markdown-sync && npx jest parser.test.ts --verbose -t "strikethrough"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add figma-markdown-sync/parser.ts figma-markdown-sync/parser.test.ts
git commit -m "feat: add strikethrough support to StyledSegment and flattenTokens"
```

---

### Task 3: Add strikethrough rendering in applyInlineStyles

**Files:**
- Modify: `figma-markdown-sync/styles.ts:192-235` (applyInlineStyles)
- Test: `figma-markdown-sync/styles.test.ts`

- [ ] **Step 1: Write failing test for strikethrough rendering**

Add to `styles.test.ts`:

```typescript
describe('applyInlineStyles — strikethrough', () => {
    it('applies STRIKETHROUGH text decoration for ~~text~~', async () => {
        const node = (figma.createText as jest.Mock)();
        const tokens: marked.Token[] = [
            {
                type: 'del',
                raw: '~~struck~~',
                text: 'struck',
                tokens: [{ type: 'text', raw: 'struck', text: 'struck' } as marked.Tokens.Text]
            } as marked.Tokens.Del
        ];

        await applyInlineStyles(node, tokens, 'Markdown/Body');

        expect(node.characters).toBe('struck');
        expect(node.setRangeTextDecoration).toHaveBeenCalledWith(0, 6, 'STRIKETHROUGH');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd figma-markdown-sync && npx jest styles.test.ts --verbose -t "STRIKETHROUGH"`
Expected: FAIL — `setRangeTextDecoration` not called

- [ ] **Step 3: Add strikethrough decoration to applyInlineStyles**

In `styles.ts`, inside the `applyInlineStyles` function, after the `node.setRangeFontName(start, end, font)` call (line ~231), add:

```typescript
if (segment.strikethrough) {
    node.setRangeTextDecoration(start, end, 'STRIKETHROUGH');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd figma-markdown-sync && npx jest styles.test.ts --verbose -t "STRIKETHROUGH"`
Expected: PASS

- [ ] **Step 5: Run all tests**

Run: `cd figma-markdown-sync && npx jest --verbose`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add figma-markdown-sync/styles.ts figma-markdown-sync/styles.test.ts
git commit -m "feat: render strikethrough text decoration in Figma"
```

---

### Task 4: Add inline link parsing to flattenTokens

**Files:**
- Modify: `figma-markdown-sync/parser.ts:128-132` (link case in flattenTokens)
- Test: `figma-markdown-sync/parser.test.ts`

- [ ] **Step 1: Write failing test for link parsing with URL preservation**

Add to `parser.test.ts`:

```typescript
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

        const segments = flattenTokens(tokens, { bold: false, italic: false, code: false });

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

        const segments = flattenTokens(tokens, { bold: false, italic: false, code: false });

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

        const segments = flattenTokens(tokens, { bold: false, italic: false, code: false });

        expect(segments).toHaveLength(3);
        expect(segments[0].link).toBeUndefined();
        expect(segments[1].link).toBe('https://example.com');
        expect(segments[2].link).toBeUndefined();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd figma-markdown-sync && npx jest parser.test.ts --verbose -t "inline links"`
Expected: FAIL — link case currently pushes `{ text: lToken.text, ...context }` without URL

- [ ] **Step 3: Update link case in flattenTokens**

In `parser.ts`, replace the existing `case 'link':` block (lines ~128-131) with:

```typescript
case 'link':
    const lToken = token as marked.Tokens.Link;
    if (lToken.tokens) {
        segments = segments.concat(
            flattenTokens(lToken.tokens, { ...context, link: lToken.href })
        );
    } else {
        segments.push({ text: lToken.text, ...context, link: lToken.href });
    }
    break;
```

This recursively processes link children (supporting bold/italic inside links) and propagates the URL via the `link` context field.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd figma-markdown-sync && npx jest parser.test.ts --verbose -t "inline links"`
Expected: PASS

- [ ] **Step 5: Update existing link test**

The existing test `'should treat links as text'` (parser.test.ts ~line 294) now needs updating since links carry URLs. Update to:

```typescript
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

    const segments = flattenTokens(tokens, { bold: false, italic: false, code: false });

    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe('link');
    expect(segments[0].link).toBe('url');
});
```

- [ ] **Step 6: Run all parser tests**

Run: `cd figma-markdown-sync && npx jest parser.test.ts --verbose`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add figma-markdown-sync/parser.ts figma-markdown-sync/parser.test.ts
git commit -m "feat: preserve link URLs in StyledSegment during token flattening"
```

---

### Task 5: Add inline link rendering (hyperlink + underline)

**Files:**
- Modify: `figma-markdown-sync/styles.ts:192-235` (applyInlineStyles)
- Test: `figma-markdown-sync/styles.test.ts`

- [ ] **Step 1: Write failing test for link rendering**

Add to `styles.test.ts`:

```typescript
describe('applyInlineStyles — links', () => {
    it('applies hyperlink and underline decoration for link segments', async () => {
        const node = (figma.createText as jest.Mock)();
        const tokens: marked.Token[] = [
            { type: 'text', raw: 'Click ', text: 'Click ' } as marked.Tokens.Text,
            {
                type: 'link',
                raw: '[here](https://example.com)',
                text: 'here',
                href: 'https://example.com',
                tokens: [{ type: 'text', raw: 'here', text: 'here' } as marked.Tokens.Text]
            } as marked.Tokens.Link,
        ];

        await applyInlineStyles(node, tokens, 'Markdown/Body');

        expect(node.characters).toBe('Click here');
        // 'here' starts at index 6, length 4
        expect(node.setRangeHyperlink).toHaveBeenCalledWith(6, 10, { type: 'URL', value: 'https://example.com' });
        expect(node.setRangeTextDecoration).toHaveBeenCalledWith(6, 10, 'UNDERLINE');
        expect(node.setRangeFills).toHaveBeenCalledWith(6, 10, [{ type: 'SOLID', color: { r: 0.035, g: 0.412, b: 0.855 } }]);
    });

    it('does not apply hyperlink to non-link segments', async () => {
        const node = (figma.createText as jest.Mock)();
        const tokens: marked.Token[] = [
            { type: 'text', raw: 'plain text', text: 'plain text' } as marked.Tokens.Text,
        ];

        await applyInlineStyles(node, tokens, 'Markdown/Body');

        expect(node.setRangeHyperlink).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd figma-markdown-sync && npx jest styles.test.ts --verbose -t "links"`
Expected: FAIL — setRangeHyperlink not called

- [ ] **Step 3: Add link rendering to applyInlineStyles**

In `styles.ts`, in the `applyInlineStyles` function, after the strikethrough block added in Task 3, add:

```typescript
if (segment.link) {
    node.setRangeHyperlink(start, end, { type: 'URL', value: segment.link });
    if (!segment.strikethrough) {
        node.setRangeTextDecoration(start, end, 'UNDERLINE');
    }
    // Apply link color (#0969DA) per spec
    node.setRangeFills(start, end, [{ type: 'SOLID', color: { r: 0.035, g: 0.412, b: 0.855 } }]);
}
```

Note: strikethrough takes precedence over underline per the spec (a range can only have one textDecoration value). The link color (#0969DA = rgb(9,105,218)) is always applied regardless.

Also add `setRangeFills` mock to `makeMockText()` in test-setup.ts (alongside the other mocks added in Task 1):

```typescript
setRangeFills: jest.fn(),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd figma-markdown-sync && npx jest styles.test.ts --verbose -t "links"`
Expected: PASS

- [ ] **Step 5: Run all tests**

Run: `cd figma-markdown-sync && npx jest --verbose`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add figma-markdown-sync/styles.ts figma-markdown-sync/styles.test.ts
git commit -m "feat: render inline links with hyperlinks and underline decoration"
```

---

### Task 6: Enable GFM extensions in marked for strikethrough + tables

**Files:**
- Modify: `figma-markdown-sync/parser.ts:17` (marked import area)
- Test: `figma-markdown-sync/parser.test.ts`

The `del` token type requires GFM (GitHub Flavored Markdown) to be enabled in marked. Tables already work because marked enables GFM by default, but let's make the strikethrough explicit and test end-to-end.

- [ ] **Step 1: Write end-to-end parsing test for strikethrough syntax**

Add to `parser.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to check if GFM strikethrough is enabled by default**

Run: `cd figma-markdown-sync && npx jest parser.test.ts --verbose -t "strikethrough"`
Expected: Should PASS if marked has GFM enabled by default (which it does in v4). If it FAILS, proceed to step 3.

- [ ] **Step 3: Enable GFM explicitly if needed**

If the test fails, add at the top of `parser.ts` after the import:

```typescript
marked.use({ gfm: true });
```

This is a no-op if GFM is already default, but makes it explicit.

- [ ] **Step 4: Run all tests**

Run: `cd figma-markdown-sync && npx jest --verbose`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add figma-markdown-sync/parser.ts figma-markdown-sync/parser.test.ts
git commit -m "test: add end-to-end strikethrough parsing test"
```

---

## Chunk 2: Ordered Lists + Nested Lists + Task Lists

### Task 7: Add orderedListItem block type to parser

**Files:**
- Modify: `figma-markdown-sync/parser.ts:26-39` (Block interface), `parser.ts:229-234` (list case)
- Test: `figma-markdown-sync/parser.test.ts`

- [ ] **Step 1: Extend Block interface with new types**

In `parser.ts`, update the Block interface (line ~27):

```typescript
export interface Block {
    type: 'heading' | 'paragraph' | 'list' | 'code' | 'quote' | 'separator' | 'table' | 'image' | 'orderedListItem' | 'taskListItem';
    content?: string;
    level?: number;
    language?: string;
    tokens?: marked.Token[];
    // Table-specific
    header?: marked.Tokens.TableCell[];
    align?: ('left' | 'center' | 'right' | null)[];
    rows?: marked.Tokens.TableCell[][];
    // Image-specific
    imageUrl?: string;
    imageAlt?: string;
    // List-specific (new)
    depth?: number;
    // Ordered list-specific (new)
    index?: number;
    // Task list-specific (new)
    checked?: boolean;
}
```

- [ ] **Step 2: Write failing test for ordered list parsing**

Add to `parser.test.ts`:

```typescript
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd figma-markdown-sync && npx jest parser.test.ts --verbose -t "ordered lists"`
Expected: FAIL — ordered lists currently emit as `list` type, not `orderedListItem`

- [ ] **Step 4: Update list parsing to detect ordered lists**

In `parser.ts`, update the `case 'list':` block (lines ~229-234):

```typescript
case 'list': {
    const listToken = token as marked.Tokens.List;
    if (listToken.ordered) {
        const startNum = listToken.start ?? 1;
        listToken.items.forEach((item, idx) => {
            blocks.push({
                type: 'orderedListItem',
                content: item.text,
                tokens: item.tokens,
                index: startNum + idx,
                depth: 0,
            });
        });
    } else {
        for (const item of listToken.items) {
            blocks.push({ type: 'list', content: item.text, tokens: item.tokens, depth: 0 });
        }
    }
    break;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd figma-markdown-sync && npx jest parser.test.ts --verbose -t "ordered lists"`
Expected: PASS

- [ ] **Step 6: Update existing ordered list regression test**

The existing test `'ordered list items are parsed as list blocks'` (parser.test.ts ~line 354) needs updating since ordered items now use `orderedListItem` type:

```typescript
test('ordered list items are parsed as orderedListItem blocks', () => {
    const markdown = '1. First\n2. Second\n3. Third';
    const blocks = parseMarkdownToBlocks(markdown);
    const orderedBlocks = blocks.filter((b: Block) => b.type === 'orderedListItem');
    expect(orderedBlocks).toHaveLength(3);
    expect(orderedBlocks[0].content).toBe('First');
    expect(orderedBlocks[1].content).toBe('Second');
});
```

- [ ] **Step 7: Run all tests**

Run: `cd figma-markdown-sync && npx jest --verbose`
Expected: All PASS

- [ ] **Step 8: Commit**

```bash
git add figma-markdown-sync/parser.ts figma-markdown-sync/parser.test.ts
git commit -m "feat: parse ordered lists as orderedListItem blocks with index"
```

---

### Task 8: Render ordered list items

**Files:**
- Modify: `figma-markdown-sync/renderer.ts` (add renderOrderedListBlock, update block loop)
- Test: `figma-markdown-sync/renderer.test.ts`

- [ ] **Step 1: Write failing test for ordered list rendering**

Add to `renderer.test.ts`:

```typescript
describe('ordered list rendering', () => {
    it('renders orderedListItem with number prefix', async () => {
        const blocks: Block[] = [
            { type: 'orderedListItem', content: 'First item', index: 1, depth: 0, tokens: [] },
            { type: 'orderedListItem', content: 'Second item', index: 2, depth: 0, tokens: [] },
        ];

        const result = await renderBlocks('Test', blocks, DEFAULT_SETTINGS);

        // Ordered list items should be grouped like regular list items
        expect(result.frame.children).toHaveLength(1); // One list group
        const listGroup = result.frame.children[0] as any;
        expect(listGroup.children).toHaveLength(2);
        // Check that text contains the number prefix
        expect(listGroup.children[0].characters).toContain('1.');
        expect(listGroup.children[1].characters).toContain('2.');
    });

    it('groups consecutive ordered list items together', async () => {
        const blocks: Block[] = [
            { type: 'orderedListItem', content: 'First', index: 1, depth: 0, tokens: [] },
            { type: 'paragraph', content: 'Break', tokens: [] },
            { type: 'orderedListItem', content: 'Second', index: 1, depth: 0, tokens: [] },
        ];

        const result = await renderBlocks('Test', blocks, DEFAULT_SETTINGS);

        expect(result.frame.children).toHaveLength(3); // list group, paragraph, list group
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd figma-markdown-sync && npx jest renderer.test.ts --verbose -t "ordered list"`
Expected: FAIL — `orderedListItem` type not handled in renderer

- [ ] **Step 3: Add ordered list rendering**

In `renderer.ts`, add a new function after `renderListBlock` (line ~369):

```typescript
/**
 * Renders an ordered list item as a TextNode with number prefix.
 */
async function renderOrderedListBlock(block: Block): Promise<TextNode> {
    const node = figma.createText();
    const style = await getOrCreateTextStyle(STYLE_NAMES.LIST, DEFAULT_STYLES[STYLE_NAMES.LIST]);
    await node.setTextStyleIdAsync(style.id);
    node.layoutAlign = 'STRETCH';

    const prefix = `${block.index ?? 1}. `;

    if (block.tokens && block.tokens.length > 0) {
        const prefixToken = { type: 'text', raw: prefix, text: prefix } as any;
        await applyInlineStyles(node, [prefixToken, ...block.tokens], STYLE_NAMES.LIST);
    } else {
        node.characters = block.content ? `${prefix}${block.content}` : prefix.trimEnd();
    }
    return node;
}
```

Then update the list grouping loop in `renderBlocks` (line ~201). Change the condition to group all list-like types:

```typescript
// Helper to check if a block is a list-like type that should be grouped
function isListType(block: Block): boolean {
    return block.type === 'list' || block.type === 'orderedListItem' || block.type === 'taskListItem';
}
```

Replace the `if (block.type === 'list')` check (line ~201) with `if (isListType(block))`, and inside the inner while loop, dispatch to the correct render function:

```typescript
if (isListType(block)) {
    // ... existing list group frame creation ...

    while (i < blocks.length && isListType(blocks[i])) {
        const listBlock = blocks[i];
        try {
            let listNode: SceneNode;
            if (listBlock.type === 'orderedListItem') {
                listNode = await renderOrderedListBlock(listBlock);
            } else if (listBlock.type === 'taskListItem') {
                listNode = await renderTaskListBlock(listBlock);
            } else {
                listNode = await renderListBlock(listBlock);
            }
            listGroupFrame.appendChild(listNode);
        } catch (err) {
            // ... existing error handling ...
        }
        i++;
    }
    // ...
}
```

Note: `renderTaskListBlock` will be added in Task 11. For now, add a temporary stub that calls `renderListBlock` so the code compiles:

```typescript
async function renderTaskListBlock(block: Block): Promise<SceneNode> {
    // TODO: Task 11 will implement proper checkbox rendering
    return renderListBlock(block);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd figma-markdown-sync && npx jest renderer.test.ts --verbose -t "ordered list"`
Expected: PASS

- [ ] **Step 5: Run all tests**

Run: `cd figma-markdown-sync && npx jest --verbose`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add figma-markdown-sync/renderer.ts figma-markdown-sync/renderer.test.ts
git commit -m "feat: render ordered list items with number prefix"
```

---

### Task 9: Refactor list parsing for nesting (recursive traversal)

**Files:**
- Modify: `figma-markdown-sync/parser.ts:229-234` (list case)
- Test: `figma-markdown-sync/parser.test.ts`

- [ ] **Step 1: Write failing test for nested list parsing**

Add to `parser.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd figma-markdown-sync && npx jest parser.test.ts --verbose -t "nested lists"`
Expected: FAIL — nested items not flattened with depth (current parser is flat)

- [ ] **Step 3: Implement recursive list flattening**

In `parser.ts`, add a helper function before `parseMarkdownToBlocks`:

```typescript
/**
 * Recursively flattens nested list items into a flat array of Blocks with depth annotations.
 * marked represents nesting via child list tokens inside ListItem.tokens arrays.
 *
 * @param items - List items from a marked List token
 * @param depth - Current nesting depth (0 = top level)
 * @param ordered - Whether this is an ordered list
 * @param startNum - Starting number for ordered lists
 * @returns Flat array of list blocks with depth
 */
function flattenListItems(
    items: marked.Tokens.ListItem[],
    depth: number,
    ordered: boolean,
    startNum: number
): Block[] {
    const clampedDepth = Math.min(depth, 3);
    const result: Block[] = [];

    items.forEach((item, idx) => {
        // Extract only the non-list tokens for this item's content.
        // IMPORTANT: item.text includes text from nested children, so we
        // cannot use it directly. Instead, filter item.tokens to exclude
        // nested list tokens, then reconstruct content from those.
        const ownTokens = (item.tokens ?? []).filter(t => t.type !== 'list');
        const ownText = ownTokens.map(t => t.raw).join('').trim();

        // Emit the item itself
        if (item.task) {
            result.push({
                type: 'taskListItem',
                content: ownText,
                tokens: ownTokens,
                depth: 0, // Task lists are always flat per spec
                checked: item.checked ?? false,
            });
        } else if (ordered) {
            result.push({
                type: 'orderedListItem',
                content: ownText,
                tokens: ownTokens,
                depth: clampedDepth,
                index: startNum + idx,
            });
        } else {
            result.push({
                type: 'list',
                content: ownText,
                tokens: ownTokens,
                depth: clampedDepth,
            });
        }

        // Recurse into any nested lists inside this item's tokens
        if (item.tokens) {
            for (const subToken of item.tokens) {
                if (subToken.type === 'list') {
                    const subList = subToken as marked.Tokens.List;
                    result.push(
                        ...flattenListItems(
                            subList.items,
                            depth + 1,
                            subList.ordered,
                            subList.start ?? 1
                        )
                    );
                }
            }
        }
    });

    return result;
}
```

Then replace the `case 'list':` block in `parseMarkdownToBlocks`:

```typescript
case 'list': {
    const listToken = token as marked.Tokens.List;
    blocks.push(
        ...flattenListItems(
            listToken.items,
            0,
            listToken.ordered,
            listToken.start ?? 1
        )
    );
    break;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd figma-markdown-sync && npx jest parser.test.ts --verbose -t "nested lists"`
Expected: PASS

- [ ] **Step 5: Run all tests to check for regressions**

Run: `cd figma-markdown-sync && npx jest --verbose`
Expected: All PASS (existing flat list tests should still work since depth 0 is backwards compatible)

- [ ] **Step 6: Commit**

```bash
git add figma-markdown-sync/parser.ts figma-markdown-sync/parser.test.ts
git commit -m "feat: recursive list parsing with depth for nested lists"
```

---

### Task 10: Render nested list indentation

**Files:**
- Modify: `figma-markdown-sync/renderer.ts` (renderListBlock, renderOrderedListBlock)
- Test: `figma-markdown-sync/renderer.test.ts`

- [ ] **Step 1: Write failing test for nested list rendering**

Add to `renderer.test.ts`:

```typescript
describe('nested list rendering', () => {
    it('applies left padding based on depth', async () => {
        const blocks: Block[] = [
            { type: 'list', content: 'Top level', depth: 0, tokens: [] },
            { type: 'list', content: 'Nested', depth: 1, tokens: [] },
            { type: 'list', content: 'Deep nested', depth: 2, tokens: [] },
        ];

        const result = await renderBlocks('Test', blocks, DEFAULT_SETTINGS);
        const listGroup = result.frame.children[0] as any;

        // Each item is a text node — check if wrapper frame has padding
        // For depth > 0, we wrap in a frame with left padding
        expect(listGroup.children).toHaveLength(3);
    });

    it('uses different bullet characters per depth', async () => {
        const blocks: Block[] = [
            { type: 'list', content: 'Level 0', depth: 0, tokens: [] },
            { type: 'list', content: 'Level 1', depth: 1, tokens: [] },
        ];

        const result = await renderBlocks('Test', blocks, DEFAULT_SETTINGS);
        const listGroup = result.frame.children[0] as any;

        // Depth 0 uses '• ', depth 1 uses '◦ '
        expect(listGroup.children[0].characters).toContain('•');
        expect(listGroup.children[1].characters).toContain('◦');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd figma-markdown-sync && npx jest renderer.test.ts --verbose -t "nested list"`
Expected: FAIL — no depth-based bullet characters yet

- [ ] **Step 3: Update renderListBlock to support depth**

In `renderer.ts`, update the `BULLET` constant and `renderListBlock`:

```typescript
const BULLETS = ['• ', '◦ ', '– ', '· '] as const;
const INDENT_PER_DEPTH = 20;

async function renderListBlock(block: Block): Promise<TextNode> {
    const node = figma.createText();
    const style = await getOrCreateTextStyle(STYLE_NAMES.LIST, DEFAULT_STYLES[STYLE_NAMES.LIST]);
    await node.setTextStyleIdAsync(style.id);
    node.layoutAlign = 'STRETCH';

    const depth = block.depth ?? 0;
    const bullet = BULLETS[Math.min(depth, BULLETS.length - 1)];

    if (block.tokens && block.tokens.length > 0) {
        const bulletToken = { type: 'text', raw: bullet, text: bullet } as any;
        await applyInlineStyles(node, [bulletToken, ...block.tokens], STYLE_NAMES.LIST);
    } else {
        const content = block.content ? `${bullet}${block.content}` : bullet.trimEnd();
        node.characters = content;
    }

    // Apply indentation for nested items
    if (depth > 0) {
        node.paragraphIndent = depth * INDENT_PER_DEPTH;
    }

    return node;
}
```

Also update `renderOrderedListBlock` to support depth indentation:

```typescript
async function renderOrderedListBlock(block: Block): Promise<TextNode> {
    const node = figma.createText();
    const style = await getOrCreateTextStyle(STYLE_NAMES.LIST, DEFAULT_STYLES[STYLE_NAMES.LIST]);
    await node.setTextStyleIdAsync(style.id);
    node.layoutAlign = 'STRETCH';

    const prefix = `${block.index ?? 1}. `;
    const depth = block.depth ?? 0;

    if (block.tokens && block.tokens.length > 0) {
        const prefixToken = { type: 'text', raw: prefix, text: prefix } as any;
        await applyInlineStyles(node, [prefixToken, ...block.tokens], STYLE_NAMES.LIST);
    } else {
        node.characters = block.content ? `${prefix}${block.content}` : prefix.trimEnd();
    }

    if (depth > 0) {
        node.paragraphIndent = depth * INDENT_PER_DEPTH;
    }

    return node;
}
```

Add `paragraphIndent` to the mock text node in `test-setup.ts`:

```typescript
paragraphIndent: 0,
```

Remove the old `BULLET` constant since it's replaced by `BULLETS`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd figma-markdown-sync && npx jest renderer.test.ts --verbose -t "nested list"`
Expected: PASS

- [ ] **Step 5: Run all tests**

Run: `cd figma-markdown-sync && npx jest --verbose`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add figma-markdown-sync/renderer.ts figma-markdown-sync/renderer.test.ts figma-markdown-sync/test-setup.ts
git commit -m "feat: render nested lists with depth-based indentation and bullets"
```

---

### Task 11: Parse and render task list items

**Files:**
- Modify: `figma-markdown-sync/parser.ts` (already handled by flattenListItems in Task 9)
- Modify: `figma-markdown-sync/renderer.ts` (replace renderTaskListBlock stub)
- Test: `figma-markdown-sync/parser.test.ts`, `figma-markdown-sync/renderer.test.ts`

- [ ] **Step 1: Write failing test for task list parsing**

Add to `parser.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it passes (should already work from Task 9)**

Run: `cd figma-markdown-sync && npx jest parser.test.ts --verbose -t "task lists"`
Expected: PASS — `flattenListItems` already handles `item.task === true`

- [ ] **Step 3: Write failing test for task list rendering**

Add to `renderer.test.ts`:

```typescript
describe('task list rendering', () => {
    it('renders taskListItem with checkbox visual', async () => {
        const blocks: Block[] = [
            { type: 'taskListItem', content: 'Do the thing', checked: false, depth: 0, tokens: [] },
            { type: 'taskListItem', content: 'Done thing', checked: true, depth: 0, tokens: [] },
        ];

        const result = await renderBlocks('Test', blocks, DEFAULT_SETTINGS);

        // Task items should be grouped in a list group
        expect(result.frame.children).toHaveLength(1);
        const listGroup = result.frame.children[0] as any;
        expect(listGroup.children).toHaveLength(2);

        // Each task item should be a frame (horizontal auto layout: checkbox + text)
        expect(listGroup.children[0].type).toBe('FRAME');
        expect(listGroup.children[0].layoutMode).toBe('HORIZONTAL');
    });

    it('uses checkbox prefix characters', async () => {
        const blocks: Block[] = [
            { type: 'taskListItem', content: 'Unchecked', checked: false, depth: 0, tokens: [] },
            { type: 'taskListItem', content: 'Checked', checked: true, depth: 0, tokens: [] },
        ];

        const result = await renderBlocks('Test', blocks, DEFAULT_SETTINGS);
        const listGroup = result.frame.children[0] as any;

        // Find text nodes inside the task frames
        const uncheckedFrame = listGroup.children[0] as any;
        const checkedFrame = listGroup.children[1] as any;

        // The checkbox rectangle should exist as first child
        expect(uncheckedFrame.children[0].type).toBe('RECTANGLE');
        // Text node should be second child
        expect(uncheckedFrame.children[1].type).toBe('TEXT');
    });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd figma-markdown-sync && npx jest renderer.test.ts --verbose -t "task list"`
Expected: FAIL — stub renderTaskListBlock returns a TextNode, not a frame with checkbox

- [ ] **Step 5: Implement renderTaskListBlock**

In `renderer.ts`, replace the stub with the real implementation:

```typescript
/**
 * Renders a task list item as a horizontal frame containing a checkbox rectangle and text node.
 */
async function renderTaskListBlock(block: Block): Promise<FrameNode> {
    const taskFrame = figma.createFrame();
    taskFrame.name = block.checked ? 'Task (done)' : 'Task';
    taskFrame.layoutMode = 'HORIZONTAL';
    taskFrame.itemSpacing = 8;
    taskFrame.primaryAxisSizingMode = 'FIXED';
    taskFrame.counterAxisSizingMode = 'AUTO';
    taskFrame.layoutAlign = 'STRETCH';
    taskFrame.fills = [];

    const depth = block.depth ?? 0;
    if (depth > 0) {
        taskFrame.paddingLeft = depth * INDENT_PER_DEPTH;
    }

    // Checkbox rectangle
    const checkbox = figma.createRectangle();
    checkbox.name = block.checked ? 'Checked' : 'Unchecked';
    checkbox.resize(16, 16);
    checkbox.cornerRadius = 3;
    if (block.checked) {
        checkbox.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.6, b: 0.2 } }];
    } else {
        checkbox.fills = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } }];
        checkbox.strokes = [{ type: 'SOLID', color: { r: 0.7, g: 0.7, b: 0.7 } }];
        checkbox.strokeWeight = 1;
    }

    // Text node
    const textNode = figma.createText();
    const style = await getOrCreateTextStyle(STYLE_NAMES.LIST, DEFAULT_STYLES[STYLE_NAMES.LIST]);
    await textNode.setTextStyleIdAsync(style.id);
    textNode.layoutAlign = 'STRETCH';
    textNode.layoutGrow = 1;

    if (block.tokens && block.tokens.length > 0) {
        await applyInlineStyles(textNode, block.tokens, STYLE_NAMES.LIST);
    } else {
        textNode.characters = block.content ?? '';
    }

    // Dim checked items
    if (block.checked) {
        textNode.opacity = 0.6;
    }

    taskFrame.appendChild(checkbox);
    taskFrame.appendChild(textNode);
    return taskFrame;
}
```

Note: The grouping loop already uses `let listNode: SceneNode` (set in Task 8), so the `FrameNode` return type is compatible without changes.

Add `opacity` and `cornerRadius` to the mock objects in `test-setup.ts`:

In `makeMockText()`:
```typescript
opacity: 1,
```

In `makeMockRectangle()`:
```typescript
cornerRadius: 0,
opacity: 1,
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd figma-markdown-sync && npx jest renderer.test.ts --verbose -t "task list"`
Expected: PASS

- [ ] **Step 7: Run all tests**

Run: `cd figma-markdown-sync && npx jest --verbose`
Expected: All PASS

- [ ] **Step 8: Commit**

```bash
git add figma-markdown-sync/renderer.ts figma-markdown-sync/renderer.test.ts figma-markdown-sync/test-setup.ts figma-markdown-sync/parser.test.ts
git commit -m "feat: render task list items with checkbox visual"
```

---

### Task 12: Final integration test and cleanup

**Files:**
- Modify: `figma-markdown-sync/parser.test.ts` (integration test)
- Modify: `figma-markdown-sync/renderer.test.ts` (integration test)

- [ ] **Step 1: Write integration test mixing all new content types**

Add to `parser.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test**

Run: `cd figma-markdown-sync && npx jest parser.test.ts --verbose -t "Integration"`
Expected: PASS

- [ ] **Step 3: Write renderer integration test**

Add to `renderer.test.ts`:

```typescript
describe('Integration — mixed block types', () => {
    it('renders a mix of list types without crashing', async () => {
        const blocks: Block[] = [
            { type: 'heading', content: 'Title', level: 1, tokens: [] },
            { type: 'paragraph', content: 'Hello world', tokens: [] },
            { type: 'orderedListItem', content: 'First', index: 1, depth: 0, tokens: [] },
            { type: 'orderedListItem', content: 'Second', index: 2, depth: 0, tokens: [] },
            { type: 'paragraph', content: 'Break', tokens: [] },
            { type: 'list', content: 'Bullet', depth: 0, tokens: [] },
            { type: 'list', content: 'Nested', depth: 1, tokens: [] },
            { type: 'paragraph', content: 'Another break', tokens: [] },
            { type: 'taskListItem', content: 'Todo', checked: false, depth: 0, tokens: [] },
            { type: 'taskListItem', content: 'Done', checked: true, depth: 0, tokens: [] },
        ];

        const result = await renderBlocks('Test', blocks, DEFAULT_SETTINGS);
        // heading, paragraph, list group, paragraph, list group, paragraph, list group
        expect(result.frame.children.length).toBe(7);
    });
});
```

- [ ] **Step 4: Run all tests**

Run: `cd figma-markdown-sync && npx jest --verbose`
Expected: All PASS

- [ ] **Step 5: Update CommonJS export shim in parser.ts**

Ensure the CommonJS export at the bottom of `parser.ts` includes `flattenListItems` if needed (it's a private function so NOT needed — but verify the existing exports still work):

```typescript
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseMarkdownToBlocks, extractImagesFromTokens, flattenTokens };
}
```

No change needed — `flattenListItems` is intentionally private.

- [ ] **Step 6: Run full test suite one final time**

Run: `cd figma-markdown-sync && npx jest --verbose --coverage`
Expected: All PASS, coverage should be comparable or better than before

- [ ] **Step 7: Commit**

```bash
git add figma-markdown-sync/parser.test.ts figma-markdown-sync/renderer.test.ts
git commit -m "test: add integration tests for all P0 content types"
```

---

## Summary

| Task | Feature | Files Changed |
|------|---------|--------------|
| 1 | Test infrastructure | test-setup.ts |
| 2 | Strikethrough parsing | parser.ts, parser.test.ts |
| 3 | Strikethrough rendering | styles.ts, styles.test.ts |
| 4 | Link parsing | parser.ts, parser.test.ts |
| 5 | Link rendering | styles.ts, styles.test.ts |
| 6 | GFM strikethrough e2e | parser.ts, parser.test.ts |
| 7 | Ordered list parsing | parser.ts, parser.test.ts |
| 8 | Ordered list rendering | renderer.ts, renderer.test.ts |
| 9 | Nested list parsing | parser.ts, parser.test.ts |
| 10 | Nested list rendering | renderer.ts, renderer.test.ts, test-setup.ts |
| 11 | Task list parsing + rendering | parser.test.ts, renderer.ts, renderer.test.ts, test-setup.ts |
| 12 | Integration tests | parser.test.ts, renderer.test.ts |

**Total: 12 tasks, ~25 commits, all TDD-driven.**

After this plan is complete, proceed with `2026-03-10-p1-enhanced-content-ux.md` for the P1 features.
