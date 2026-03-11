# P1: Enhanced Content Types & UX Implementation Plan

> **For agentic workers:** Use TDD. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 5 features to the Figma Markdown plugin: responsive width modes, callout/admonition blocks, table of contents generation, clipboard paste, and live preview.

**Architecture:** Extends the existing parser → renderer pipeline. New `callout` and `toc` Block types. Settings gains `widthMode` + `customWidth` replacing `frameWidth`. UI gets a paste tab and preview pane. All changes follow existing TDD patterns.

**Tech Stack:** TypeScript, marked ^4.3.0, Figma Plugin API, Jest 30.2.0

**Spec:** `docs/superpowers/specs/2026-03-10-v2-features-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `figma-markdown-sync/settings.ts` | Modify | Add `widthMode`, `customWidth`, `generateToc`; migrate `frameWidth`; add `resolvedFrameWidth()` helper |
| `figma-markdown-sync/parser.ts` | Modify | Add `callout` and `toc` Block types; detect admonition syntax in blockquotes; add `generateTocBlocks()` |
| `figma-markdown-sync/renderer.ts` | Modify | Add `renderCalloutBlock()`, `renderTocBlock()`; use `resolvedFrameWidth()` |
| `figma-markdown-sync/styles.ts` | Modify | Add `CALLOUT_LABEL` style config for callout type labels |
| `figma-markdown-sync/code.ts` | Modify | Handle `import-paste` message type; pass `generateToc` setting to parser |
| `figma-markdown-sync/ui.html` | Modify | Add paste tab, preview pane, width mode selector |
| `figma-markdown-sync/src/ui.ts` | Modify | Add paste handling, preview rendering, width mode UI logic |
| `figma-markdown-sync/src/styles.css` | Modify | Styles for paste area, preview, width mode selector |
| `figma-markdown-sync/settings.test.ts` | Modify | Tests for new settings fields, migration, resolvedFrameWidth |
| `figma-markdown-sync/parser.test.ts` | Modify | Tests for callout parsing, TOC generation |
| `figma-markdown-sync/renderer.test.ts` | Modify | Tests for callout rendering, TOC rendering |

---

## Chunk 1: Responsive Width Modes (Feature #16)

### Task 1: Extend Settings with Width Mode

- [ ] **Step 1: Write failing tests for new settings fields**

In `settings.test.ts`, add:

```typescript
describe('width mode settings', () => {
    it('should have default widthMode of medium', () => {
        expect(DEFAULT_SETTINGS.widthMode).toBe('medium');
    });

    it('should have default customWidth of 800', () => {
        expect(DEFAULT_SETTINGS.customWidth).toBe(800);
    });

    it('should validate widthMode enum values', () => {
        expect(validateSettings({ ...DEFAULT_SETTINGS, widthMode: 'narrow' })).toBe(true);
        expect(validateSettings({ ...DEFAULT_SETTINGS, widthMode: 'medium' })).toBe(true);
        expect(validateSettings({ ...DEFAULT_SETTINGS, widthMode: 'wide' })).toBe(true);
        expect(validateSettings({ ...DEFAULT_SETTINGS, widthMode: 'custom' })).toBe(true);
        expect(validateSettings({ ...DEFAULT_SETTINGS, widthMode: 'invalid' })).toBe(false);
    });

    it('should validate customWidth is positive', () => {
        expect(validateSettings({ ...DEFAULT_SETTINGS, customWidth: 1200 })).toBe(true);
        expect(validateSettings({ ...DEFAULT_SETTINGS, customWidth: 0 })).toBe(false);
        expect(validateSettings({ ...DEFAULT_SETTINGS, customWidth: -100 })).toBe(false);
    });
});

describe('resolvedFrameWidth', () => {
    it('should return 480 for narrow mode', () => {
        expect(resolvedFrameWidth({ ...DEFAULT_SETTINGS, widthMode: 'narrow' })).toBe(480);
    });

    it('should return 800 for medium mode', () => {
        expect(resolvedFrameWidth({ ...DEFAULT_SETTINGS, widthMode: 'medium' })).toBe(800);
    });

    it('should return 960 for wide mode', () => {
        expect(resolvedFrameWidth({ ...DEFAULT_SETTINGS, widthMode: 'wide' })).toBe(960);
    });

    it('should return customWidth for custom mode', () => {
        expect(resolvedFrameWidth({ ...DEFAULT_SETTINGS, widthMode: 'custom', customWidth: 1200 })).toBe(1200);
    });
});

describe('mergeWithDefaults migration', () => {
    it('should migrate frameWidth 480 to widthMode narrow', () => {
        const result = mergeWithDefaults({ frameWidth: 480 });
        expect(result.widthMode).toBe('narrow');
    });

    it('should migrate frameWidth 800 to widthMode medium', () => {
        const result = mergeWithDefaults({ frameWidth: 800 });
        expect(result.widthMode).toBe('medium');
    });

    it('should migrate frameWidth 960 to widthMode wide', () => {
        const result = mergeWithDefaults({ frameWidth: 960 });
        expect(result.widthMode).toBe('wide');
    });

    it('should migrate custom frameWidth to widthMode custom', () => {
        const result = mergeWithDefaults({ frameWidth: 1100 });
        expect(result.widthMode).toBe('custom');
        expect(result.customWidth).toBe(1100);
    });

    it('should preserve widthMode when already present', () => {
        const result = mergeWithDefaults({ widthMode: 'wide', customWidth: 500 });
        expect(result.widthMode).toBe('wide');
        expect(result.customWidth).toBe(500);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Update PluginSettings interface and defaults**

In `settings.ts`, update the `PluginSettings` interface:

```typescript
export type WidthMode = 'narrow' | 'medium' | 'wide' | 'custom';

export interface PluginSettings {
    blockSpacing: number;
    listSpacing: number;
    framePadding: number;
    /** @deprecated Use widthMode + customWidth instead. Kept for migration only. */
    frameWidth: number;
    /** Width mode preset */
    widthMode: WidthMode;
    /** Custom width in px (used when widthMode === 'custom') */
    customWidth: number;
    codeBackground: string;
    tableHeaderBackground: string;
    separatorColor: string;
}
```

Update `DEFAULT_SETTINGS`:
```typescript
export const DEFAULT_SETTINGS: PluginSettings = {
    blockSpacing: 16,
    listSpacing: 6,
    framePadding: 40,
    frameWidth: 800,  // kept for backwards compat
    widthMode: 'medium',
    customWidth: 800,
    codeBackground: '#F2F2F2',
    tableHeaderBackground: '#F2F2F7',
    separatorColor: '#CCCCCC',
};
```

Add width mode constants and resolver:
```typescript
const WIDTH_PRESETS: Record<WidthMode, number | null> = {
    narrow: 480,
    medium: 800,
    wide: 960,
    custom: null,
};

const VALID_WIDTH_MODES: readonly string[] = ['narrow', 'medium', 'wide', 'custom'];

function isValidWidthMode(value: unknown): value is WidthMode {
    return typeof value === 'string' && VALID_WIDTH_MODES.includes(value);
}

export function resolvedFrameWidth(settings: PluginSettings): number {
    return WIDTH_PRESETS[settings.widthMode] ?? settings.customWidth;
}
```

Update `validateSettings`:
```typescript
export function validateSettings(obj: unknown): obj is PluginSettings {
    if (!obj || typeof obj !== 'object') return false;
    const s = obj as Record<string, unknown>;

    return (
        isNonNegativeNumber(s.blockSpacing) &&
        isNonNegativeNumber(s.listSpacing) &&
        isNonNegativeNumber(s.framePadding) &&
        isPositiveNumber(s.frameWidth) &&
        isValidWidthMode(s.widthMode) &&
        isPositiveNumber(s.customWidth) &&
        isValidHex(s.codeBackground) &&
        isValidHex(s.tableHeaderBackground) &&
        isValidHex(s.separatorColor)
    );
}
```

Update `mergeWithDefaults` with migration logic:
```typescript
export function mergeWithDefaults(partial: unknown): PluginSettings {
    if (!partial || typeof partial !== 'object') return { ...DEFAULT_SETTINGS };

    const p = partial as Record<string, unknown>;

    // Migration: convert legacy frameWidth to widthMode + customWidth
    let widthMode: WidthMode = DEFAULT_SETTINGS.widthMode;
    let customWidth: number = DEFAULT_SETTINGS.customWidth;

    if (isValidWidthMode(p.widthMode)) {
        widthMode = p.widthMode;
        customWidth = isPositiveNumber(p.customWidth) ? (p.customWidth as number) : DEFAULT_SETTINGS.customWidth;
    } else if (isPositiveNumber(p.frameWidth)) {
        const fw = p.frameWidth as number;
        if (fw === 480) widthMode = 'narrow';
        else if (fw === 800) widthMode = 'medium';
        else if (fw === 960) widthMode = 'wide';
        else { widthMode = 'custom'; customWidth = fw; }
    }

    return {
        blockSpacing:          isNonNegativeNumber(p.blockSpacing)    ? (p.blockSpacing as number)          : DEFAULT_SETTINGS.blockSpacing,
        listSpacing:           isNonNegativeNumber(p.listSpacing)     ? (p.listSpacing as number)           : DEFAULT_SETTINGS.listSpacing,
        framePadding:          isNonNegativeNumber(p.framePadding)    ? (p.framePadding as number)          : DEFAULT_SETTINGS.framePadding,
        frameWidth:            resolvedFrameWidth({ ...DEFAULT_SETTINGS, widthMode, customWidth }),
        widthMode,
        customWidth,
        codeBackground:        isValidHex(p.codeBackground)           ? (p.codeBackground as string)        : DEFAULT_SETTINGS.codeBackground,
        tableHeaderBackground: isValidHex(p.tableHeaderBackground)    ? (p.tableHeaderBackground as string) : DEFAULT_SETTINGS.tableHeaderBackground,
        separatorColor:        isValidHex(p.separatorColor)           ? (p.separatorColor as string)        : DEFAULT_SETTINGS.separatorColor,
    };
}
```

Update CommonJS export shim to include `resolvedFrameWidth`.

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Update renderer to use resolvedFrameWidth**

In `renderer.ts`, import and use `resolvedFrameWidth`:
```typescript
import { resolvedFrameWidth } from './settings';
```

In `renderBlocks`, change:
```typescript
frame.resize(settings.frameWidth, frame.height);
```
to:
```typescript
const effectiveWidth = resolvedFrameWidth(settings);
frame.resize(effectiveWidth, frame.height);
```

In `createImageNode`, change:
```typescript
const maxWidth = settings.frameWidth;
```
to:
```typescript
const maxWidth = resolvedFrameWidth(settings);
```

- [ ] **Step 6: Update UI with width mode selector**

In `ui.html`, add a width mode section to settings:
```html
<div class="settings-section">
    <h3 class="settings-section-title">Frame</h3>
    <label class="settings-row">
        <span class="settings-label">Padding</span>
        <div class="settings-input-wrap"><input type="number" id="framePadding" min="0" max="200"><span class="settings-unit">px</span></div>
    </label>
    <label class="settings-row">
        <span class="settings-label">Width</span>
        <div class="settings-input-wrap">
            <select id="widthMode">
                <option value="narrow">Narrow (480px)</option>
                <option value="medium">Medium (800px)</option>
                <option value="wide">Wide (960px)</option>
                <option value="custom">Custom</option>
            </select>
        </div>
    </label>
    <label class="settings-row custom-width-row" id="customWidthRow" style="display:none">
        <span class="settings-label">Custom width</span>
        <div class="settings-input-wrap"><input type="number" id="customWidth" min="200" max="4000"><span class="settings-unit">px</span></div>
    </label>
</div>
```

Remove the old `frameWidth` input.

In `src/ui.ts`, update settingInputIds to include new fields:
```typescript
const settingInputIds = [
    'blockSpacing', 'listSpacing', 'framePadding', 'widthMode', 'customWidth',
    'codeBackground', 'tableHeaderBackground', 'separatorColor',
] as const;
```

Add width mode toggle logic to show/hide custom width input.

- [ ] **Step 7: Run all tests**

- [ ] **Step 8: Commit**

---

## Chunk 2: Callout / Admonition Blocks (Feature #6)

### Task 2: Parse Callout Blocks

- [ ] **Step 1: Extend Block type with callout**

In `parser.ts`, update Block interface:
```typescript
export interface Block {
    type: 'heading' | 'paragraph' | 'list' | 'code' | 'quote' | 'separator' | 'table' | 'image' | 'orderedListItem' | 'taskListItem' | 'callout';
    // ... existing fields ...
    // Callout-specific
    calloutType?: 'note' | 'tip' | 'important' | 'warning' | 'caution';
}
```

- [ ] **Step 2: Write failing tests for callout parsing**

In `parser.test.ts`:
```typescript
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
```

- [ ] **Step 3: Run tests to verify they fail**

- [ ] **Step 4: Implement callout detection in parser**

In `parser.ts`, add a callout detection helper and update the blockquote case:

```typescript
const CALLOUT_REGEX = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i;
const VALID_CALLOUT_TYPES = ['note', 'tip', 'important', 'warning', 'caution'] as const;
type CalloutType = typeof VALID_CALLOUT_TYPES[number];

function parseCallout(text: string): { calloutType: CalloutType; body: string } | null {
    const match = text.match(CALLOUT_REGEX);
    if (!match) return null;
    const type = match[1].toLowerCase();
    if (!VALID_CALLOUT_TYPES.includes(type as CalloutType)) return null;
    const body = text.slice(match[0].length).replace(/^\n+/, '').trim();
    return { calloutType: type as CalloutType, body };
}
```

Update the blockquote case in `parseMarkdownToBlocks`:
```typescript
case 'blockquote': {
    const bToken = token as marked.Tokens.Blockquote;
    const callout = parseCallout(bToken.text);
    if (callout) {
        blocks.push({
            type: 'callout',
            calloutType: callout.calloutType,
            content: callout.body,
            tokens: bToken.tokens,
        });
    } else {
        blocks.push({ type: 'quote', content: bToken.text });
    }
    break;
}
```

- [ ] **Step 5: Run tests to verify they pass**

- [ ] **Step 6: Commit**

### Task 3: Render Callout Blocks

- [ ] **Step 1: Write failing tests for callout rendering**

In `renderer.test.ts`:
```typescript
describe('callout block rendering', () => {
    it('should render a callout as a frame with colored left border', async () => {
        const blocks: Block[] = [{
            type: 'callout',
            calloutType: 'note',
            content: 'This is a note',
        }];
        const result = await renderBlocks('test', blocks, DEFAULT_SETTINGS);
        const frame = result.frame;
        // Callout should be a child frame
        const calloutFrame = frame.children[0];
        expect(calloutFrame.type).toBe('FRAME');
        expect(calloutFrame.name).toBe('Callout: Note');
    });

    it('should render callout label text', async () => {
        const blocks: Block[] = [{
            type: 'callout',
            calloutType: 'warning',
            content: 'Watch out!',
        }];
        const result = await renderBlocks('test', blocks, DEFAULT_SETTINGS);
        const calloutFrame = result.frame.children[0];
        // Should have label + body children
        expect(calloutFrame.children.length).toBeGreaterThanOrEqual(2);
    });

    it('should render all five callout types without error', async () => {
        const types = ['note', 'tip', 'important', 'warning', 'caution'] as const;
        for (const t of types) {
            const blocks: Block[] = [{ type: 'callout', calloutType: t, content: 'Body' }];
            const result = await renderBlocks('test', blocks, DEFAULT_SETTINGS);
            expect(result.frame.children.length).toBe(1);
        }
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement callout rendering**

In `renderer.ts`, add callout color config and render function:

```typescript
const CALLOUT_COLORS: Record<string, { border: RGB; bg: RGB; text: RGB }> = {
    note:      { border: hexToRgb('#0969DA'), bg: { r: 0.035, g: 0.412, b: 0.855 }, text: hexToRgb('#0969DA') },
    tip:       { border: hexToRgb('#1A7F37'), bg: { r: 0.102, g: 0.498, b: 0.216 }, text: hexToRgb('#1A7F37') },
    important: { border: hexToRgb('#8250DF'), bg: { r: 0.510, g: 0.314, b: 0.875 }, text: hexToRgb('#8250DF') },
    warning:   { border: hexToRgb('#9A6700'), bg: { r: 0.604, g: 0.404, b: 0.000 }, text: hexToRgb('#9A6700') },
    caution:   { border: hexToRgb('#CF222E'), bg: { r: 0.812, g: 0.133, b: 0.180 }, text: hexToRgb('#CF222E') },
};

const CALLOUT_LABELS: Record<string, string> = {
    note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution',
};

async function renderCalloutBlock(block: Block, settings: PluginSettings): Promise<FrameNode> {
    const calloutType = block.calloutType ?? 'note';
    const colors = CALLOUT_COLORS[calloutType] ?? CALLOUT_COLORS.note;

    const calloutFrame = figma.createFrame();
    calloutFrame.name = `Callout: ${CALLOUT_LABELS[calloutType]}`;
    calloutFrame.layoutMode = 'VERTICAL';
    calloutFrame.primaryAxisSizingMode = 'AUTO';
    calloutFrame.counterAxisSizingMode = 'FIXED';
    calloutFrame.layoutAlign = 'STRETCH';
    calloutFrame.itemSpacing = 8;
    calloutFrame.paddingTop = 12;
    calloutFrame.paddingBottom = 12;
    calloutFrame.paddingLeft = 16;
    calloutFrame.paddingRight = 16;

    // Background fill at 10% opacity
    calloutFrame.fills = [{
        type: 'SOLID',
        color: colors.bg,
        opacity: 0.1,
    }];

    // Left border
    calloutFrame.strokes = [{ type: 'SOLID', color: colors.border }];
    calloutFrame.strokeWeight = 0;
    calloutFrame.strokeLeftWeight = 4;
    calloutFrame.strokeTopWeight = 0;
    calloutFrame.strokeBottomWeight = 0;
    calloutFrame.strokeRightWeight = 0;

    // Label text
    const labelNode = figma.createText();
    const boldFont = await loadFont('Inter', 'Bold');
    labelNode.fontName = boldFont;
    labelNode.fontSize = 14;
    labelNode.characters = CALLOUT_LABELS[calloutType];
    labelNode.fills = [{ type: 'SOLID', color: colors.text }];
    labelNode.layoutAlign = 'STRETCH';

    // Body text
    const bodyNode = figma.createText();
    const bodyStyle = await getOrCreateTextStyle(STYLE_NAMES.BODY, DEFAULT_STYLES[STYLE_NAMES.BODY]);
    await bodyNode.setTextStyleIdAsync(bodyStyle.id);
    bodyNode.layoutAlign = 'STRETCH';

    if (block.tokens && block.tokens.length > 0) {
        // Filter out the admonition marker from tokens for body rendering
        await applyInlineStyles(bodyNode, block.tokens, STYLE_NAMES.BODY);
    } else {
        bodyNode.characters = block.content ?? '';
    }

    calloutFrame.appendChild(labelNode);
    calloutFrame.appendChild(bodyNode);
    return calloutFrame;
}
```

Add to `renderBlock` switch:
```typescript
case 'callout': {
    return await renderCalloutBlock(block, settings);
}
```

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Run all tests**

- [ ] **Step 6: Commit**

---

## Chunk 3: Table of Contents Generation (Feature #10)

### Task 4: Parse and Generate TOC Blocks

- [ ] **Step 1: Add TOC block type and generateToc setting**

In `parser.ts`, update Block type:
```typescript
type: '...' | 'toc';
// Add TOC-specific field:
tocEntries?: Array<{ text: string; level: number }>;
```

In `settings.ts`, add to `PluginSettings`:
```typescript
/** Whether to auto-generate a table of contents from headings */
generateToc: boolean;
```

Default: `false`. Update `DEFAULT_SETTINGS`, `validateSettings`, and `mergeWithDefaults`.

- [ ] **Step 2: Write failing tests for TOC generation**

In `parser.test.ts`:
```typescript
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
        // frontmatter toc: true overrides setting
        expect(blocks[0].type).toBe('toc');
    });
});
```

- [ ] **Step 3: Run tests to verify they fail**

- [ ] **Step 4: Implement TOC generation in parser**

Update `parseMarkdownToBlocks` signature to accept options:
```typescript
export interface ParseOptions {
    generateToc?: boolean;
}

export function parseMarkdownToBlocks(markdown: string, options?: ParseOptions): Block[] {
    const frontMatterRegex = /^---[\s\S]*?---\r?\n/;
    const frontMatterMatch = markdown.match(frontMatterRegex);

    // Check frontmatter for toc: true
    let tocFromFrontmatter = false;
    if (frontMatterMatch) {
        tocFromFrontmatter = /^toc:\s*true\s*$/m.test(frontMatterMatch[0]);
    }

    const cleanMarkdown = markdown.replace(frontMatterRegex, '');
    // ... existing parsing ...

    const shouldGenerateToc = options?.generateToc || tocFromFrontmatter;
    if (shouldGenerateToc) {
        const headings = blocks.filter(b => b.type === 'heading');
        if (headings.length > 0) {
            const tocBlock: Block = {
                type: 'toc',
                tocEntries: headings.map(h => ({ text: h.content ?? '', level: h.level ?? 1 })),
            };
            blocks.unshift(tocBlock);
        }
    }

    return blocks;
}
```

- [ ] **Step 5: Run tests to verify they pass**

- [ ] **Step 6: Commit**

### Task 5: Render TOC Block

- [ ] **Step 1: Write failing tests for TOC rendering**

In `renderer.test.ts`:
```typescript
describe('TOC block rendering', () => {
    it('should render a TOC frame with entries', async () => {
        const blocks: Block[] = [{
            type: 'toc',
            tocEntries: [
                { text: 'Title', level: 1 },
                { text: 'Section', level: 2 },
            ],
        }];
        const result = await renderBlocks('test', blocks, DEFAULT_SETTINGS);
        const tocFrame = result.frame.children[0];
        expect(tocFrame.type).toBe('FRAME');
        expect(tocFrame.name).toBe('Table of Contents');
    });

    it('should render "Contents" label and entries', async () => {
        const blocks: Block[] = [{
            type: 'toc',
            tocEntries: [
                { text: 'Heading 1', level: 1 },
                { text: 'Heading 2', level: 2 },
                { text: 'Heading 3', level: 3 },
            ],
        }];
        const result = await renderBlocks('test', blocks, DEFAULT_SETTINGS);
        const tocFrame = result.frame.children[0];
        // Label + 3 entries = 4 children
        expect(tocFrame.children.length).toBe(4);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement TOC rendering**

In `renderer.ts`:

```typescript
async function renderTocBlock(block: Block): Promise<FrameNode> {
    const tocFrame = figma.createFrame();
    tocFrame.name = 'Table of Contents';
    tocFrame.layoutMode = 'VERTICAL';
    tocFrame.primaryAxisSizingMode = 'AUTO';
    tocFrame.counterAxisSizingMode = 'FIXED';
    tocFrame.layoutAlign = 'STRETCH';
    tocFrame.itemSpacing = 4;
    tocFrame.paddingBottom = 12;
    tocFrame.fills = [];

    // "Contents" label
    const labelNode = figma.createText();
    const h3Style = await getOrCreateTextStyle(STYLE_NAMES.H3, DEFAULT_STYLES[STYLE_NAMES.H3]);
    await labelNode.setTextStyleIdAsync(h3Style.id);
    labelNode.characters = 'Contents';
    labelNode.layoutAlign = 'STRETCH';
    tocFrame.appendChild(labelNode);

    // TOC entries
    const bodyStyle = await getOrCreateTextStyle(STYLE_NAMES.BODY, DEFAULT_STYLES[STYLE_NAMES.BODY]);
    for (const entry of (block.tocEntries ?? [])) {
        const entryNode = figma.createText();
        await entryNode.setTextStyleIdAsync(bodyStyle.id);
        entryNode.fontSize = 14;
        entryNode.characters = entry.text;
        entryNode.layoutAlign = 'STRETCH';

        // Indent: H1 = 0, H2 = 20px, H3 = 40px
        const indent = Math.max(0, (entry.level - 1)) * 20;
        if (indent > 0) {
            entryNode.paragraphIndent = indent;
        }

        tocFrame.appendChild(entryNode);
    }

    return tocFrame;
}
```

Add to `renderBlock` switch:
```typescript
case 'toc': {
    return await renderTocBlock(block);
}
```

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Update code.ts to pass generateToc option**

In `code.ts`, update the import call:
```typescript
const blocks = parseMarkdownToBlocks(file.content, { generateToc: settings.generateToc });
```

- [ ] **Step 6: Add TOC toggle to settings UI**

In `ui.html`, add a toggle in settings:
```html
<label class="settings-row">
    <span class="settings-label">Generate TOC</span>
    <div class="settings-input-wrap"><input type="checkbox" id="generateToc"></div>
</label>
```

In `src/ui.ts`, handle the checkbox in populateSettings and sendCurrentSettings.

- [ ] **Step 7: Run all tests**

- [ ] **Step 8: Commit**

---

## Chunk 4: Clipboard Paste (Feature #20)

### Task 6: Add Paste Input Mode to UI

- [ ] **Step 1: Add paste tab to ui.html**

Add a "Paste" subtab or expandable area within the Import tab:

```html
<!-- Inside tab-import, after drop zone -->
<div class="paste-section">
    <button id="paste-toggle" class="paste-toggle-btn">or paste Markdown</button>
    <div id="paste-area-wrap" class="paste-area-wrap hidden">
        <textarea id="paste-area" class="paste-area" rows="8" placeholder="Paste your Markdown here..."></textarea>
        <div class="paste-actions">
            <input type="text" id="paste-name" class="paste-name-input" placeholder="Frame name (optional)">
            <button id="paste-import-btn" class="btn-secondary" disabled>Import Paste</button>
        </div>
    </div>
</div>
```

- [ ] **Step 2: Add paste CSS**

In `src/styles.css`:
```css
.paste-section { padding: 0 16px 8px; }
.paste-toggle-btn { ... } /* styled as a text link */
.paste-area-wrap { margin-top: 8px; }
.paste-area { width: 100%; resize: vertical; ... }
.paste-actions { display: flex; gap: 8px; margin-top: 8px; }
.paste-name-input { flex: 1; ... }
```

- [ ] **Step 3: Add paste handling in ui.ts**

In `src/ui.ts`:
```typescript
const pasteToggle = document.getElementById('paste-toggle') as HTMLButtonElement;
const pasteAreaWrap = document.getElementById('paste-area-wrap') as HTMLElement;
const pasteArea = document.getElementById('paste-area') as HTMLTextAreaElement;
const pasteName = document.getElementById('paste-name') as HTMLInputElement;
const pasteImportBtn = document.getElementById('paste-import-btn') as HTMLButtonElement;

pasteToggle.addEventListener('click', () => {
    pasteAreaWrap.classList.toggle('hidden');
});

pasteArea.addEventListener('input', () => {
    pasteImportBtn.disabled = pasteArea.value.trim().length === 0;
});

pasteImportBtn.addEventListener('click', () => {
    const content = pasteArea.value.trim();
    if (!content) return;

    const name = pasteName.value.trim() || `Pasted Markdown ${new Date().toLocaleString()}`;

    loader.classList.remove('hidden');
    pasteImportBtn.disabled = true;

    parent.postMessage({
        pluginMessage: {
            type: 'import-markdown-batch',
            files: [{ name: `${name}.md`, content }],
        },
    }, '*');
});
```

- [ ] **Step 4: Handle paste clipboard button (bonus)**

Add a "Paste from clipboard" button:
```typescript
const clipboardBtn = document.getElementById('clipboard-btn') as HTMLButtonElement;
clipboardBtn?.addEventListener('click', async () => {
    try {
        const text = await navigator.clipboard.readText();
        pasteArea.value = text;
        pasteImportBtn.disabled = text.trim().length === 0;
    } catch (err) {
        showStatus('Clipboard access denied', 'error');
    }
});
```

- [ ] **Step 5: Commit**

---

## Chunk 5: Live Preview (Feature #17)

### Task 7: Add Preview Pane to UI

- [ ] **Step 1: Add preview HTML structure**

In `ui.html`, add a preview pane that appears between file drop and import:

```html
<!-- Preview pane (hidden by default, shown after file drop) -->
<div id="preview-pane" class="preview-pane hidden">
    <div class="preview-header">
        <h3 class="preview-title">Preview</h3>
        <span id="preview-summary" class="preview-summary"></span>
    </div>
    <div id="preview-content" class="preview-content"></div>
    <div class="preview-actions">
        <button id="preview-cancel" class="btn-secondary">Cancel</button>
        <button id="preview-import">Import to Canvas</button>
    </div>
</div>
```

- [ ] **Step 2: Add preview CSS**

In `src/styles.css`:
```css
.preview-pane { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.preview-header { padding: 12px 16px 8px; border-bottom: 1px solid #E5E5E5; }
.preview-title { font-size: 13px; font-weight: 600; color: var(--color-block); }
.preview-summary { font-size: 11px; color: #888; }
.preview-content { flex: 1; overflow-y: auto; padding: 12px 16px; }
.preview-actions { padding: 10px 16px; display: flex; gap: 8px; justify-content: flex-end; border-top: 1px solid #E5E5E5; }

/* Preview block styles */
.preview-block { margin-bottom: 8px; }
.preview-block h1, .preview-block h2, .preview-block h3 { margin: 8px 0 4px; }
.preview-block pre { background: #F2F2F2; padding: 8px; border-radius: 4px; font-size: 11px; overflow-x: auto; }
.preview-block code { background: #F2F2F2; padding: 1px 4px; border-radius: 2px; font-size: 11px; }
.preview-block blockquote { border-left: 3px solid #DDD; padding-left: 12px; color: #666; }
.preview-block table { border-collapse: collapse; font-size: 11px; width: 100%; }
.preview-block th, .preview-block td { border: 1px solid #DDD; padding: 4px 8px; }
.preview-block th { background: #F2F2F7; }
.preview-block img { max-width: 100%; height: auto; }
.preview-block hr { border: none; border-top: 1px solid #DDD; margin: 8px 0; }
```

- [ ] **Step 3: Implement preview rendering in ui.ts**

The preview uses `marked`'s built-in HTML rendering (already bundled since the parser imports it):

```typescript
import { marked } from 'marked';

function showPreview(files: { name: string; content: string }[]) {
    const previewPane = document.getElementById('preview-pane') as HTMLElement;
    const previewContent = document.getElementById('preview-content') as HTMLElement;
    const previewSummary = document.getElementById('preview-summary') as HTMLElement;
    const importSection = document.querySelector('.import-color-block') as HTMLElement;

    // Hide drop zone, show preview
    importSection.style.display = 'none';
    fileList.style.display = 'none';
    previewPane.classList.remove('hidden');

    // Summary
    let totalBlocks = 0;
    const allHtml: string[] = [];

    for (const file of files) {
        const html = marked.parse(file.content.replace(/^---[\s\S]*?---\r?\n/, ''));
        allHtml.push(`<div class="preview-file"><h4 style="font-size:11px;color:#888;margin-bottom:4px;">${file.name}</h4><div class="preview-block">${html}</div></div>`);
    }

    previewContent.innerHTML = allHtml.join('<hr style="margin:12px 0;">');
    previewSummary.textContent = `${files.length} file${files.length === 1 ? '' : 's'}`;
}
```

- [ ] **Step 4: Wire up preview flow**

In `src/ui.ts`, modify `handleFiles` to show preview instead of immediately enabling import:

```typescript
async function handleFiles(files: FileList) {
    // ... existing file reading logic ...

    if (currentFiles.length > 0) {
        showPreview(currentFiles);
    }
}
```

Wire up preview buttons:
```typescript
document.getElementById('preview-cancel')?.addEventListener('click', () => {
    hidePreview();
    currentFiles = [];
    renderFileList([]);
});

document.getElementById('preview-import')?.addEventListener('click', () => {
    if (currentFiles.length === 0) return;
    loader.classList.remove('hidden');

    parent.postMessage({
        pluginMessage: { type: 'import-markdown-batch', files: currentFiles }
    }, '*');
});

function hidePreview() {
    document.getElementById('preview-pane')?.classList.add('hidden');
    (document.querySelector('.import-color-block') as HTMLElement).style.display = '';
    (fileList as HTMLElement).style.display = '';
}
```

Update the status message handler to also hide preview on completion:
```typescript
case 'status':
    loader.classList.add('hidden');
    hidePreview();
    // ... rest unchanged
```

- [ ] **Step 5: Handle paste preview integration**

When paste imports, also show preview if content is present:
```typescript
pasteImportBtn.addEventListener('click', () => {
    const content = pasteArea.value.trim();
    if (!content) return;
    const name = pasteName.value.trim() || `Pasted Markdown`;
    currentFiles = [{ name: `${name}.md`, content }];
    showPreview(currentFiles);
});
```

- [ ] **Step 6: Commit**

### Task 8: Integration Testing & Final Cleanup

- [ ] **Step 1: Write integration test for callout + TOC together**

In `parser.test.ts`:
```typescript
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
        const callouts = blocks.filter(b => b.type === 'callout');
        expect(callouts).toHaveLength(2);
        expect(callouts[0].calloutType).toBe('note');
        expect(callouts[1].calloutType).toBe('warning');
    });
});
```

- [ ] **Step 2: Update CommonJS export shims**

Ensure all new exports are included in the CommonJS shims at the bottom of modified files.

- [ ] **Step 3: Run full test suite**

- [ ] **Step 4: Commit**

---

## Summary

| Chunk | Feature | Files Modified | Test Count (approx) |
|-------|---------|---------------|---------------------|
| 1 | Responsive Widths | settings.ts, renderer.ts, ui.html, ui.ts, styles.css, settings.test.ts | ~12 |
| 2 | Callout Blocks | parser.ts, renderer.ts, parser.test.ts, renderer.test.ts | ~12 |
| 3 | TOC Generation | parser.ts, settings.ts, renderer.ts, code.ts, ui.html, ui.ts, parser.test.ts, renderer.test.ts, settings.test.ts | ~10 |
| 4 | Clipboard Paste | ui.html, ui.ts, styles.css | 0 (UI-only) |
| 5 | Live Preview | ui.html, ui.ts, styles.css | 0 (UI-only) |

**Total estimated new tests:** ~34
**Total files touched:** 11
