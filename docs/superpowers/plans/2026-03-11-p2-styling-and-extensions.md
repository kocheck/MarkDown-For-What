# P2: Styling & Content Extensions Implementation Plan

> **For agentic workers:** Use TDD. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 4 features to the Figma Markdown plugin: theme presets (dark/light/docs), style binding to existing local styles, definition lists, and selective block import.

**Architecture:** Extends the existing parser → renderer pipeline. New `definitionList` Block type. Settings gains `theme`, `frameFillColor`, `styleBindings`. Preview pane gains per-block checkboxes. All changes follow existing TDD patterns.

**Tech Stack:** TypeScript, marked ^4.3.0, Figma Plugin API, Jest 30.2.0

**Spec:** `docs/superpowers/specs/2026-03-10-v2-features-design.md`

**Excluded from P2:** Badge pills (#9) and footnotes (#7) are deferred — both require custom `marked` extensions that add inline token complexity. They are better tackled together in a dedicated inline-extensions pass. Selective import (#18) is included instead as it builds on the existing preview pane with lower risk.

---

## Priority Order & Rationale

1. **Theme Presets (#14)** — Low complexity, high visual impact. Introduces `frameFillColor` and theme constants that style binding builds on.
2. **Style Binding (#13)** — Medium complexity, high value for power users. Depends on theme infrastructure for sensible defaults.
3. **Definition Lists (#8)** — Medium complexity, self-contained content type. Custom `marked` block extension, good proving ground before footnotes/badges.
4. **Selective Block Import (#18)** — Medium complexity, builds on existing preview pane (#17). Hard dependency on preview already shipped in P1.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `figma-markdown-sync/settings.ts` | Modify | Add `theme`, `frameFillColor`, `styleBindings`; add theme preset objects; add `resolveThemeSettings()` |
| `figma-markdown-sync/settings.test.ts` | Modify | Tests for themes, style bindings, frame fill color |
| `figma-markdown-sync/constants.ts` | Modify | Add theme preset color/spacing constants |
| `figma-markdown-sync/renderer.ts` | Modify | Apply `frameFillColor` to root frame; use style bindings in text style lookup |
| `figma-markdown-sync/renderer.test.ts` | Modify | Tests for frame fill, style binding dispatch |
| `figma-markdown-sync/styles.ts` | Modify | Add `getOrCreateTextStyleWithBinding()` that checks bindings before creating |
| `figma-markdown-sync/styles.test.ts` | Modify | Tests for style binding lookup |
| `figma-markdown-sync/parser.ts` | Modify | Add `definitionList` Block type; register custom `marked` extension |
| `figma-markdown-sync/parser.test.ts` | Modify | Tests for definition list parsing |
| `figma-markdown-sync/blockRenderers.ts` | Modify | Add `renderDefinitionListBlock()` |
| `figma-markdown-sync/code.ts` | Modify | Handle style-list request messages; pass style bindings to renderer |
| `figma-markdown-sync/ui.html` | Modify | Theme selector, style mapping dropdowns, block checkboxes in preview |
| `figma-markdown-sync/src/ui.ts` | Modify | Theme selection logic, style list population, selective import toggling |
| `figma-markdown-sync/src/styles.css` | Modify | Theme selector styling, style mapping UI, checkbox styles in preview |

---

## Chunk 1: Theme Presets (Feature #14)

### Task 1: Add Theme Types and Constants

- [ ] **Step 1: Write failing tests for theme settings fields**

In `settings.test.ts`, add:

```typescript
describe('theme settings', () => {
    it('should have default theme of minimal-light', () => {
        expect(DEFAULT_SETTINGS.theme).toBe('minimal-light');
    });

    it('should have default frameFillColor of #FFFFFF', () => {
        expect(DEFAULT_SETTINGS.frameFillColor).toBe('#FFFFFF');
    });

    it('should validate theme enum values', () => {
        expect(validateSettings({ ...DEFAULT_SETTINGS, theme: 'minimal-light' })).toBe(true);
        expect(validateSettings({ ...DEFAULT_SETTINGS, theme: 'dark-mode' })).toBe(true);
        expect(validateSettings({ ...DEFAULT_SETTINGS, theme: 'documentation' })).toBe(true);
        expect(validateSettings({ ...DEFAULT_SETTINGS, theme: 'custom' })).toBe(true);
        expect(validateSettings({ ...DEFAULT_SETTINGS, theme: 'invalid' })).toBe(false);
    });

    it('should validate frameFillColor as hex', () => {
        expect(validateSettings({ ...DEFAULT_SETTINGS, frameFillColor: '#1E1E1E' })).toBe(true);
        expect(validateSettings({ ...DEFAULT_SETTINGS, frameFillColor: 'not-hex' })).toBe(false);
    });
});
```

- [ ] **Step 2: Add theme type and settings fields**

In `settings.ts`:
- Add `Theme` type: `'minimal-light' | 'dark-mode' | 'documentation' | 'custom'`
- Add `theme: Theme` and `frameFillColor: string` to `PluginSettings`
- Set defaults: `theme: 'minimal-light'`, `frameFillColor: '#FFFFFF'`
- Add validation for theme enum and frameFillColor hex

- [ ] **Step 3: Write failing tests for theme preset resolution**

```typescript
describe('resolveThemeSettings', () => {
    it('should return minimal-light defaults unchanged', () => {
        const resolved = resolveThemeSettings('minimal-light');
        expect(resolved.frameFillColor).toBe('#FFFFFF');
        expect(resolved.blockSpacing).toBe(16);
    });

    it('should return dark-mode overrides', () => {
        const resolved = resolveThemeSettings('dark-mode');
        expect(resolved.frameFillColor).toBe('#1E1E1E');
    });

    it('should return documentation preset with tighter spacing', () => {
        const resolved = resolveThemeSettings('documentation');
        expect(resolved.blockSpacing).toBe(8);
        expect(resolved.listSpacing).toBe(4);
    });

    it('should return empty overrides for custom theme', () => {
        const resolved = resolveThemeSettings('custom');
        expect(Object.keys(resolved)).toHaveLength(0);
    });
});
```

- [ ] **Step 4: Implement theme presets**

In `settings.ts`, add `THEME_PRESETS` const objects and `resolveThemeSettings()`:

```typescript
export const THEME_PRESETS = {
    'minimal-light': {
        frameFillColor: '#FFFFFF',
        codeBackground: '#F2F2F2',
        tableHeaderBackground: '#F2F2F2',
        separatorColor: '#E0E0E0',
        blockSpacing: 16,
        listSpacing: 4,
        framePadding: 40,
    },
    'dark-mode': {
        frameFillColor: '#1E1E1E',
        codeBackground: '#2D2D2D',
        tableHeaderBackground: '#2D2D2D',
        separatorColor: '#404040',
        blockSpacing: 16,
        listSpacing: 4,
        framePadding: 40,
    },
    'documentation': {
        frameFillColor: '#FFFFFF',
        codeBackground: '#F6F8FA',
        tableHeaderBackground: '#F6F8FA',
        separatorColor: '#D0D7DE',
        blockSpacing: 8,
        listSpacing: 4,
        framePadding: 24,
    },
} as const;
```

- [ ] **Step 5: Run tests, verify all pass**

### Task 2: Apply Frame Fill Color in Renderer

- [ ] **Step 6: Write failing test for frame fill color**

In `renderer.test.ts`:

```typescript
it('should apply frameFillColor to root frame', async () => {
    const settings = { ...DEFAULT_SETTINGS, frameFillColor: '#1E1E1E' };
    const result = await renderBlocks('Test', [{ type: 'paragraph', content: 'hello' }], settings);
    expect(result.frame.fills).toEqual([{
        type: 'SOLID',
        color: { r: expect.closeTo(0.118), g: expect.closeTo(0.118), b: expect.closeTo(0.118) },
    }]);
});
```

- [ ] **Step 7: Implement frame fill color in renderer**

In `renderer.ts` `renderBlocks()`, after creating the root frame, apply `frameFillColor`:

```typescript
const fillColor = hexToRgb(settings.frameFillColor ?? '#FFFFFF');
frame.fills = [{ type: 'SOLID', color: fillColor }];
```

- [ ] **Step 8: Run tests, verify all pass**

### Task 3: Theme Selector UI

- [ ] **Step 9: Add theme selector to Settings tab in ui.html**

Add a segmented control at the top of the Settings tab:

```html
<div class="setting-group">
    <label class="setting-label">Theme</label>
    <div class="theme-selector">
        <button class="theme-btn active" data-theme="minimal-light">Light</button>
        <button class="theme-btn" data-theme="dark-mode">Dark</button>
        <button class="theme-btn" data-theme="documentation">Docs</button>
    </div>
</div>
```

- [ ] **Step 10: Add theme selection logic in ui.ts**

Wire up theme buttons to send `update-settings` messages. When a theme is selected, populate all settings fields with the preset values and mark the theme. If the user changes any individual setting afterward, the theme switches to "Custom".

- [ ] **Step 11: Add CSS for theme selector**

- [ ] **Step 12: Run tests, verify all pass**

---

## Chunk 2: Style Binding to Existing Local Styles (Feature #13)

### Task 4: Add Style Binding Settings

- [ ] **Step 1: Write failing tests for styleBindings settings**

In `settings.test.ts`:

```typescript
describe('style binding settings', () => {
    it('should have empty default styleBindings', () => {
        expect(DEFAULT_SETTINGS.styleBindings).toEqual({});
    });

    it('should validate styleBindings with known element keys', () => {
        const valid = { ...DEFAULT_SETTINGS, styleBindings: { h1: 'S:abc123', body: 'auto' } };
        expect(validateSettings(valid)).toBe(true);
    });

    it('should merge styleBindings preserving existing mappings', () => {
        const stored = { styleBindings: { h1: 'S:abc123' } };
        const merged = mergeWithDefaults(stored);
        expect(merged.styleBindings.h1).toBe('S:abc123');
    });
});
```

- [ ] **Step 2: Add styleBindings to PluginSettings**

```typescript
styleBindings: {
    h1?: string;    // text style ID or 'auto'
    h2?: string;
    h3?: string;
    body?: string;
    code?: string;
    list?: string;
    quote?: string;
    codeBg?: string;   // paint style ID
    tableBg?: string;  // paint style ID
};
```

Default: `{}` (all auto).

- [ ] **Step 3: Run tests, verify all pass**

### Task 5: Style Binding in Renderer

- [ ] **Step 4: Write failing tests for style binding dispatch**

In `styles.test.ts`:

```typescript
describe('getOrCreateTextStyleWithBinding', () => {
    it('should use existing style when binding is set', async () => {
        // Mock figma.getStyleByIdAsync to return a style
        const mockStyle = { id: 'S:123', name: 'My H1' };
        (figma as any).getStyleByIdAsync = jest.fn().mockResolvedValue(mockStyle);

        const style = await getOrCreateTextStyleWithBinding('Markdown/H1', DEFAULT_STYLES.H1, 'S:123');
        expect(figma.getStyleByIdAsync).toHaveBeenCalledWith('S:123');
        expect(style).toBe(mockStyle);
    });

    it('should fall back to getOrCreateTextStyle when binding is auto', async () => {
        const style = await getOrCreateTextStyleWithBinding('Markdown/H1', DEFAULT_STYLES.H1, 'auto');
        // Should create the default style
        expect(style.name).toBe('Markdown/H1');
    });

    it('should fall back to getOrCreateTextStyle when bound style not found', async () => {
        (figma as any).getStyleByIdAsync = jest.fn().mockResolvedValue(null);
        const style = await getOrCreateTextStyleWithBinding('Markdown/H1', DEFAULT_STYLES.H1, 'S:missing');
        expect(style.name).toBe('Markdown/H1');
    });
});
```

- [ ] **Step 5: Implement getOrCreateTextStyleWithBinding in styles.ts**

```typescript
export async function getOrCreateTextStyleWithBinding(
    name: string, config: StyleConfig, bindingId?: string
): Promise<TextStyle> {
    if (bindingId && bindingId !== 'auto') {
        const existing = await figma.getStyleByIdAsync(bindingId);
        if (existing) return existing as TextStyle;
    }
    return getOrCreateTextStyle(name, config);
}
```

- [ ] **Step 6: Update renderer.ts to pass styleBindings through**

In `renderBlock()`, when selecting a text style, map block type to the corresponding `styleBindings` key and pass it to `getOrCreateTextStyleWithBinding`.

- [ ] **Step 7: Run tests, verify all pass**

### Task 6: Style Binding UI

- [ ] **Step 8: Add sandbox message handler for style list requests**

In `code.ts`, handle a `get-local-styles` message type:

```typescript
case 'get-local-styles': {
    const textStyles = await figma.getLocalTextStylesAsync();
    const paintStyles = await figma.getLocalPaintStylesAsync();
    figma.ui.postMessage({
        type: 'local-styles',
        textStyles: textStyles.map(s => ({ id: s.id, name: s.name })),
        paintStyles: paintStyles.map(s => ({ id: s.id, name: s.name })),
    });
    break;
}
```

- [ ] **Step 9: Add Style Mapping section to Settings tab**

In `ui.html`, add a "Style Mapping" section after the theme selector. Each element (H1, H2, H3, Body, Code, List, Quote) gets a dropdown. Dropdowns are initially empty and populated when the sandbox responds with `local-styles`.

- [ ] **Step 10: Wire up style mapping UI in ui.ts**

On Settings tab open, send `get-local-styles` request. On `local-styles` response, populate dropdowns. On dropdown change, update `styleBindings` in settings and send `update-settings`.

- [ ] **Step 11: Run tests, verify all pass**

---

## Chunk 3: Definition Lists (Feature #8)

### Task 7: Parser — Custom Marked Extension

- [ ] **Step 1: Write failing tests for definition list parsing**

In `parser.test.ts`:

```typescript
describe('definition lists', () => {
    it('should parse a simple definition list', () => {
        const md = 'Term\n: Definition text here';
        const blocks = parseMarkdownToBlocks(md);
        expect(blocks).toHaveLength(1);
        expect(blocks[0].type).toBe('definitionList');
        expect(blocks[0].definitions).toEqual([
            { term: 'Term', definitions: ['Definition text here'] }
        ]);
    });

    it('should parse multiple definitions for one term', () => {
        const md = 'Term\n: First definition\n: Second definition';
        const blocks = parseMarkdownToBlocks(md);
        expect(blocks[0].definitions).toEqual([
            { term: 'Term', definitions: ['First definition', 'Second definition'] }
        ]);
    });

    it('should parse multiple term-definition pairs', () => {
        const md = 'Term A\n: Def A\n\nTerm B\n: Def B';
        const blocks = parseMarkdownToBlocks(md);
        expect(blocks[0].type).toBe('definitionList');
        expect(blocks[0].definitions).toHaveLength(2);
    });

    it('should not interfere with regular paragraphs', () => {
        const md = 'Just a paragraph\n\nAnother paragraph';
        const blocks = parseMarkdownToBlocks(md);
        expect(blocks.every(b => b.type === 'paragraph')).toBe(true);
    });
});
```

- [ ] **Step 2: Add definitionList to Block type union**

In `parser.ts`, extend the `Block` interface:

```typescript
type: '...' | 'definitionList';
// Definition list-specific
definitions?: Array<{ term: string; definitions: string[] }>;
```

- [ ] **Step 3: Register custom marked extension for definition lists**

In `parser.ts`, use `marked.use({ extensions: [...] })` with a block-level tokenizer:

```typescript
{
    name: 'definitionList',
    level: 'block',
    start(src: string) { return src.match(/^[^\n]+\n(?=: )/)?.index; },
    tokenizer(src: string) {
        const match = src.match(/^([^\n]+)\n(?:: ([^\n]+)\n?)+/);
        if (match) {
            // Parse term and definitions
            // Return token with type 'definitionList'
        }
    },
    renderer(token: any) { return ''; } // Not used (we use Block[], not HTML)
}
```

- [ ] **Step 4: Handle definitionList tokens in parseMarkdownToBlocks**

When encountering a `definitionList` token from the custom extension, emit a `definitionList` block with the parsed term-definition pairs.

- [ ] **Step 5: Run tests, verify all pass**

### Task 8: Renderer — Definition List Block

- [ ] **Step 6: Write failing tests for definition list rendering**

In `renderer.test.ts`:

```typescript
describe('definition list rendering', () => {
    it('should render term in bold and definition indented', async () => {
        const block: Block = {
            type: 'definitionList',
            definitions: [
                { term: 'API', definitions: ['Application Programming Interface'] }
            ]
        };
        const result = await renderBlocks('Test', [block], DEFAULT_SETTINGS);
        // Verify frame contains term and definition text nodes
        expect(result.frame.children.length).toBeGreaterThan(0);
    });
});
```

- [ ] **Step 7: Implement renderDefinitionListBlock in blockRenderers.ts**

```typescript
export async function renderDefinitionListBlock(block: Block, settings: PluginSettings): Promise<FrameNode> {
    const dlFrame = figma.createFrame();
    dlFrame.layoutMode = 'VERTICAL';
    dlFrame.primaryAxisSizingMode = 'AUTO';
    dlFrame.counterAxisSizingMode = 'FIXED';
    dlFrame.resize(resolvedFrameWidth(settings), 10);
    dlFrame.fills = [];
    dlFrame.itemSpacing = settings.blockSpacing;

    for (const item of block.definitions ?? []) {
        // Term: bold text node
        const termNode = figma.createText();
        await loadFont('Inter', 'Bold');
        termNode.fontName = { family: 'Inter', style: 'Bold' };
        termNode.characters = item.term;
        dlFrame.appendChild(termNode);

        // Definitions: indented body text
        for (const def of item.definitions) {
            const defFrame = figma.createFrame();
            defFrame.layoutMode = 'HORIZONTAL';
            defFrame.paddingLeft = 20;
            defFrame.fills = [];
            const defNode = figma.createText();
            await loadFont('Inter', 'Regular');
            defNode.characters = def;
            defFrame.appendChild(defNode);
            dlFrame.appendChild(defFrame);
        }
    }
    return dlFrame;
}
```

- [ ] **Step 8: Add dispatch case in renderer.ts renderBlock**

- [ ] **Step 9: Run tests, verify all pass**

---

## Chunk 4: Selective Block Import (Feature #18)

### Task 9: Preview Checkboxes in UI

- [ ] **Step 1: Add per-block checkboxes to preview rendering**

In `ui.ts`, modify the preview rendering to wrap each block preview element in a row with a checkbox:

```typescript
function renderPreviewBlock(block, index) {
    const row = document.createElement('div');
    row.className = 'preview-block-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.dataset.blockIndex = String(index);
    checkbox.className = 'preview-block-checkbox';

    const label = document.createElement('span');
    label.className = 'preview-block-label';
    label.textContent = blockLabel(block); // e.g. "Heading: Introduction"

    row.appendChild(checkbox);
    row.appendChild(label);
    // ... existing preview content
    return row;
}
```

- [ ] **Step 2: Add Select All / Deselect All controls**

In `ui.html`, add controls above the preview content:

```html
<div class="preview-select-controls">
    <button id="select-all-btn" class="btn-link">Select All</button>
    <button id="deselect-all-btn" class="btn-link">Deselect All</button>
</div>
```

- [ ] **Step 3: Filter blocks on import**

In `ui.ts`, when the user clicks "Import to Canvas", filter the blocks array to only include checked blocks before sending to the sandbox:

```typescript
const checkedIndices = new Set(
    Array.from(document.querySelectorAll('.preview-block-checkbox:checked'))
        .map(cb => Number((cb as HTMLInputElement).dataset.blockIndex))
);
const filteredBlocks = blocks.filter((_, i) => checkedIndices.has(i));
```

- [ ] **Step 4: Add CSS for block selection UI**

Style the checkbox rows, select all/deselect all controls, and hover states.

- [ ] **Step 5: Manual test with preview pane, verify selective import works**

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Custom `marked` extension for definition lists conflicts with existing parsing | Medium | Register extension at module load; test with mixed content documents |
| Style binding to deleted styles causes runtime errors | Medium | `getStyleByIdAsync` returns null for deleted styles; fallback to auto-create |
| Theme switching overwrites user-customized settings | Low | Track `theme: 'custom'` state; warn in UI before overwriting |
| Selective import breaks TOC or list numbering | Low | TOC and list indices are computed from the full block array before filtering |

---

## Success Criteria

1. All existing tests continue to pass (no regressions)
2. Theme presets visually change the output frame (fill color, spacing, code bg)
3. Style bindings map to existing Figma local styles when configured
4. Definition lists parse and render with bold terms and indented definitions
5. Selective import allows unchecking blocks in preview before import
6. Each chunk can be shipped independently
