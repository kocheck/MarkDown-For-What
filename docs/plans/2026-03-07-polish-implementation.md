# MarkDown For What — Polish & Release Prep Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Polish the plugin to release quality — modular architecture, clean UI with settings, fixed output rendering, and robust error handling with test coverage.

**Architecture:** Break the monolithic `code.ts` into focused deep modules (`parser.ts`, `styles.ts`, `tables.ts`, `settings.ts`, `renderer.ts`). Each module owns one concern and exposes a minimal public API. The plugin entry point (`code.ts`) becomes a thin message handler only.

**Tech Stack:** TypeScript, Figma Plugin API, marked (markdown parser), webpack (build), Jest + ts-jest (tests), Figma `clientStorage` (settings persistence)

---

## Working Directory

All commands run from: `figma-markdown-sync/`

```bash
cd /Users/kocheck/Documents/GitHub/MarkDown-For-What/figma-markdown-sync
```

Build: `npm run build`
Test: `npm test`
Test with coverage: `npm run test:coverage`

---

## Task 1: Remove FigJam Support

**Files:**
- Modify: `figma-markdown-sync/code.ts`
- Modify: `figma-markdown-sync/manifest.json`

**Step 1: Update manifest.json to Figma-only**

In `manifest.json`, change:
```json
"editorType": ["figma", "figjam"]
```
To:
```json
"editorType": ["figma"]
```

**Step 2: Remove FigJam code from code.ts**

Delete the following functions entirely from `code.ts`:
- `isFigJam()` (lines ~579–581)
- `createMarkdownInFigJam()` (lines ~587–774)

Also remove the routing call inside `createMarkdownFrame`. Change:
```ts
// Route to appropriate renderer based on editor type
if (isFigJam()) {
    return await createMarkdownInFigJam(name, blocks);
}

// Continue with Figma rendering below
```
To: _(delete those lines entirely — just let Figma rendering continue)_

**Step 3: Run build to confirm no errors**

```bash
npm run build
```
Expected: build completes with no TypeScript errors.

**Step 4: Run tests**

```bash
npm test
```
Expected: all existing tests pass.

**Step 5: Commit**

```bash
git add code.ts manifest.json
git commit -m "feat: remove FigJam support, limit plugin to Figma only"
```

---

## Task 2: Create `parser.ts` Module

> This is the first step of the deep-module refactor. We move all Markdown parsing logic into its own module, then update tests to import from it.

**Files:**
- Create: `figma-markdown-sync/parser.ts`
- Modify: `figma-markdown-sync/code.test.ts` (update imports)
- Modify: `figma-markdown-sync/code.ts` (remove extracted code, add import)

**Step 1: Write the test import update first (TDD — tests will fail until module exists)**

At the top of `code.test.ts`, replace:
```ts
const {
    extractImagesFromTokens,
    parseMarkdownToBlocks,
    flattenTokens
} = require('./code.ts');
```
With:
```ts
const {
    extractImagesFromTokens,
    parseMarkdownToBlocks,
    flattenTokens
} = require('./parser');
```

Also remove the `Block` interface re-declaration from `code.test.ts` and instead import it:
```ts
import type { Block } from './parser';
```

**Step 2: Run tests to confirm they fail**

```bash
npm test
```
Expected: FAIL — `Cannot find module './parser'`

**Step 3: Create `parser.ts`**

Create `figma-markdown-sync/parser.ts` with this content:

```ts
/**
 * parser.ts
 *
 * Converts raw Markdown text into a structured array of Blocks.
 *
 * This is the ONLY module that imports or uses `marked` directly.
 * All other modules receive pre-parsed Block objects — they should never
 * need to understand Markdown syntax themselves.
 *
 * Public API:
 *   parseMarkdownToBlocks(markdown)  →  Block[]
 *   extractImagesFromTokens(tokens)  →  { textTokens, images }
 *   flattenTokens(tokens, context)   →  StyledSegment[]
 */

import { marked } from 'marked';

// ─── Interfaces ────────────────────────────────────────────────────────────────

/**
 * A single renderable unit of content extracted from Markdown.
 * Each block maps to one visual element in the Figma frame.
 */
export interface Block {
    type: 'heading' | 'paragraph' | 'list' | 'code' | 'quote' | 'separator' | 'table' | 'image';
    content?: string;     // Plain text content for text-based blocks
    level?: number;       // Heading depth: 1, 2, or 3
    language?: string;    // Code language hint (e.g. 'javascript')
    tokens?: marked.Token[]; // Inline tokens for rich-text rendering
    // Table-specific
    header?: marked.Tokens.TableCell[];
    align?: ('left' | 'center' | 'right' | null)[];
    rows?: marked.Tokens.TableCell[][];
    // Image-specific
    imageUrl?: string;
    imageAlt?: string;
}

/**
 * A run of text with optional inline formatting applied.
 * Multiple segments are combined to build a single TextNode with mixed styles.
 */
export interface StyledSegment {
    text: string;
    bold?: boolean;
    italic?: boolean;
    code?: boolean;
}

// ─── Internal Helpers ──────────────────────────────────────────────────────────

/**
 * Separates image tokens from non-image tokens in an inline token array.
 * Used to split inline images out of paragraphs into their own Block entries.
 *
 * @param tokens - Array of inline marked tokens from a paragraph
 * @returns Object with `textTokens` (non-image) and `images` (image tokens)
 *
 * @example
 * const { textTokens, images } = extractImagesFromTokens(paragraph.tokens);
 * // images → [{ type: 'image', href: 'https://...', text: 'alt' }]
 */
export function extractImagesFromTokens(tokens: marked.Token[]): {
    textTokens: marked.Token[];
    images: marked.Tokens.Image[];
} {
    const textTokens: marked.Token[] = [];
    const images: marked.Tokens.Image[] = [];

    for (const token of tokens) {
        if (token.type === 'image') {
            images.push(token as marked.Tokens.Image);
        } else {
            textTokens.push(token);
        }
    }

    return { textTokens, images };
}

/**
 * Recursively flattens a tree of inline marked tokens into a flat array of
 * StyledSegments. Each segment carries the accumulated formatting from its
 * ancestor tokens (bold, italic, code).
 *
 * @param tokens  - Inline token array (from a paragraph, heading, list item, etc.)
 * @param context - Inherited formatting state from parent tokens
 * @returns Flat array of styled text segments
 *
 * @example
 * const segments = flattenTokens(heading.tokens, { bold: false, italic: false, code: false });
 * // → [{ text: 'Hello ', bold: false }, { text: 'World', bold: true }]
 */
export function flattenTokens(
    tokens: marked.Token[],
    context: { bold: boolean; italic: boolean; code: boolean }
): StyledSegment[] {
    let segments: StyledSegment[] = [];

    if (!tokens) return segments;

    for (const token of tokens) {
        switch (token.type) {
            case 'strong':
                segments = segments.concat(
                    flattenTokens((token as marked.Tokens.Strong).tokens, { ...context, bold: true })
                );
                break;
            case 'em':
                segments = segments.concat(
                    flattenTokens((token as marked.Tokens.Em).tokens, { ...context, italic: true })
                );
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
                // Links render as plain text — URL is not shown in the Figma output
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

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Converts a raw Markdown string into an ordered array of Block objects.
 *
 * YAML front matter (--- ... ---) is stripped before parsing.
 * Each token from the marked lexer is mapped to a typed Block.
 * Inline images inside paragraphs are extracted into their own image Blocks.
 *
 * @param markdown - Raw Markdown string, may include YAML front matter
 * @returns Ordered array of Blocks ready to pass to renderer.ts
 *
 * @example
 * const blocks = parseMarkdownToBlocks('# Hello\n\nSome paragraph');
 * // → [{ type: 'heading', level: 1, content: 'Hello' }, { type: 'paragraph', ... }]
 */
export function parseMarkdownToBlocks(markdown: string): Block[] {
    const frontMatterRegex = /^---[\s\S]*?---\n/;
    const cleanMarkdown = markdown.replace(frontMatterRegex, '');

    const tokens = marked.lexer(cleanMarkdown);
    const blocks: Block[] = [];

    for (const token of tokens) {
        switch (token.type) {
            case 'heading': {
                const hToken = token as marked.Tokens.Heading;
                blocks.push({
                    type: 'heading',
                    content: hToken.text,
                    level: hToken.depth,
                    tokens: hToken.tokens,
                });
                break;
            }
            case 'paragraph': {
                const pToken = token as marked.Tokens.Paragraph;

                if (pToken.tokens) {
                    const { textTokens, images } = extractImagesFromTokens(pToken.tokens);

                    if (textTokens.length > 0) {
                        const textContent = textTokens
                            .map(t => {
                                if ('text' in t) return (t as any).text;
                                if ('raw' in t) return (t as any).raw;
                                return '';
                            })
                            .join('');

                        if (textContent.trim()) {
                            blocks.push({ type: 'paragraph', content: textContent, tokens: textTokens });
                        }
                    }

                    images.forEach(imgToken => {
                        blocks.push({
                            type: 'image',
                            imageUrl: imgToken.href,
                            imageAlt: imgToken.text || imgToken.title || 'Image',
                        });
                    });

                    if (textTokens.length === 0 && images.length === 0) {
                        blocks.push({ type: 'paragraph', content: pToken.text, tokens: pToken.tokens });
                    }
                } else {
                    blocks.push({ type: 'paragraph', content: pToken.text, tokens: pToken.tokens });
                }
                break;
            }
            case 'code': {
                const cToken = token as marked.Tokens.Code;
                blocks.push({ type: 'code', content: cToken.text, language: cToken.lang || undefined });
                break;
            }
            case 'blockquote': {
                const bToken = token as marked.Tokens.Blockquote;
                blocks.push({ type: 'quote', content: bToken.text });
                break;
            }
            case 'list': {
                const listToken = token as marked.Tokens.List;
                listToken.items.forEach(item => {
                    blocks.push({ type: 'list', content: item.text, tokens: item.tokens });
                });
                break;
            }
            case 'table': {
                const tableToken = token as marked.Tokens.Table;
                blocks.push({
                    type: 'table',
                    header: tableToken.header,
                    align: tableToken.align,
                    rows: tableToken.rows,
                });
                break;
            }
            case 'hr':
                blocks.push({ type: 'separator' });
                break;
        }
    }
    return blocks;
}

// CommonJS export shim — allows Jest (require()) and webpack (import) to both work
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseMarkdownToBlocks, extractImagesFromTokens, flattenTokens };
}
```

**Step 4: Run tests to confirm they pass**

```bash
npm test
```
Expected: all existing tests PASS.

**Step 5: Remove extracted code from `code.ts`**

From `code.ts`:
- Delete the `Block` interface
- Delete the `StyledSegment` interface
- Delete `extractImagesFromTokens()`
- Delete `parseMarkdownToBlocks()`
- Delete `flattenTokens()`
- Delete the front-matter regex (now inside parser.ts)

Add at the top of `code.ts` (after removing `import { marked } from 'marked'`):
```ts
import { parseMarkdownToBlocks } from './parser';
import type { Block } from './parser';
```

**Step 6: Run build and tests**

```bash
npm run build && npm test
```
Expected: clean build, all tests pass.

**Step 7: Commit**

```bash
git add code.ts code.test.ts parser.ts
git commit -m "refactor: extract parser.ts module with JSDoc"
```

---

## Task 3: Create `settings.ts` Module

> Settings are the foundation for the renderer refactor. Create this module first so renderer.ts can depend on it.

**Files:**
- Create: `figma-markdown-sync/settings.ts`
- Create: `figma-markdown-sync/settings.test.ts`

**Step 1: Write failing tests first**

Create `figma-markdown-sync/settings.test.ts`:

```ts
/**
 * Unit tests for settings.ts
 * Tests default values, validation, and mergeWithDefaults behavior.
 */

import {
    DEFAULT_SETTINGS,
    validateSettings,
    mergeWithDefaults,
    PluginSettings,
} from './settings';

describe('DEFAULT_SETTINGS', () => {
    test('has all required keys', () => {
        expect(DEFAULT_SETTINGS).toHaveProperty('blockSpacing');
        expect(DEFAULT_SETTINGS).toHaveProperty('listSpacing');
        expect(DEFAULT_SETTINGS).toHaveProperty('framePadding');
        expect(DEFAULT_SETTINGS).toHaveProperty('frameWidth');
        expect(DEFAULT_SETTINGS).toHaveProperty('codeBackground');
        expect(DEFAULT_SETTINGS).toHaveProperty('tableHeaderBackground');
        expect(DEFAULT_SETTINGS).toHaveProperty('separatorColor');
    });

    test('has sensible default values', () => {
        expect(DEFAULT_SETTINGS.blockSpacing).toBe(16);
        expect(DEFAULT_SETTINGS.listSpacing).toBe(6);
        expect(DEFAULT_SETTINGS.framePadding).toBe(40);
        expect(DEFAULT_SETTINGS.frameWidth).toBe(800);
        expect(DEFAULT_SETTINGS.codeBackground).toBe('#F2F2F2');
        expect(DEFAULT_SETTINGS.tableHeaderBackground).toBe('#F2F2F7');
        expect(DEFAULT_SETTINGS.separatorColor).toBe('#CCCCCC');
    });
});

describe('validateSettings', () => {
    test('returns true for valid settings', () => {
        expect(validateSettings(DEFAULT_SETTINGS)).toBe(true);
    });

    test('returns false when a numeric field is not a number', () => {
        const bad = { ...DEFAULT_SETTINGS, blockSpacing: 'not-a-number' };
        expect(validateSettings(bad as any)).toBe(false);
    });

    test('returns false when a numeric field is negative', () => {
        const bad = { ...DEFAULT_SETTINGS, frameWidth: -1 };
        expect(validateSettings(bad)).toBe(false);
    });

    test('returns false when a color field is not a valid hex string', () => {
        const bad = { ...DEFAULT_SETTINGS, codeBackground: 'red' };
        expect(validateSettings(bad)).toBe(false);
    });

    test('returns false when settings object is null', () => {
        expect(validateSettings(null as any)).toBe(false);
    });

    test('returns false when a required key is missing', () => {
        const { blockSpacing, ...partial } = DEFAULT_SETTINGS;
        expect(validateSettings(partial as any)).toBe(false);
    });
});

describe('mergeWithDefaults', () => {
    test('returns defaults when given null', () => {
        const result = mergeWithDefaults(null);
        expect(result).toEqual(DEFAULT_SETTINGS);
    });

    test('fills in missing keys from defaults', () => {
        const partial = { blockSpacing: 24 };
        const result = mergeWithDefaults(partial as any);
        expect(result.blockSpacing).toBe(24);
        expect(result.listSpacing).toBe(DEFAULT_SETTINGS.listSpacing);
        expect(result.frameWidth).toBe(DEFAULT_SETTINGS.frameWidth);
    });

    test('replaces invalid values with defaults', () => {
        const invalid = { ...DEFAULT_SETTINGS, frameWidth: -100, codeBackground: 'notahex' };
        const result = mergeWithDefaults(invalid);
        expect(result.frameWidth).toBe(DEFAULT_SETTINGS.frameWidth);
        expect(result.codeBackground).toBe(DEFAULT_SETTINGS.codeBackground);
    });

    test('preserves all valid custom values', () => {
        const custom: PluginSettings = {
            blockSpacing: 20,
            listSpacing: 8,
            framePadding: 32,
            frameWidth: 960,
            codeBackground: '#EEEEEE',
            tableHeaderBackground: '#E8F0FE',
            separatorColor: '#AAAAAA',
        };
        const result = mergeWithDefaults(custom);
        expect(result).toEqual(custom);
    });
});
```

**Step 2: Run tests to confirm they fail**

```bash
npm test settings.test.ts
```
Expected: FAIL — `Cannot find module './settings'`

**Step 3: Create `settings.ts`**

Create `figma-markdown-sync/settings.ts`:

```ts
/**
 * settings.ts
 *
 * Manages plugin settings — their shape, default values, validation, and
 * persistence via Figma's clientStorage API.
 *
 * This module does NOT render anything. It only defines and manages data.
 *
 * Public API:
 *   DEFAULT_SETTINGS          — the baseline values used on first run
 *   validateSettings(obj)     — returns true if obj is a well-formed PluginSettings
 *   mergeWithDefaults(obj)    — fills missing/invalid fields with defaults
 *   loadSettings()            — async: reads from clientStorage, merges with defaults
 *   saveSettings(settings)    — async: writes to clientStorage
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

/**
 * All configurable plugin settings.
 * Numeric values are in pixels. Color values are CSS hex strings (e.g. '#F2F2F2').
 */
export interface PluginSettings {
    /** Vertical spacing between content blocks (heading, paragraph, etc.) in px */
    blockSpacing: number;
    /** Vertical spacing between consecutive list items in px (tighter than blockSpacing) */
    listSpacing: number;
    /** Inner padding on all sides of the root content frame in px */
    framePadding: number;
    /** Fixed width of the root content frame in px */
    frameWidth: number;
    /** Fill color for code block backgrounds. CSS hex string. */
    codeBackground: string;
    /** Fill color for the header row of rendered tables. CSS hex string. */
    tableHeaderBackground: string;
    /** Color of horizontal separator lines. CSS hex string. */
    separatorColor: string;
}

// ─── Defaults ──────────────────────────────────────────────────────────────────

/**
 * The baseline settings applied on first run or when stored values are missing/invalid.
 */
export const DEFAULT_SETTINGS: PluginSettings = {
    blockSpacing: 16,
    listSpacing: 6,
    framePadding: 40,
    frameWidth: 800,
    codeBackground: '#F2F2F2',
    tableHeaderBackground: '#F2F2F7',
    separatorColor: '#CCCCCC',
};

const STORAGE_KEY = 'pluginSettings';

// ─── Validation Helpers ────────────────────────────────────────────────────────

/** Returns true if value is a finite, non-negative number. */
function isValidNumber(value: unknown): boolean {
    return typeof value === 'number' && isFinite(value) && value >= 0;
}

/** Returns true if value is a valid 6-digit CSS hex color string (e.g. '#AABBCC'). */
function isValidHex(value: unknown): boolean {
    return typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value);
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Validates that obj is a complete, well-formed PluginSettings object.
 * Returns false if any field is missing, the wrong type, or out of range.
 *
 * @param obj - The object to validate (typically loaded from clientStorage)
 * @returns true if all fields are present and valid
 */
export function validateSettings(obj: unknown): obj is PluginSettings {
    if (!obj || typeof obj !== 'object') return false;
    const s = obj as Record<string, unknown>;

    return (
        isValidNumber(s.blockSpacing) &&
        isValidNumber(s.listSpacing) &&
        isValidNumber(s.framePadding) &&
        isValidNumber(s.frameWidth) &&
        isValidHex(s.codeBackground) &&
        isValidHex(s.tableHeaderBackground) &&
        isValidHex(s.separatorColor)
    );
}

/**
 * Merges a (possibly partial or invalid) settings object with the defaults.
 * Individual fields that are missing or invalid are replaced with their default value.
 * Valid custom values are preserved as-is.
 *
 * Use this after loading from clientStorage to get a guaranteed-valid settings object.
 *
 * @param partial - Raw object from storage (may be null, partial, or have invalid fields)
 * @returns A complete, valid PluginSettings object
 *
 * @example
 * const raw = await figma.clientStorage.getAsync('pluginSettings');
 * const settings = mergeWithDefaults(raw);
 */
export function mergeWithDefaults(partial: unknown): PluginSettings {
    if (!partial || typeof partial !== 'object') return { ...DEFAULT_SETTINGS };

    const p = partial as Record<string, unknown>;
    return {
        blockSpacing:          isValidNumber(p.blockSpacing)          ? (p.blockSpacing as number)          : DEFAULT_SETTINGS.blockSpacing,
        listSpacing:           isValidNumber(p.listSpacing)           ? (p.listSpacing as number)           : DEFAULT_SETTINGS.listSpacing,
        framePadding:          isValidNumber(p.framePadding)          ? (p.framePadding as number)          : DEFAULT_SETTINGS.framePadding,
        frameWidth:            isValidNumber(p.frameWidth)            ? (p.frameWidth as number)            : DEFAULT_SETTINGS.frameWidth,
        codeBackground:        isValidHex(p.codeBackground)           ? (p.codeBackground as string)        : DEFAULT_SETTINGS.codeBackground,
        tableHeaderBackground: isValidHex(p.tableHeaderBackground)    ? (p.tableHeaderBackground as string) : DEFAULT_SETTINGS.tableHeaderBackground,
        separatorColor:        isValidHex(p.separatorColor)           ? (p.separatorColor as string)        : DEFAULT_SETTINGS.separatorColor,
    };
}

/**
 * Loads settings from Figma's clientStorage and merges them with defaults.
 * Always returns a complete, valid PluginSettings object — never throws.
 *
 * @returns Promise resolving to the current plugin settings
 */
export async function loadSettings(): Promise<PluginSettings> {
    try {
        const raw = await figma.clientStorage.getAsync(STORAGE_KEY);
        return mergeWithDefaults(raw);
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

/**
 * Persists the given settings to Figma's clientStorage.
 * Silently skips saving if the settings object fails validation.
 *
 * @param settings - The settings object to persist
 */
export async function saveSettings(settings: PluginSettings): Promise<void> {
    if (!validateSettings(settings)) return;
    await figma.clientStorage.setAsync(STORAGE_KEY, settings);
}
```

**Step 4: Run tests to confirm they pass**

```bash
npm test settings.test.ts
```
Expected: all tests PASS.

**Step 5: Commit**

```bash
git add settings.ts settings.test.ts
git commit -m "feat: add settings.ts module with validation and clientStorage persistence"
```

---

## Task 4: Create `styles.ts` Module

**Files:**
- Create: `figma-markdown-sync/styles.ts`
- Create: `figma-markdown-sync/styles.test.ts`
- Modify: `figma-markdown-sync/code.ts`

**Step 1: Write `styles.test.ts` first**

```ts
/**
 * Unit tests for styles.ts
 * Key invariant: existing Figma text styles are NEVER overwritten on re-import.
 */

import { getOrCreateTextStyle, STYLE_NAMES, DEFAULT_STYLES } from './styles';

describe('getOrCreateTextStyle', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('returns existing style without modifying it', async () => {
        const existingStyle = {
            id: 'existing-id',
            name: STYLE_NAMES.H1,
            fontName: { family: 'Custom Font', style: 'Black' },
            fontSize: 48,
        };

        (figma.getLocalTextStyles as jest.Mock).mockReturnValue([existingStyle]);

        const result = await getOrCreateTextStyle(STYLE_NAMES.H1, DEFAULT_STYLES[STYLE_NAMES.H1]);

        expect(result).toBe(existingStyle);
        // createTextStyle must NOT have been called — we never overwrite existing styles
        expect(figma.createTextStyle).not.toHaveBeenCalled();
        // Designer's custom values must be untouched
        expect(existingStyle.fontName).toEqual({ family: 'Custom Font', style: 'Black' });
        expect(existingStyle.fontSize).toBe(48);
    });

    test('creates a new style when none exists', async () => {
        (figma.getLocalTextStyles as jest.Mock).mockReturnValue([]);

        const mockStyle: any = { name: '', fontName: {}, fontSize: 0, lineHeight: {} };
        (figma.createTextStyle as jest.Mock).mockReturnValue(mockStyle);
        (figma.loadFontAsync as jest.Mock).mockResolvedValue(undefined);

        await getOrCreateTextStyle(STYLE_NAMES.BODY, DEFAULT_STYLES[STYLE_NAMES.BODY]);

        expect(figma.createTextStyle).toHaveBeenCalledTimes(1);
        expect(mockStyle.name).toBe(STYLE_NAMES.BODY);
        expect(mockStyle.fontSize).toBe(DEFAULT_STYLES[STYLE_NAMES.BODY].size);
    });
});
```

**Step 2: Run test to confirm it fails**

```bash
npm test styles.test.ts
```
Expected: FAIL — `Cannot find module './styles'`

**Step 3: Create `styles.ts`**

```ts
/**
 * styles.ts
 *
 * Manages Figma text styles and inline rich-text rendering.
 *
 * Responsibilities:
 *   - Defining default typography config for each Markdown element type
 *   - Creating local Figma text styles on first import
 *   - Applying inline bold/italic/code formatting to TextNode character ranges
 *
 * IMPORTANT: Existing text styles (e.g. Markdown/H1) are NEVER overwritten.
 * Designers can customize styles in Figma and those changes survive re-imports.
 *
 * Public API:
 *   STYLE_NAMES                              — canonical style name constants
 *   DEFAULT_STYLES                           — default font config per style
 *   loadFont(family, style)                  — async: loads font with fallback
 *   getOrCreateTextStyle(name, config)       — async: gets or creates a text style
 *   initializeStyles()                       — async: ensures all styles exist
 *   applyInlineStyles(node, tokens, base)    — async: applies mixed formatting
 */

import { marked } from 'marked';
import { flattenTokens } from './parser';

// ─── Style Name Constants ──────────────────────────────────────────────────────

/**
 * Canonical Figma text style names used by this plugin.
 * These appear in the "Local Styles" panel under the "Markdown/" group.
 */
export const STYLE_NAMES = {
    H1:    'Markdown/H1',
    H2:    'Markdown/H2',
    H3:    'Markdown/H3',
    BODY:  'Markdown/Body',
    CODE:  'Markdown/Code',
    LIST:  'Markdown/List',
    QUOTE: 'Markdown/Quote',
} as const;

// ─── Style Configuration ───────────────────────────────────────────────────────

/** Configuration needed to create a Figma text style for the first time. */
export interface StyleConfig {
    family: string;
    style: string;
    size: number;
    /** Line height multiplier, e.g. 1.5 = 150% */
    lineHeight: number;
}

/**
 * Default typography values for each Markdown style.
 * Applied ONLY when creating a style that does not yet exist in the document.
 * If a style already exists, these values are ignored.
 */
export const DEFAULT_STYLES: Record<string, StyleConfig> = {
    [STYLE_NAMES.H1]:    { family: 'Inter', style: 'Bold',    size: 32, lineHeight: 1.2 },
    [STYLE_NAMES.H2]:    { family: 'Inter', style: 'Bold',    size: 24, lineHeight: 1.3 },
    [STYLE_NAMES.H3]:    { family: 'Inter', style: 'Bold',    size: 20, lineHeight: 1.4 },
    [STYLE_NAMES.BODY]:  { family: 'Inter', style: 'Regular', size: 16, lineHeight: 1.5 },
    [STYLE_NAMES.CODE]:  { family: 'Roboto Mono', style: 'Regular', size: 14, lineHeight: 1.4 },
    [STYLE_NAMES.LIST]:  { family: 'Inter', style: 'Regular', size: 16, lineHeight: 1.5 },
    [STYLE_NAMES.QUOTE]: { family: 'Inter', style: 'Italic',  size: 16, lineHeight: 1.5 },
};

// ─── Font Loading ──────────────────────────────────────────────────────────────

/**
 * Loads a font by family and style, falling back to Inter Regular if not found.
 * Figma requires fonts to be loaded before they can be set on text nodes.
 *
 * @param family - Font family name (e.g. 'Inter', 'Roboto Mono')
 * @param style  - Font style (e.g. 'Regular', 'Bold', 'Italic')
 * @returns The loaded FontName — may differ from input if fallback was used
 */
export async function loadFont(family: string, style: string): Promise<FontName> {
    const font: FontName = { family, style };
    try {
        await figma.loadFontAsync(font);
        return font;
    } catch {
        console.warn(`Font not found: ${family} ${style}, falling back to Inter Regular`);
        const fallback: FontName = { family: 'Inter', style: 'Regular' };
        await figma.loadFontAsync(fallback);
        return fallback;
    }
}

// ─── Style Management ──────────────────────────────────────────────────────────

/**
 * Returns an existing Figma text style by name, or creates a new one with the
 * given config if it doesn't exist yet.
 *
 * IMPORTANT: If the style already exists, its properties are NOT modified.
 * This preserves any customizations the designer has made in Figma.
 *
 * @param name   - The style name to look up (e.g. 'Markdown/H1')
 * @param config - Font config used ONLY when creating a new style
 * @returns The existing or newly created TextStyle
 */
export async function getOrCreateTextStyle(name: string, config: StyleConfig): Promise<TextStyle> {
    const existing = figma.getLocalTextStyles().find(s => s.name === name);

    if (existing) {
        return existing; // Do not modify — preserves designer customizations
    }

    await loadFont(config.family, config.style);
    const newStyle = figma.createTextStyle();
    newStyle.name = name;
    newStyle.fontName = { family: config.family, style: config.style };
    newStyle.fontSize = config.size;
    newStyle.lineHeight = { value: config.lineHeight * 100, unit: 'PERCENT' };
    return newStyle;
}

/**
 * Ensures all Markdown/* text styles exist in the document.
 * Creates any that are missing using DEFAULT_STYLES values.
 * Call once at the start of an import before rendering any blocks.
 */
export async function initializeStyles(): Promise<void> {
    await Promise.all(
        Object.keys(DEFAULT_STYLES).map(name => getOrCreateTextStyle(name, DEFAULT_STYLES[name]))
    );
}

// ─── Inline Style Rendering ───────────────────────────────────────────────────

/**
 * Applies inline bold/italic/code formatting to a TextNode by setting font
 * overrides on individual character ranges.
 *
 * Call AFTER setting node.textStyleId. This function sets node.characters
 * and overrides font names at specific character ranges.
 *
 * @param node          - The Figma TextNode to format
 * @param tokens        - Inline marked tokens describing the rich text
 * @param baseStyleName - Which STYLE_NAMES key applies (affects bold inheritance for headings)
 */
export async function applyInlineStyles(
    node: TextNode,
    tokens: marked.Token[] | undefined,
    baseStyleName: string
): Promise<void> {
    if (!tokens || tokens.length === 0) return;

    const segments = flattenTokens(tokens, { bold: false, italic: false, code: false });
    const fullText = segments.map(s => s.text).join('');
    node.characters = fullText;

    const baseConfig = DEFAULT_STYLES[baseStyleName];
    const [regularFont, boldFont, italicFont, boldItalicFont, codeFont] = await Promise.all([
        loadFont(baseConfig.family, 'Regular'),
        loadFont(baseConfig.family, 'Bold'),
        loadFont(baseConfig.family, 'Italic'),
        loadFont(baseConfig.family, 'Bold Italic'),
        loadFont('Roboto Mono', 'Regular'),
    ]);

    const isBaseBold = baseConfig.style.includes('Bold');
    let currentIndex = 0;

    for (const segment of segments) {
        const start = currentIndex;
        const end = currentIndex + segment.text.length;

        if (end > start) {
            let font: FontName;
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
        }
        currentIndex = end;
    }
}
```

**Step 4: Run test to confirm it passes**

```bash
npm test styles.test.ts
```
Expected: PASS.

**Step 5: Remove extracted code from `code.ts`, add import**

From `code.ts`, delete: `STYLE_NAMES`, `StyleConfig`, `DEFAULT_STYLES`, `loadFont()`, `getOrCreateTextStyle()`, `applyInlineStyles()`.

Add at top of `code.ts`:
```ts
import { STYLE_NAMES, DEFAULT_STYLES, loadFont, getOrCreateTextStyle, applyInlineStyles, initializeStyles } from './styles';
import type { StyleConfig } from './styles';
```

Replace the `Promise.all` font preload in the message handler:
```ts
await initializeStyles();
```

**Step 6: Build and test**

```bash
npm run build && npm test
```
Expected: clean build, all tests pass.

**Step 7: Commit**

```bash
git add styles.ts styles.test.ts code.ts
git commit -m "refactor: extract styles.ts, preserve existing Figma styles on re-import"
```

---

## Task 5: Create `tables.ts` Module

**Files:**
- Create: `figma-markdown-sync/tables.ts`
- Modify: `figma-markdown-sync/code.ts`

**Step 1: Create `tables.ts`**

```ts
/**
 * tables.ts
 *
 * Creates Figma Auto Layout frames representing Markdown tables.
 *
 * Table rendering is isolated here because it involves nested frame structures,
 * per-cell text alignment, and border simulation via individual stroke weights —
 * complexity that would clutter renderer.ts.
 *
 * Column width behavior: each cell uses layoutGrow=1 inside a FIXED-width parent
 * row frame. This makes all columns fill available space equally in Figma's
 * auto-layout system, avoiding the "squished columns" problem.
 *
 * Public API:
 *   createTableFrame(block, settings) — async: returns a FrameNode
 */

import type { Block } from './parser';
import type { PluginSettings } from './settings';
import { getOrCreateTextStyle, loadFont, STYLE_NAMES, DEFAULT_STYLES } from './styles';

/**
 * Converts a 6-digit hex color string (e.g. '#F2F2F7') to a Figma RGB object.
 *
 * @param hex - A validated 6-digit hex string
 * @returns Figma RGB with r/g/b values in the 0–1 range
 */
function hexToRgb(hex: string): RGB {
    return {
        r: parseInt(hex.slice(1, 3), 16) / 255,
        g: parseInt(hex.slice(3, 5), 16) / 255,
        b: parseInt(hex.slice(5, 7), 16) / 255,
    };
}

/**
 * Builds a complete Figma table from a parsed table Block.
 *
 * Structure:
 *   tableFrame (VERTICAL, FIXED width from settings)
 *     └─ headerRow (HORIZONTAL, STRETCH)
 *          └─ headerCell × N  (layoutGrow=1, equal width fill)
 *               └─ TextNode (bold)
 *     └─ dataRow × M (HORIZONTAL, STRETCH)
 *          └─ dataCell × N  (layoutGrow=1, equal width fill)
 *               └─ TextNode
 *
 * @param block    - A Block with type==='table', header, align, and rows
 * @param settings - Current plugin settings (provides tableHeaderBackground, frameWidth)
 * @returns A fully constructed FrameNode
 * @throws If the block is missing header or rows
 */
export async function createTableFrame(block: Block, settings: PluginSettings): Promise<FrameNode> {
    if (!block.header || !block.rows) {
        throw new Error('Invalid table block: missing header or rows');
    }

    const bodyStyle = await getOrCreateTextStyle(STYLE_NAMES.BODY, DEFAULT_STYLES[STYLE_NAMES.BODY]);
    const bodyConfig = DEFAULT_STYLES[STYLE_NAMES.BODY];
    const headerFont = await loadFont(bodyConfig.family, 'Bold');
    const bodyFont = await loadFont(bodyConfig.family, 'Regular');

    const headerBg = hexToRgb(settings.tableHeaderBackground);
    const borderColor: RGB = { r: 0.8, g: 0.8, b: 0.8 };
    const rowBorderColor: RGB = { r: 0.9, g: 0.9, b: 0.9 };

    // ── Root table frame ──────────────────────────────────────────────────────
    const tableFrame = figma.createFrame();
    tableFrame.name = 'Table';
    tableFrame.layoutMode = 'VERTICAL';
    tableFrame.itemSpacing = 0;
    tableFrame.primaryAxisSizingMode = 'AUTO';
    tableFrame.counterAxisSizingMode = 'FIXED';
    tableFrame.layoutAlign = 'STRETCH';
    tableFrame.strokes = [{ type: 'SOLID', color: borderColor }];
    tableFrame.strokeWeight = 1;

    // ── Header row ────────────────────────────────────────────────────────────
    const headerRow = figma.createFrame();
    headerRow.name = 'Header Row';
    headerRow.layoutMode = 'HORIZONTAL';
    headerRow.itemSpacing = 0;
    headerRow.primaryAxisSizingMode = 'FIXED';
    headerRow.counterAxisSizingMode = 'AUTO';
    headerRow.layoutAlign = 'STRETCH';
    headerRow.fills = [{ type: 'SOLID', color: headerBg }];

    for (let i = 0; i < block.header.length; i++) {
        const cell = block.header[i];
        const cellFrame = figma.createFrame();
        cellFrame.name = `Header Cell ${i + 1}`;
        cellFrame.layoutMode = 'HORIZONTAL';
        cellFrame.paddingTop = 12;
        cellFrame.paddingBottom = 12;
        cellFrame.paddingLeft = 16;
        cellFrame.paddingRight = 16;
        cellFrame.primaryAxisSizingMode = 'FIXED';
        cellFrame.counterAxisSizingMode = 'AUTO';
        cellFrame.layoutGrow = 1; // Equal column widths via fill

        if (i < block.header.length - 1) {
            cellFrame.strokes = [{ type: 'SOLID', color: borderColor }];
            cellFrame.strokeWeight = 1;
            cellFrame.strokeRightWeight = 1;
            cellFrame.strokeTopWeight = 0;
            cellFrame.strokeBottomWeight = 0;
            cellFrame.strokeLeftWeight = 0;
        }

        const textNode = figma.createText();
        textNode.fontName = headerFont;
        textNode.fontSize = bodyStyle.fontSize;
        textNode.lineHeight = bodyStyle.lineHeight;
        textNode.layoutAlign = 'STRETCH';
        textNode.characters = cell.text;

        const alignment = block.align?.[i];
        textNode.textAlignHorizontal =
            alignment === 'center' ? 'CENTER' :
            alignment === 'right' ? 'RIGHT' : 'LEFT';

        cellFrame.appendChild(textNode);
        headerRow.appendChild(cellFrame);
    }
    tableFrame.appendChild(headerRow);

    // ── Data rows ─────────────────────────────────────────────────────────────
    for (let rowIndex = 0; rowIndex < block.rows.length; rowIndex++) {
        const row = block.rows[rowIndex];
        const rowFrame = figma.createFrame();
        rowFrame.name = `Row ${rowIndex + 1}`;
        rowFrame.layoutMode = 'HORIZONTAL';
        rowFrame.itemSpacing = 0;
        rowFrame.primaryAxisSizingMode = 'FIXED';
        rowFrame.counterAxisSizingMode = 'AUTO';
        rowFrame.layoutAlign = 'STRETCH';
        rowFrame.strokes = [{ type: 'SOLID', color: rowBorderColor }];
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
            cellFrame.primaryAxisSizingMode = 'FIXED';
            cellFrame.counterAxisSizingMode = 'AUTO';
            cellFrame.layoutGrow = 1; // Equal column widths via fill

            if (colIndex < row.length - 1) {
                cellFrame.strokes = [{ type: 'SOLID', color: rowBorderColor }];
                cellFrame.strokeWeight = 1;
                cellFrame.strokeRightWeight = 1;
                cellFrame.strokeTopWeight = 0;
                cellFrame.strokeBottomWeight = 0;
                cellFrame.strokeLeftWeight = 0;
            }

            const textNode = figma.createText();
            textNode.fontName = bodyFont;
            textNode.fontSize = bodyStyle.fontSize;
            textNode.lineHeight = bodyStyle.lineHeight;
            textNode.layoutAlign = 'STRETCH';
            textNode.characters = cell.text;

            const alignment = block.align?.[colIndex];
            textNode.textAlignHorizontal =
                alignment === 'center' ? 'CENTER' :
                alignment === 'right' ? 'RIGHT' : 'LEFT';

            cellFrame.appendChild(textNode);
            rowFrame.appendChild(cellFrame);
        }
        tableFrame.appendChild(rowFrame);
    }

    return tableFrame;
}
```

**Step 2: Remove `createTableFrame` from `code.ts`, add import**

Delete `createTableFrame()` from `code.ts`.
Add:
```ts
import { createTableFrame } from './tables';
```
Update any calls: `createTableFrame(block)` → `createTableFrame(block, settings)`.
If `settings` isn't in scope yet, temporarily import and use `DEFAULT_SETTINGS`:
```ts
import { DEFAULT_SETTINGS } from './settings';
// ...
node = await createTableFrame(block, DEFAULT_SETTINGS);
```

**Step 3: Build and test**

```bash
npm run build && npm test
```
Expected: clean build, all tests pass.

**Step 4: Commit**

```bash
git add tables.ts code.ts
git commit -m "refactor: extract tables.ts, fix table column fill layout"
```

---

## Task 6: Create `renderer.ts` and Simplify `code.ts`

**Files:**
- Create: `figma-markdown-sync/renderer.ts`
- Modify: `figma-markdown-sync/code.ts`
- Modify: `figma-markdown-sync/jest.config.js`

**Step 1: Create `renderer.ts`**

```ts
/**
 * renderer.ts
 *
 * Converts an array of Blocks into a Figma Auto Layout FrameNode.
 *
 * This module orchestrates all visual construction. It does NOT parse Markdown
 * (see parser.ts), manage settings (see settings.ts), or know about the UI.
 *
 * Key behaviors:
 *   - Each block is rendered in its own try/catch. A failure in one block
 *     inserts a visible error placeholder and continues with the next block.
 *   - Consecutive list items are grouped into a nested frame with tighter
 *     spacing (settings.listSpacing) so they feel visually connected.
 *   - If a targetNode is provided, the new frame replaces it at the same canvas
 *     position, preserving x/y coordinates.
 *
 * Public API:
 *   renderMarkdown(name, markdown, settings, targetNode?) — async: FrameNode
 */

import { parseMarkdownToBlocks } from './parser';
import type { Block } from './parser';
import type { PluginSettings } from './settings';
import {
    STYLE_NAMES, DEFAULT_STYLES,
    loadFont, getOrCreateTextStyle,
    applyInlineStyles, initializeStyles,
} from './styles';
import { createTableFrame } from './tables';

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Converts a 6-digit hex color string to a Figma RGB object.
 *
 * @param hex - A valid 6-digit hex string (e.g. '#CCCCCC')
 * @returns Figma RGB with r/g/b in the 0–1 range
 */
function hexToRgb(hex: string): RGB {
    return {
        r: parseInt(hex.slice(1, 3), 16) / 255,
        g: parseInt(hex.slice(3, 5), 16) / 255,
        b: parseInt(hex.slice(5, 7), 16) / 255,
    };
}

/**
 * Fetches a remote image URL and creates a filled RectangleNode.
 * Returns a styled error placeholder frame if loading fails.
 *
 * @param block    - An image Block with a valid imageUrl
 * @param maxWidth - Maximum rendered width; wider images are scaled down proportionally
 */
async function createImageNode(block: Block, maxWidth: number): Promise<RectangleNode | FrameNode> {
    if (!block.imageUrl) throw new Error('Image block has no URL');

    try {
        const image = await figma.createImageAsync(block.imageUrl);
        const imageSize = await image.getSizeAsync();

        const imageRect = figma.createRectangle();
        imageRect.name = block.imageAlt || 'Image';
        imageRect.layoutAlign = 'STRETCH';

        if (imageSize.width > maxWidth) {
            const scale = maxWidth / imageSize.width;
            imageRect.resize(maxWidth, imageSize.height * scale);
        } else {
            imageRect.resize(imageSize.width, imageSize.height);
        }

        imageRect.fills = [{ type: 'IMAGE', imageHash: image.hash, scaleMode: 'FILL' }];
        return imageRect;
    } catch (error) {
        console.error(`Failed to load image: ${block.imageUrl}`, error);

        const placeholder = figma.createFrame();
        placeholder.name = `Image Error: ${block.imageAlt || 'Unknown'}`;
        placeholder.layoutMode = 'VERTICAL';
        placeholder.primaryAxisAlignItems = 'CENTER';
        placeholder.counterAxisAlignItems = 'CENTER';
        placeholder.paddingTop = 40;
        placeholder.paddingBottom = 40;
        placeholder.paddingLeft = 40;
        placeholder.paddingRight = 40;
        placeholder.fills = [{ type: 'SOLID', color: { r: 0.95, g: 0.95, b: 0.95 } }];
        placeholder.strokes = [{ type: 'SOLID', color: { r: 0.8, g: 0.2, b: 0.2 } }];
        placeholder.strokeWeight = 2;
        placeholder.dashPattern = [5, 5];
        placeholder.resize(maxWidth, 200);
        placeholder.layoutAlign = 'STRETCH';

        const errorText = figma.createText();
        const font = await loadFont('Inter', 'Regular');
        errorText.fontName = font;
        errorText.fontSize = 14;
        errorText.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.1, b: 0.1 } }];
        errorText.characters = `Failed to load image\n${block.imageAlt || ''}\nURL: ${block.imageUrl}`;
        errorText.textAlignHorizontal = 'CENTER';
        placeholder.appendChild(errorText);
        return placeholder;
    }
}

/**
 * Renders a group of consecutive list-item Blocks into a single nested
 * Auto Layout frame with tighter inter-item spacing.
 *
 * Grouping creates visual cohesion within a list while allowing normal
 * block spacing above and below the list group as a whole.
 *
 * @param listBlocks - One or more consecutive list-type Blocks
 * @param settings   - Current plugin settings (provides listSpacing)
 * @returns A FrameNode containing all list items
 */
async function createListGroupFrame(listBlocks: Block[], settings: PluginSettings): Promise<FrameNode> {
    const listFrame = figma.createFrame();
    listFrame.name = 'List';
    listFrame.layoutMode = 'VERTICAL';
    listFrame.itemSpacing = settings.listSpacing;
    listFrame.primaryAxisSizingMode = 'AUTO';
    listFrame.counterAxisSizingMode = 'FIXED';
    listFrame.layoutAlign = 'STRETCH';
    listFrame.fills = [];

    const listStyle = await getOrCreateTextStyle(STYLE_NAMES.LIST, DEFAULT_STYLES[STYLE_NAMES.LIST]);

    for (const block of listBlocks) {
        const textNode = figma.createText();
        textNode.textStyleId = listStyle.id;
        textNode.layoutAlign = 'STRETCH';
        textNode.characters = `\u2022 ${block.content || ''}`;
        listFrame.appendChild(textNode);
    }

    return listFrame;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Parses a Markdown string and renders it into a Figma Auto Layout FrameNode.
 *
 * If targetNode is provided (an existing canvas node with the same name),
 * the new frame replaces it at the same x/y position.
 *
 * Each block is rendered independently — a failure in one block inserts a
 * visible error placeholder and does not abort the overall import.
 *
 * @param name       - Name for the resulting Figma frame (usually the filename)
 * @param markdown   - Raw Markdown string to render
 * @param settings   - Current plugin settings
 * @param targetNode - Optional existing node to replace in the canvas
 * @returns The completed FrameNode
 */
export async function renderMarkdown(
    name: string,
    markdown: string,
    settings: PluginSettings,
    targetNode?: SceneNode
): Promise<FrameNode> {
    const blocks = parseMarkdownToBlocks(markdown);
    await initializeStyles();

    // Create or replace the root frame
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
    frame.itemSpacing = settings.blockSpacing;
    frame.paddingTop = settings.framePadding;
    frame.paddingBottom = settings.framePadding;
    frame.paddingLeft = settings.framePadding;
    frame.paddingRight = settings.framePadding;
    frame.primaryAxisSizingMode = 'AUTO';
    frame.counterAxisSizingMode = 'FIXED';
    frame.resize(settings.frameWidth, frame.height);

    // ── Render blocks, grouping consecutive list items ────────────────────────
    let i = 0;
    while (i < blocks.length) {
        const block = blocks[i];

        if (block.type === 'list') {
            const listGroup: Block[] = [];
            while (i < blocks.length && blocks[i].type === 'list') {
                listGroup.push(blocks[i]);
                i++;
            }
            try {
                const listFrame = await createListGroupFrame(listGroup, settings);
                frame.appendChild(listFrame);
            } catch (err) {
                console.error('Failed to render list group', err);
            }
            continue;
        }

        try {
            let node: SceneNode | null = null;

            switch (block.type) {
                case 'heading': {
                    const styleName =
                        block.level === 1 ? STYLE_NAMES.H1 :
                        block.level === 2 ? STYLE_NAMES.H2 : STYLE_NAMES.H3;
                    const style = await getOrCreateTextStyle(styleName, DEFAULT_STYLES[styleName]);
                    const textNode = figma.createText();
                    textNode.textStyleId = style.id;
                    textNode.layoutAlign = 'STRETCH';
                    if (block.tokens) {
                        await applyInlineStyles(textNode, block.tokens, styleName);
                    } else {
                        textNode.characters = block.content || '';
                    }
                    node = textNode;
                    break;
                }
                case 'paragraph': {
                    const style = await getOrCreateTextStyle(STYLE_NAMES.BODY, DEFAULT_STYLES[STYLE_NAMES.BODY]);
                    const textNode = figma.createText();
                    textNode.textStyleId = style.id;
                    textNode.layoutAlign = 'STRETCH';
                    if (block.tokens) {
                        await applyInlineStyles(textNode, block.tokens, STYLE_NAMES.BODY);
                    } else {
                        textNode.characters = block.content || '';
                    }
                    node = textNode;
                    break;
                }
                case 'quote': {
                    const style = await getOrCreateTextStyle(STYLE_NAMES.QUOTE, DEFAULT_STYLES[STYLE_NAMES.QUOTE]);
                    const textNode = figma.createText();
                    textNode.textStyleId = style.id;
                    textNode.layoutAlign = 'STRETCH';
                    textNode.characters = block.content || '';
                    node = textNode;
                    break;
                }
                case 'code': {
                    const codeFrame = figma.createFrame();
                    codeFrame.layoutMode = 'VERTICAL';
                    codeFrame.fills = [{ type: 'SOLID', color: hexToRgb(settings.codeBackground) }];
                    codeFrame.paddingTop = 16;
                    codeFrame.paddingBottom = 16;
                    codeFrame.paddingLeft = 16;
                    codeFrame.paddingRight = 16;
                    codeFrame.cornerRadius = 8;
                    codeFrame.layoutAlign = 'STRETCH';
                    codeFrame.counterAxisSizingMode = 'FIXED';
                    const codeStyle = await getOrCreateTextStyle(STYLE_NAMES.CODE, DEFAULT_STYLES[STYLE_NAMES.CODE]);
                    const codeText = figma.createText();
                    codeText.textStyleId = codeStyle.id;
                    codeText.characters = block.content || '';
                    codeFrame.appendChild(codeText);
                    node = codeFrame;
                    break;
                }
                case 'separator': {
                    const line = figma.createRectangle();
                    line.resize(settings.frameWidth, 1);
                    line.fills = [{ type: 'SOLID', color: hexToRgb(settings.separatorColor) }];
                    line.layoutAlign = 'STRETCH';
                    node = line;
                    break;
                }
                case 'table': {
                    node = await createTableFrame(block, settings);
                    break;
                }
                case 'image': {
                    node = await createImageNode(block, settings.frameWidth);
                    break;
                }
            }

            if (node) frame.appendChild(node);
        } catch (err) {
            console.error(`Failed to render block "${block.type}"`, err);
            // Insert a visible placeholder so the failed block is not silently skipped
            try {
                const errorNode = figma.createText();
                const font = await loadFont('Inter', 'Regular');
                errorNode.fontName = font;
                errorNode.fontSize = 12;
                errorNode.fills = [{ type: 'SOLID', color: { r: 0.8, g: 0.2, b: 0.2 } }];
                errorNode.characters = `[Render error: ${block.type} block failed]`;
                errorNode.layoutAlign = 'STRETCH';
                frame.appendChild(errorNode);
            } catch { /* If even the error placeholder fails, skip silently */ }
        }

        i++;
    }

    return frame;
}
```

**Step 2: Replace `code.ts` with the entry-point-only version**

```ts
/**
 * code.ts
 *
 * Plugin entry point. Initializes the UI and handles messages between the
 * Figma plugin sandbox and the UI iframe.
 *
 * This file intentionally contains no logic. All concerns are delegated:
 *   - parser.ts    — Markdown → Block[]
 *   - renderer.ts  — Block[] → Figma nodes
 *   - styles.ts    — Text style management
 *   - settings.ts  — Settings persistence
 *   - tables.ts    — Table frame creation
 */

import { renderMarkdown } from './renderer';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from './settings';
import type { PluginSettings } from './settings';

figma.showUI(__html__, { width: 400, height: 500 });

figma.ui.onmessage = async (msg) => {
    switch (msg.type) {
        case 'get-settings': {
            const settings = await loadSettings();
            figma.ui.postMessage({ type: 'settings-loaded', settings });
            break;
        }

        case 'update-setting': {
            const settings = await loadSettings();
            const updated = { ...settings, [msg.key]: msg.value } as PluginSettings;
            await saveSettings(updated);
            break;
        }

        case 'reset-settings': {
            await saveSettings(DEFAULT_SETTINGS);
            figma.ui.postMessage({ type: 'settings-loaded', settings: DEFAULT_SETTINGS });
            break;
        }

        case 'import-markdown-batch': {
            const files: { name: string; content: string }[] = msg.files;

            if (!files || files.length === 0) {
                figma.ui.postMessage({ type: 'status', message: 'No files received.', error: true });
                return;
            }

            const settings = await loadSettings();
            const allNodes = figma.currentPage.findAll(n => n.name.length > 0);
            let successCount = 0;
            const errors: string[] = [];

            for (const file of files) {
                const nameNoExt = file.name.replace(/\.(md|markdown|txt)$/i, '');
                const target = allNodes.find(n => n.name === file.name || n.name === nameNoExt);

                try {
                    await renderMarkdown(nameNoExt, file.content, settings, target as SceneNode);
                    successCount++;
                } catch (e) {
                    console.error(`Failed to import ${file.name}`, e);
                    errors.push(file.name);
                }
            }

            const message = errors.length > 0
                ? `Imported ${successCount} file(s). Failed: ${errors.join(', ')}`
                : `Imported ${successCount} file(s) successfully.`;

            figma.ui.postMessage({ type: 'status', message, error: errors.length > 0 });
            break;
        }
    }
};
```

**Step 3: Update `jest.config.js` coverage paths and rename test file**

In `jest.config.js`:
```js
collectCoverageFrom: [
    'parser.ts',
    'styles.ts',
    'settings.ts',
    'tables.ts',
    'renderer.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/dist/**',
],
```

Rename the test file:
```bash
mv code.test.ts parser.test.ts
```

**Step 4: Build and test**

```bash
npm run build && npm test
```
Expected: clean build, all tests pass (now from `parser.test.ts`).

**Step 5: Commit**

```bash
git add renderer.ts code.ts jest.config.js parser.test.ts
git commit -m "refactor: extract renderer.ts, simplify code.ts to entry point"
```

---

## Task 7: UI Rebuild — HTML Structure

**Files:**
- Modify: `figma-markdown-sync/ui.html`

**Step 1: Rewrite `ui.html`**

Replace the entire file:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MarkDown For What</title>
</head>
<body>
    <!-- Tab Bar -->
    <div class="tab-bar">
        <button class="tab-btn active" data-tab="import">Import</button>
        <button class="tab-btn" data-tab="settings">Settings</button>
    </div>

    <!-- Import Tab -->
    <div id="tab-import" class="tab-content active">
        <div id="drop-zone" class="drop-zone">
            <div class="drop-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 16L12 8M12 8L9 11M12 8L15 11" stroke="#999" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M3 15V17C3 18.1046 3.89543 19 5 19H19C20.1046 19 21 18.1046 21 17V15" stroke="#999" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
            </div>
            <p class="drop-primary">Drop Markdown files here</p>
            <p class="drop-secondary">or <span class="browse-link" id="browse-btn">browse files</span></p>
            <input type="file" id="file-input" accept=".md,.markdown,.txt" multiple>
        </div>

        <div id="file-list" class="file-list"></div>
    </div>

    <!-- Settings Tab -->
    <div id="tab-settings" class="tab-content">
        <div class="settings-group">
            <div class="settings-group-label">Spacing</div>
            <div class="setting-row">
                <label for="s-blockSpacing">Block spacing</label>
                <div class="setting-input-wrap">
                    <input type="number" id="s-blockSpacing" data-key="blockSpacing" min="0" max="200">
                    <span class="unit">px</span>
                </div>
            </div>
            <div class="setting-row">
                <label for="s-listSpacing">List item spacing</label>
                <div class="setting-input-wrap">
                    <input type="number" id="s-listSpacing" data-key="listSpacing" min="0" max="100">
                    <span class="unit">px</span>
                </div>
            </div>
            <div class="setting-row">
                <label for="s-framePadding">Frame padding</label>
                <div class="setting-input-wrap">
                    <input type="number" id="s-framePadding" data-key="framePadding" min="0" max="200">
                    <span class="unit">px</span>
                </div>
            </div>
        </div>

        <div class="settings-group">
            <div class="settings-group-label">Frame</div>
            <div class="setting-row">
                <label for="s-frameWidth">Frame width</label>
                <div class="setting-input-wrap">
                    <input type="number" id="s-frameWidth" data-key="frameWidth" min="200" max="4000">
                    <span class="unit">px</span>
                </div>
            </div>
        </div>

        <div class="settings-group">
            <div class="settings-group-label">Colors</div>
            <div class="setting-row">
                <label for="s-codeBackground">Code block</label>
                <div class="setting-input-wrap">
                    <input type="color" id="s-codeBackground" data-key="codeBackground">
                    <input type="text" class="hex-input" data-for="s-codeBackground" maxlength="7" placeholder="#F2F2F2">
                </div>
            </div>
            <div class="setting-row">
                <label for="s-tableHeaderBackground">Table header</label>
                <div class="setting-input-wrap">
                    <input type="color" id="s-tableHeaderBackground" data-key="tableHeaderBackground">
                    <input type="text" class="hex-input" data-for="s-tableHeaderBackground" maxlength="7" placeholder="#F2F2F7">
                </div>
            </div>
            <div class="setting-row">
                <label for="s-separatorColor">Separator</label>
                <div class="setting-input-wrap">
                    <input type="color" id="s-separatorColor" data-key="separatorColor">
                    <input type="text" class="hex-input" data-for="s-separatorColor" maxlength="7" placeholder="#CCCCCC">
                </div>
            </div>
        </div>

        <button id="reset-btn" class="reset-btn">Reset to defaults</button>
    </div>

    <!-- Fixed Bottom Bar (Import tab only) -->
    <div id="bottom-bar" class="bottom-bar">
        <div id="status-message" class="status-message"></div>
        <button id="import-btn" disabled>Import</button>
    </div>

    <!-- Loader Overlay -->
    <div id="loader" class="loader-overlay">
        <div class="loader-content">
            <div class="spinner"></div>
            <p>Importing&hellip;<br>Do not close this window.</p>
        </div>
    </div>
</body>
</html>
```

**Step 2: Build**

```bash
npm run build
```
Expected: clean build.

**Step 3: Commit**

```bash
git add ui.html
git commit -m "feat: redesign ui.html with tabs and fixed bottom import bar"
```

---

## Task 8: UI Rebuild — Styles

**Files:**
- Modify: `figma-markdown-sync/src/styles.css`

**Step 1: Rewrite `src/styles.css`**

Replace the entire file:

```css
/* ─── Reset & Base ─────────────────────────────────────────────────────────── */

*, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
}

body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 12px;
    color: #1a1a1a;
    background: #ffffff;
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
}

/* ─── Tab Bar ───────────────────────────────────────────────────────────────── */

.tab-bar {
    display: flex;
    border-bottom: 1px solid #e5e5e5;
    flex-shrink: 0;
    padding: 0 16px;
}

.tab-btn {
    background: none;
    border: none;
    padding: 12px 16px 10px;
    font-size: 12px;
    font-weight: 500;
    color: #888;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    transition: color 0.15s, border-color 0.15s;
}

.tab-btn:hover { color: #1a1a1a; }

.tab-btn.active {
    color: #1a1a1a;
    border-bottom-color: #1a1a1a;
}

/* ─── Tab Content ───────────────────────────────────────────────────────────── */

.tab-content {
    display: none;
    flex-direction: column;
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    padding-bottom: 72px; /* Space for fixed bottom bar */
}

.tab-content.active { display: flex; }

#tab-settings { padding-bottom: 16px; }

/* ─── Drop Zone ─────────────────────────────────────────────────────────────── */

.drop-zone {
    border: 1.5px dashed #d0d0d0;
    border-radius: 8px;
    padding: 28px 20px;
    text-align: center;
    cursor: pointer;
    transition: border-color 0.15s, background-color 0.15s;
    position: relative;
    flex-shrink: 0;
}

.drop-zone:hover,
.drop-zone.drag-over {
    border-color: #0d99ff;
    background-color: #f0f8ff;
}

.drop-icon { margin-bottom: 10px; }

.drop-primary {
    font-size: 13px;
    font-weight: 500;
    color: #1a1a1a;
    margin-bottom: 4px;
}

.drop-secondary {
    font-size: 11px;
    color: #888;
}

.browse-link {
    color: #0d99ff;
    cursor: pointer;
    text-decoration: underline;
}

#file-input {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
}

/* ─── File List ─────────────────────────────────────────────────────────────── */

.file-list {
    margin-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow-y: auto;
}

.file-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: #f7f7f7;
    border-radius: 6px;
}

.file-item-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 500;
    color: #1a1a1a;
}

.file-item-preview {
    color: #888;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 10px;
    max-width: 180px;
}

/* ─── Bottom Bar ────────────────────────────────────────────────────────────── */

.bottom-bar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: #fff;
    border-top: 1px solid #e5e5e5;
    padding: 10px 16px;
    display: flex;
    align-items: center;
    gap: 10px;
    z-index: 10;
}

.bottom-bar.hidden { display: none; }

#import-btn {
    margin-left: auto;
    padding: 8px 20px;
    background: #0d99ff;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s;
}

#import-btn:hover:not(:disabled) { background: #0a88e6; }

#import-btn:disabled {
    background: #d0d0d0;
    cursor: not-allowed;
}

/* ─── Status ────────────────────────────────────────────────────────────────── */

.status-message {
    font-size: 11px;
    min-height: 16px;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.status-message.success { color: #18a85a; }
.status-message.error   { color: #e03e3e; }

/* ─── Settings ──────────────────────────────────────────────────────────────── */

.settings-group { margin-bottom: 20px; }

.settings-group-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #888;
    margin-bottom: 8px;
}

.setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 0;
    border-bottom: 1px solid #f0f0f0;
}

.setting-row label {
    font-size: 12px;
    color: #333;
    flex: 1;
}

.setting-input-wrap {
    display: flex;
    align-items: center;
    gap: 4px;
}

.setting-input-wrap input[type="number"] {
    width: 60px;
    padding: 4px 6px;
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    font-size: 12px;
    text-align: right;
    color: #1a1a1a;
}

.setting-input-wrap input[type="number"]:focus {
    outline: none;
    border-color: #0d99ff;
}

.unit {
    font-size: 11px;
    color: #888;
    width: 16px;
}

.setting-input-wrap input[type="color"] {
    width: 28px;
    height: 28px;
    padding: 2px;
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    cursor: pointer;
    background: none;
}

.hex-input {
    width: 72px;
    padding: 4px 6px;
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    font-size: 11px;
    font-family: 'Roboto Mono', monospace;
    color: #1a1a1a;
}

.hex-input:focus {
    outline: none;
    border-color: #0d99ff;
}

.reset-btn {
    background: none;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    padding: 7px 14px;
    font-size: 12px;
    color: #666;
    cursor: pointer;
    width: 100%;
    margin-top: 8px;
    transition: background 0.15s, border-color 0.15s;
}

.reset-btn:hover {
    background: #f5f5f5;
    border-color: #ccc;
}

/* ─── Loader ────────────────────────────────────────────────────────────────── */

.loader-overlay {
    position: fixed;
    inset: 0;
    background: rgba(255, 255, 255, 0.92);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 100;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s;
    text-align: center;
}

.loader-overlay.visible {
    opacity: 1;
    pointer-events: auto;
}

.loader-content p {
    margin-top: 12px;
    font-size: 12px;
    color: #555;
    line-height: 1.5;
}

.spinner {
    width: 22px;
    height: 22px;
    border: 2.5px solid #e0e0e0;
    border-top-color: #0d99ff;
    border-radius: 50%;
    animation: spin 0.75s linear infinite;
    margin: 0 auto;
}

@keyframes spin { to { transform: rotate(360deg); } }
```

**Step 2: Build**

```bash
npm run build
```
Expected: clean build.

**Step 3: Commit**

```bash
git add src/styles.css
git commit -m "feat: redesign plugin UI styles — tabs, clean layout, native Figma aesthetic"
```

---

## Task 9: UI Rebuild — JavaScript Logic

**Files:**
- Modify: `figma-markdown-sync/src/ui.ts`

**Step 1: Rewrite `src/ui.ts`**

Replace the entire file. Note: file list items are built using safe DOM methods (no innerHTML) to prevent XSS.

```ts
/**
 * ui.ts
 *
 * Plugin UI logic — tab switching, drag-and-drop, file reading, settings
 * display, and communication with the plugin sandbox (code.ts).
 *
 * Message protocol:
 *   UI → plugin:  'get-settings'
 *   UI → plugin:  'update-setting'      { key: string, value: unknown }
 *   UI → plugin:  'reset-settings'
 *   UI → plugin:  'import-markdown-batch'  { files: [{name, content}] }
 *   plugin → UI:  'settings-loaded'     { settings: Record<string, unknown> }
 *   plugin → UI:  'status'              { message: string, error: boolean }
 */

import './styles.css';

// ─── DOM References ────────────────────────────────────────────────────────────

const dropZone  = document.getElementById('drop-zone')!;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const browseBtn = document.getElementById('browse-btn')!;
const fileList  = document.getElementById('file-list')!;
const importBtn = document.getElementById('import-btn') as HTMLButtonElement;
const statusMsg = document.getElementById('status-message')!;
const loader    = document.getElementById('loader')!;
const bottomBar = document.getElementById('bottom-bar')!;
const resetBtn  = document.getElementById('reset-btn')!;

// ─── State ─────────────────────────────────────────────────────────────────────

let currentFiles: { name: string; content: string }[] = [];

// ─── Tab Switching ─────────────────────────────────────────────────────────────

document.querySelectorAll<HTMLElement>('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab!;

        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        btn.classList.add('active');
        document.getElementById(`tab-${tab}`)!.classList.add('active');
        bottomBar.classList.toggle('hidden', tab !== 'import');
    });
});

// ─── Drop Zone ─────────────────────────────────────────────────────────────────

dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));

dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer?.files.length) handleFiles(e.dataTransfer.files);
});

dropZone.addEventListener('click', e => {
    if (e.target !== browseBtn) fileInput.click();
});

browseBtn.addEventListener('click', e => {
    e.stopPropagation();
    fileInput.click();
});

fileInput.addEventListener('change', () => {
    if (fileInput.files?.length) handleFiles(fileInput.files);
});

// ─── File Handling ─────────────────────────────────────────────────────────────

/**
 * Reads a single File and returns its name and text content.
 * Returns empty content for unsupported file types.
 */
function readFile(file: File): Promise<{ name: string; content: string }> {
    return new Promise((resolve, reject) => {
        if (!/\.(md|markdown|txt)$/i.test(file.name)) {
            resolve({ name: file.name, content: '' });
            return;
        }
        const reader = new FileReader();
        reader.onload = e => resolve({ name: file.name, content: e.target?.result as string });
        reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
        reader.readAsText(file);
    });
}

/**
 * Reads all files in a FileList, renders the file preview list, and enables
 * the import button when at least one valid file is ready.
 */
async function handleFiles(files: FileList): Promise<void> {
    showStatus('Reading files...', 'success');
    importBtn.disabled = true;

    try {
        const results = await Promise.all(Array.from(files).map(readFile));
        currentFiles = results.filter(f => f.content !== '');

        if (currentFiles.length === 0) {
            showStatus('No valid Markdown files found.', 'error');
            renderFileList([]);
            return;
        }

        renderFileList(currentFiles);
        importBtn.disabled = false;
        importBtn.textContent = currentFiles.length > 1
            ? `Import ${currentFiles.length} files`
            : 'Import file';
        showStatus(`${currentFiles.length} file(s) ready`, 'success');
    } catch (err) {
        console.error(err);
        showStatus('Error reading files.', 'error');
    }
}

/**
 * Renders the queued file list using safe DOM construction (no innerHTML).
 * Each item shows the filename and a short content preview.
 */
function renderFileList(files: { name: string; content: string }[]): void {
    while (fileList.firstChild) fileList.removeChild(fileList.firstChild);

    files.forEach(f => {
        const preview = f.content.replace(/^---[\s\S]*?---\n/, '').trim().slice(0, 60).replace(/\n/g, ' ');

        const item = document.createElement('div');
        item.className = 'file-item';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'file-item-name';
        nameSpan.textContent = f.name;

        const previewSpan = document.createElement('span');
        previewSpan.className = 'file-item-preview';
        previewSpan.textContent = preview;

        item.appendChild(nameSpan);
        item.appendChild(previewSpan);
        fileList.appendChild(item);
    });
}

// ─── Import ────────────────────────────────────────────────────────────────────

importBtn.addEventListener('click', () => {
    if (currentFiles.length === 0) return;
    loader.classList.add('visible');
    importBtn.disabled = true;
    parent.postMessage({ pluginMessage: { type: 'import-markdown-batch', files: currentFiles } }, '*');
});

// ─── Plugin Messages ──────────────────────────────────────────────────────────

window.onmessage = event => {
    const msg = event.data.pluginMessage;
    if (!msg) return;

    loader.classList.remove('visible');
    importBtn.disabled = currentFiles.length === 0;

    switch (msg.type) {
        case 'status':
            showStatus(msg.message, msg.error ? 'error' : 'success');
            if (!msg.error) {
                currentFiles = [];
                renderFileList([]);
                importBtn.disabled = true;
                importBtn.textContent = 'Import';
            }
            break;
        case 'settings-loaded':
            applySettingsToUI(msg.settings);
            break;
    }
};

// ─── Status ───────────────────────────────────────────────────────────────────

function showStatus(message: string, type: 'success' | 'error'): void {
    statusMsg.textContent = message;
    statusMsg.className = `status-message ${type}`;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

/**
 * Populates all settings inputs with values received from the plugin.
 */
function applySettingsToUI(settings: Record<string, unknown>): void {
    document.querySelectorAll<HTMLInputElement>('[data-key]').forEach(input => {
        const key = input.dataset.key!;
        const value = settings[key];
        if (value === undefined) return;

        if (input.type === 'color') {
            input.value = value as string;
            const hexInput = document.querySelector<HTMLInputElement>(`.hex-input[data-for="${input.id}"]`);
            if (hexInput) hexInput.value = value as string;
        } else {
            input.value = String(value);
        }
    });
}

/** Sends a single setting key/value update to the plugin for persistence. */
function sendSettingUpdate(key: string, value: unknown): void {
    parent.postMessage({ pluginMessage: { type: 'update-setting', key, value } }, '*');
}

// Wire number inputs
document.querySelectorAll<HTMLInputElement>('input[type="number"][data-key]').forEach(input => {
    input.addEventListener('change', () => {
        const value = Number(input.value);
        if (!isNaN(value) && value >= 0) sendSettingUpdate(input.dataset.key!, value);
    });
});

// Wire color picker inputs — sync hex text input on change
document.querySelectorAll<HTMLInputElement>('input[type="color"][data-key]').forEach(colorInput => {
    colorInput.addEventListener('input', () => {
        const hexInput = document.querySelector<HTMLInputElement>(`.hex-input[data-for="${colorInput.id}"]`);
        if (hexInput) hexInput.value = colorInput.value;
        sendSettingUpdate(colorInput.dataset.key!, colorInput.value);
    });
});

// Wire hex text inputs — sync color picker, send update on valid hex
document.querySelectorAll<HTMLInputElement>('.hex-input').forEach(hexInput => {
    hexInput.addEventListener('input', () => {
        const colorInput = document.getElementById(hexInput.dataset.for!) as HTMLInputElement;
        if (/^#[0-9A-Fa-f]{6}$/.test(hexInput.value)) {
            colorInput.value = hexInput.value;
            sendSettingUpdate(colorInput.dataset.key!, hexInput.value);
        }
    });
});

// Reset button
resetBtn.addEventListener('click', () => {
    parent.postMessage({ pluginMessage: { type: 'reset-settings' } }, '*');
});

// ─── Init ─────────────────────────────────────────────────────────────────────

// Request current settings from the plugin on load
parent.postMessage({ pluginMessage: { type: 'get-settings' } }, '*');
```

**Step 2: Build and test**

```bash
npm run build && npm test
```
Expected: clean build, all tests pass.

**Step 3: Commit**

```bash
git add src/ui.ts
git commit -m "feat: rebuild UI with tab switching, settings panel, and safe DOM construction"
```

---

## Task 10: Final Verification

**Step 1: Run full test suite with coverage**

```bash
npm run test:coverage
```
Expected: all tests pass; coverage shows meaningful results across parser.ts, settings.ts, styles.ts.

**Step 2: Run production build**

```bash
npm run build
```
Expected: clean build, no warnings.

**Step 3: Manual verification checklist in Figma Desktop**

Load the plugin via `figma-markdown-sync/manifest.json` in Figma (not FigJam — it should not appear there).

- [ ] Import tab: drop zone, file list, and pinned Import button all visible
- [ ] Dropping a Markdown file shows it in the list; Import button enables
- [ ] Importing creates a properly structured Auto Layout frame
- [ ] List items have tighter spacing than other block types
- [ ] Tables render with equal-width columns filling the frame
- [ ] Settings tab: all inputs visible and populated with current values
- [ ] Changing a setting, closing and reopening plugin: values persist
- [ ] "Reset to defaults" restores all settings
- [ ] Re-importing does NOT overwrite a customized `Markdown/H1` style
- [ ] A broken image URL shows a placeholder text node, not a crash
- [ ] Plugin does NOT appear or run in FigJam

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final polish verification pass — ready for release"
```
