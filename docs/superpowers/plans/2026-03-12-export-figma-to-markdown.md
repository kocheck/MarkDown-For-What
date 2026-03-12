# Export: Figma → Markdown Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Figma → Markdown export pipeline: walk selected frame layer trees, diff inferred blocks against stored source, and download `.md` files with round-trip fidelity for plugin-created frames.

**Architecture:** New `exporter.ts` handles all inference + diff + assembly logic. Four new message types wire the sandbox to the UI. `code.ts` stores `pluginData` on frames at import time and responds to export requests. The UI gets a new Export tab with auto-merge default and optional selective review mode. All innerHTML usage in the UI uses the existing `escapeHtml()` utility on user-derived content; plan reviewers should verify this pattern is followed in every instance.

**Tech Stack:** TypeScript, Figma Plugin API, Jest 30.x

**Spec:** `docs/superpowers/specs/2026-03-12-export-figma-to-markdown-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `figma-markdown-sync/exporter.ts` | **Create** | Layer-tree walker, inference rules for all 18 block types, content-hash diff engine, Markdown assembly |
| `figma-markdown-sync/exporter.test.ts` | **Create** | Tests for inference, diff engine, assembly |
| `figma-markdown-sync/messages.ts` | **Modify** | Add 4 new export message type constants + MSG_GET_SELECTION + MSG_SELECTION_CHANGED |
| `figma-markdown-sync/code.ts` | **Modify** | Store `pluginData` after `renderBlocks`; handle export message types; listen for selectionchange |
| `figma-markdown-sync/blockRenderers.ts` | **Modify** | Store `mermaidSource` / `mathSource` as `pluginData` on Mermaid and Math frames at render time |
| `figma-markdown-sync/test-setup.ts` | **Modify** | Add `setPluginData` / `getPluginData` mocks to `makeMockFrame` |
| `figma-markdown-sync/ui.html` | **Modify** | Add Export tab button and `#export-panel` tab panel |
| `figma-markdown-sync/src/ui.ts` | **Modify** | Export tab logic: request diff on selection, render summary, review mode, trigger downloads |
| `figma-markdown-sync/src/styles.css` | **Modify** | Styles for export panel, diff view, fidelity warning badges |

**No changes to:** `parser.ts`, `renderer.ts`, `styles.ts`, `settings.ts`, `tables.ts`, `parser.test.ts`, `renderer.test.ts`, `styles.test.ts`, `settings.test.ts`, `tables.test.ts`

---

## Chunk 1: pluginData Storage at Import Time

### Task 1: Add pluginData mocks to test-setup

**Files:**
- Modify: `figma-markdown-sync/test-setup.ts:7-51` (`makeMockFrame`)

- [ ] **Step 1: Add `setPluginData` and `getPluginData` mocks to `makeMockFrame`**

In `makeMockFrame()`, inside the frame object literal, add after the `remove` mock:

```typescript
_pluginData: {} as Record<string, string>,
setPluginData: jest.fn(function(key: string, value: string) { frame._pluginData[key] = value; }),
getPluginData: jest.fn(function(key: string) { return frame._pluginData[key] ?? ''; }),
```

- [ ] **Step 2: Run all tests to confirm no regressions**

```bash
cd figma-markdown-sync && npx jest --verbose
```
Expected: all existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add figma-markdown-sync/test-setup.ts
git commit -m "test: add setPluginData/getPluginData mocks to makeMockFrame"
```

---

### Task 2: Add export message type constants

**Files:**
- Modify: `figma-markdown-sync/messages.ts`

- [ ] **Step 1: Add the 6 export/selection message constants**

Append to `messages.ts`:

```typescript
// ── Export (UI → Sandbox) ────────────────────────────────────────────────────

export const MSG_EXPORT_REQUEST  = 'export-request';   // UI sends selected frame IDs
export const MSG_EXPORT_DOWNLOAD = 'export-download';  // UI sends frame ID + block selections
export const MSG_GET_SELECTION   = 'get-selection';    // UI asks sandbox for current selection

// ── Export (Sandbox → UI) ────────────────────────────────────────────────────

export const MSG_EXPORT_RESULT      = 'export-result';      // Sandbox returns diff result per frame
export const MSG_EXPORT_MARKDOWN    = 'export-markdown';    // Sandbox returns assembled Markdown string
export const MSG_SELECTION_CHANGED  = 'selection-changed';  // Sandbox notifies UI of frame selection change
```

- [ ] **Step 2: Run tests to confirm no regressions**

```bash
npx jest --verbose
```

- [ ] **Step 3: Commit**

```bash
git add figma-markdown-sync/messages.ts
git commit -m "feat: add export and selection message type constants"
```

---

### Task 3: Store mermaidSource / mathSource pluginData in blockRenderers

**Files:**
- Modify: `figma-markdown-sync/blockRenderers.ts` (`renderMermaidBlock` ~line 418, `renderMathBlock` ~line 450)

- [ ] **Step 1: In `renderMermaidBlock`, store source after building the frame**

After `mermaidFrame.appendChild(sourceNode)`, add:

```typescript
mermaidFrame.setPluginData('mermaidSource', block.content ?? '');
```

- [ ] **Step 2: In `renderMathBlock`, store source after the math text is appended**

After the math text node is appended to `mathFrame`, add:

```typescript
mathFrame.setPluginData('mathSource', block.content ?? '');
```

- [ ] **Step 3: Run tests**

```bash
npx jest --verbose
```
Expected: all pass. `setPluginData` is now mocked so no new test changes needed.

- [ ] **Step 4: Commit**

```bash
git add figma-markdown-sync/blockRenderers.ts
git commit -m "feat: store mermaid/math source as pluginData for round-trip export"
```

---

### Task 4: Store markdownSource pluginData in code.ts

**Files:**
- Modify: `figma-markdown-sync/code.ts:163-167` (inside `MSG_IMPORT_BATCH` loop, after `renderBlocks`)

- [ ] **Step 1: After `renderBlocks` resolves, store the pluginData keys**

Find this code (around line 163):

```typescript
const result: RenderResult = await renderBlocks(nameNoExt, blocks, settings, target as SceneNode);
updatedCount++;
totalImageFailures += result.imageFailures;
```

Add immediately after:

```typescript
// Store source for round-trip export. Skip if > 50 KB to avoid pluginData limits.
if (file.content.length <= 50_000) {
    result.frame.setPluginData('markdownSource', file.content);
    result.frame.setPluginData('markdownFilename', file.name);
    result.frame.setPluginData('markdownImportedAt', Date.now().toString());
} else {
    result.frame.setPluginData('markdownSourceTruncated', 'true');
}
```

- [ ] **Step 2: Run tests**

```bash
npx jest --verbose
```

- [ ] **Step 3: Commit**

```bash
git add figma-markdown-sync/code.ts
git commit -m "feat: store markdownSource pluginData on import for round-trip export"
```

---

## Chunk 2: Layer-Tree Inference Engine

### Task 5: Create exporter.ts with types, helpers, and text-node inference

**Files:**
- Create: `figma-markdown-sync/exporter.ts`
- Create: `figma-markdown-sync/exporter.test.ts`

- [ ] **Step 1: Write failing tests for type definitions and basic helpers**

Create `figma-markdown-sync/exporter.test.ts`:

```typescript
/**
 * Tests for exporter.ts — inference, diff engine, and Markdown assembly.
 */
import {
    inferBlocksFromFrame,
    normalizeContent,
    fingerprintBlock,
    diffBlocks,
    assembleMarkdown,
} from './exporter';
import type { InferredBlock, DiffBlock, BlockSelection } from './exporter';

// ── Test helpers ─────────────────────────────────────────────────────────────

function makeTextNode(overrides: Partial<any> = {}): any {
    return {
        type: 'TEXT',
        name: '',
        characters: 'Hello world',
        _pluginData: {} as Record<string, string>,
        getPluginData: jest.fn(function(this: any, k: string) { return this._pluginData[k] ?? ''; }),
        getTextStyleIdAsync: jest.fn().mockResolvedValue(''),
        ...overrides,
    };
}

function makeRectNode(overrides: Partial<any> = {}): any {
    return {
        type: 'RECTANGLE',
        name: '',
        width: 800,
        height: 1,
        fills: [{ type: 'SOLID' }],
        ...overrides,
    };
}

function makeFrame(name: string, children: any[] = [], overrides: Partial<any> = {}): any {
    return {
        type: 'FRAME',
        name,
        children,
        _pluginData: {} as Record<string, string>,
        getPluginData: jest.fn(function(this: any, k: string) { return this._pluginData[k] ?? ''; }),
        ...overrides,
    };
}

// ── normalizeContent ─────────────────────────────────────────────────────────

describe('normalizeContent', () => {
    it('strips leading and trailing whitespace', () => {
        expect(normalizeContent('  hello  ')).toBe('hello');
    });

    it('collapses internal whitespace runs to a single space', () => {
        expect(normalizeContent('foo   bar\tbaz')).toBe('foo bar baz');
    });

    it('returns empty string for blank input', () => {
        expect(normalizeContent('   ')).toBe('');
    });
});

// ── fingerprintBlock ─────────────────────────────────────────────────────────

describe('fingerprintBlock', () => {
    it('produces type:normalizedContent string', () => {
        expect(fingerprintBlock('heading', '  Hello World  ')).toBe('heading:Hello World');
    });

    it('is case-sensitive', () => {
        expect(fingerprintBlock('paragraph', 'Foo')).not.toBe(fingerprintBlock('paragraph', 'foo'));
    });
});

// ── inferBlocksFromFrame — text and separator nodes ───────────────────────────

describe('inferBlocksFromFrame — text nodes', () => {
    beforeEach(() => jest.clearAllMocks());

    it('infers H1 from a text node with Markdown/H1 style name', async () => {
        const text = makeTextNode({ characters: 'My Title' });
        (figma.getStyleByIdAsync as jest.Mock).mockResolvedValue({ name: 'Markdown/H1' });
        text.getTextStyleIdAsync.mockResolvedValue('style-id-h1');
        const frame = makeFrame('Test', [text]);

        const { blocks } = await inferBlocksFromFrame(frame);
        expect(blocks).toHaveLength(1);
        expect(blocks[0].text).toBe('# My Title');
        expect(blocks[0].blockType).toBe('heading-1');
    });

    it('infers paragraph from Markdown/Body style', async () => {
        const text = makeTextNode({ characters: 'Some body text' });
        (figma.getStyleByIdAsync as jest.Mock).mockResolvedValue({ name: 'Markdown/Body' });
        text.getTextStyleIdAsync.mockResolvedValue('style-id-body');
        const frame = makeFrame('Test', [text]);

        const { blocks } = await inferBlocksFromFrame(frame);
        expect(blocks[0].text).toBe('Some body text');
        expect(blocks[0].blockType).toBe('paragraph');
    });

    it('infers separator from a 1px-tall RECTANGLE node', async () => {
        const rect = makeRectNode({ height: 1 });
        const frame = makeFrame('Test', [rect]);

        const { blocks } = await inferBlocksFromFrame(frame);
        expect(blocks).toHaveLength(1);
        expect(blocks[0].text).toBe('---');
        expect(blocks[0].blockType).toBe('separator');
    });

    it('skips unknown nodes and records them in skippedLayers', async () => {
        const unknown = { type: 'ELLIPSE', name: 'Shape', children: [] };
        const frame = makeFrame('Test', [unknown]);

        const { blocks, skippedLayers } = await inferBlocksFromFrame(frame);
        expect(blocks).toHaveLength(0);
        expect(skippedLayers[0].name).toBe('Shape');
    });
});
```

- [ ] **Step 2: Run to confirm they fail**

```bash
npx jest exporter --verbose
```
Expected: FAIL — `exporter.ts` not found.

- [ ] **Step 3: Create `exporter.ts` with types and helpers**

Create `figma-markdown-sync/exporter.ts`:

```typescript
/**
 * exporter.ts
 *
 * Figma → Markdown export pipeline.
 *
 * Stages:
 *   1. inferBlocksFromFrame  — walk layer tree, produce InferredBlock[]
 *   2. diffBlocks            — compare inferred vs stored source blocks
 *   3. assembleMarkdown      — merge diff result into final Markdown string
 *
 * This module only reads existing Figma nodes — no rendering occurs here.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InferredBlock {
    text: string;
    blockType: string;
    label: string;
    fidelityWarning?: string;
}

export interface DiffBlock {
    state: 'unchanged' | 'modified' | 'new';
    originalText?: string;
    inferredText: string;
    label: string;
    fidelityWarning?: string;
}

export interface ExportFrameResult {
    frameId: string;
    filename: string;
    hasStoredSource: boolean;
    sourceTruncated: boolean;
    blocks: DiffBlock[];
    skippedLayers: Array<{ name: string; reason: string }>;
}

export interface BlockSelection {
    blockIndex: number;
    useOriginal: boolean;
}

// ─── Helpers (exported for testing) ──────────────────────────────────────────

/** Strips leading/trailing whitespace and collapses internal runs to one space. */
export function normalizeContent(text: string): string {
    return text.trim().replace(/\s+/g, ' ');
}

/** Produces a stable fingerprint: "type:normalizedContent" */
export function fingerprintBlock(blockType: string, content: string): string {
    return `${blockType}:${normalizeContent(content)}`;
}

// ─── Style name → block type mapping ─────────────────────────────────────────

const STYLE_TO_BLOCK: Record<string, { blockType: string; label: string; prefix: string }> = {
    'Markdown/H1':    { blockType: 'heading-1', label: 'Heading 1',  prefix: '# '  },
    'Markdown/H2':    { blockType: 'heading-2', label: 'Heading 2',  prefix: '## ' },
    'Markdown/H3':    { blockType: 'heading-3', label: 'Heading 3',  prefix: '### '},
    'Markdown/Body':  { blockType: 'paragraph', label: 'Paragraph',  prefix: ''    },
    'Markdown/Code':  { blockType: 'code',      label: 'Code Block', prefix: ''    },
    'Markdown/Quote': { blockType: 'quote',     label: 'Blockquote', prefix: '> '  },
    'Markdown/List':  { blockType: 'list',      label: 'List Item',  prefix: '- '  },
};

const FRAME_NAME_TO_BLOCK: Record<string, string> = {
    'Table':             'table',
    'List Group':        'listGroup',
    'Table of Contents': 'toc',
    'Definition List':   'definitionList',
    'Footnotes':         'footnoteSection',
    'Badge Row':         'badgeRow',
    'Mermaid Diagram':   'mermaid',
    'Math Block':        'math',
};

// ─── Inference ────────────────────────────────────────────────────────────────

interface InferenceResult {
    blocks: InferredBlock[];
    skippedLayers: Array<{ name: string; reason: string }>;
}

export async function inferBlocksFromFrame(frame: any): Promise<InferenceResult> {
    const blocks: InferredBlock[] = [];
    const skippedLayers: Array<{ name: string; reason: string }> = [];

    for (const child of (frame.children ?? [])) {
        const inferred = await inferNode(child);
        if (inferred) {
            blocks.push(inferred);
        } else {
            skippedLayers.push({ name: child.name || '(unnamed)', reason: 'Unrecognized layer type or name' });
        }
    }

    return { blocks, skippedLayers };
}

async function inferNode(node: any): Promise<InferredBlock | null> {
    if (node.type === 'RECTANGLE' && node.height === 1) {
        return { text: '---', blockType: 'separator', label: 'Separator' };
    }

    if (node.type === 'RECTANGLE' && node.height > 1 &&
        Array.isArray(node.fills) && node.fills[0]?.type === 'IMAGE') {
        return {
            text: `![${node.name || 'image'}](image-not-recoverable)`,
            blockType: 'image',
            label: 'Image',
            fidelityWarning: 'Image URL not recoverable — update the URL manually after export.',
        };
    }

    if (node.type === 'TEXT') return inferTextNode(node);
    if (node.type === 'FRAME') return inferFrameNode(node);

    return null;
}

async function inferTextNode(node: any): Promise<InferredBlock | null> {
    const styleId = await node.getTextStyleIdAsync();
    const style = styleId ? await figma.getStyleByIdAsync(styleId) : null;
    const styleName: string = style?.name ?? '';
    const mapping = STYLE_TO_BLOCK[styleName];
    if (!mapping) return null;

    const text = node.characters as string;
    if (mapping.blockType === 'code') {
        return { text: `\`\`\`\n${text}\n\`\`\``, blockType: 'code', label: 'Code Block' };
    }
    return { text: mapping.prefix + text, blockType: mapping.blockType, label: mapping.label };
}

async function inferFrameNode(node: any): Promise<InferredBlock | null> {
    const blockType = FRAME_NAME_TO_BLOCK[node.name];

    if (!blockType) {
        if (node.name?.startsWith('Callout: ')) return inferCalloutFrame(node);
        return null;
    }

    switch (blockType) {
        case 'table':           return inferTableFrame(node);
        case 'listGroup':       return inferListGroupFrame(node);
        case 'mermaid':         return inferMermaidFrame(node);
        case 'math':            return inferMathFrame(node);
        case 'definitionList':  return inferDefinitionListFrame(node);
        case 'footnoteSection': return inferFootnotesFrame(node);
        case 'badgeRow':        return inferBadgeRowFrame(node);
        case 'toc':
            return {
                text: '',
                blockType: 'toc',
                label: 'Table of Contents',
                fidelityWarning: 'TOC is auto-generated on re-import — skipped in export output.',
            };
        default: return null;
    }
}

function inferMermaidFrame(node: any): InferredBlock {
    const source: string = node.getPluginData('mermaidSource');
    return {
        text: `\`\`\`mermaid\n${source}\n\`\`\``,
        blockType: 'mermaid',
        label: 'Mermaid Diagram',
        fidelityWarning: source.length === 0 ? 'Mermaid source not recoverable — original source used if available.' : undefined,
    };
}

function inferMathFrame(node: any): InferredBlock {
    const source: string = node.getPluginData('mathSource');
    return {
        text: `$$\n${source}\n$$`,
        blockType: 'math',
        label: 'Math Block',
        fidelityWarning: source.length === 0 ? 'Math source not recoverable — original source used if available.' : undefined,
    };
}

function inferCalloutFrame(node: any): InferredBlock {
    const typeLabel = node.name.replace('Callout: ', '').toUpperCase();
    const bodyLines: string[] = [];
    for (const child of (node.children ?? [])) {
        if (child.type === 'TEXT' && child.characters) {
            bodyLines.push(`> ${child.characters}`);
        }
    }
    return {
        text: `> [!${typeLabel}]\n${bodyLines.join('\n')}`,
        blockType: 'callout',
        label: `Callout (${typeLabel})`,
    };
}

async function inferListGroupFrame(node: any): Promise<InferredBlock> {
    const lines: string[] = [];
    for (const child of (node.children ?? [])) {
        if (child.type === 'TEXT') {
            lines.push(`- ${child.characters}`);
        } else if (child.type === 'FRAME') {
            for (const grandchild of (child.children ?? [])) {
                if (grandchild.type === 'TEXT' && grandchild.characters) {
                    const isChecked = child.name === 'Task (done)';
                    lines.push(`- [${isChecked ? 'x' : ' '}] ${grandchild.characters}`);
                    break;
                }
            }
        }
    }
    return { text: lines.join('\n'), blockType: 'listGroup', label: 'List' };
}

function inferTableFrame(node: any): InferredBlock {
    const rows: string[][] = [];
    for (const child of (node.children ?? [])) {
        const rowCells: string[] = [];
        for (const cell of (child.children ?? [])) {
            const textNode = (cell.children ?? []).find((n: any) => n.type === 'TEXT');
            rowCells.push(textNode?.characters ?? '');
        }
        if (rowCells.length > 0) rows.push(rowCells);
    }
    if (rows.length === 0) return { text: '', blockType: 'table', label: 'Table' };
    const toRow = (cells: string[]) => `| ${cells.join(' | ')} |`;
    const sep = rows[0].map(() => '---');
    return {
        text: [toRow(rows[0]), toRow(sep), ...rows.slice(1).map(toRow)].join('\n'),
        blockType: 'table',
        label: 'Table',
    };
}

function inferDefinitionListFrame(node: any): InferredBlock {
    const lines: string[] = [];
    const texts = (node.children ?? []).filter((n: any) => n.type === 'TEXT');
    for (let i = 0; i < texts.length; i += 2) {
        if (texts[i]) lines.push(texts[i].characters);
        if (texts[i + 1]) lines.push(`: ${texts[i + 1].characters}`);
    }
    return { text: lines.join('\n'), blockType: 'definitionList', label: 'Definition List' };
}

function inferFootnotesFrame(node: any): InferredBlock {
    const lines: string[] = [];
    const texts = (node.children ?? []).filter((n: any) => n.type === 'TEXT');
    texts.forEach((t: any, i: number) => { lines.push(`[^${i + 1}]: ${t.characters}`); });
    return { text: lines.join('\n'), blockType: 'footnoteSection', label: 'Footnotes' };
}

function inferBadgeRowFrame(node: any): InferredBlock {
    const badges = (node.children ?? [])
        .filter((c: any) => c.name?.startsWith('Badge: '))
        .map((c: any) => `[badge:${c.name.replace('Badge: ', '')}]`);
    return { text: badges.join(' '), blockType: 'badgeRow', label: 'Badge Row' };
}
```

- [ ] **Step 4: Run tests**

```bash
npx jest exporter --verbose
```
Expected: normalizeContent, fingerprintBlock, and inference tests pass.

- [ ] **Step 5: Commit**

```bash
git add figma-markdown-sync/exporter.ts figma-markdown-sync/exporter.test.ts
git commit -m "feat: create exporter.ts with inference engine for all 18 block types"
```

---

## Chunk 3: Diff Engine and Markdown Assembly

### Task 6: Implement diffBlocks

**Files:**
- Modify: `figma-markdown-sync/exporter.ts`
- Modify: `figma-markdown-sync/exporter.test.ts`

- [ ] **Step 1: Write failing tests for diffBlocks**

Add to `exporter.test.ts`:

```typescript
// ── diffBlocks ────────────────────────────────────────────────────────────────

describe('diffBlocks', () => {
    const makeInferred = (blockType: string, text: string, label = blockType): InferredBlock =>
        ({ text, blockType, label });

    it('marks blocks as unchanged when fingerprints match', () => {
        const result = diffBlocks(['# Hello World'], [makeInferred('heading-1', '# Hello World', 'Heading 1')]);
        expect(result[0].state).toBe('unchanged');
        expect(result[0].originalText).toBe('# Hello World');
    });

    it('marks blocks as modified when same position, different content', () => {
        const result = diffBlocks(['# Old Title'], [makeInferred('heading-1', '# New Title', 'Heading 1')]);
        expect(result[0].state).toBe('modified');
        expect(result[0].originalText).toBe('# Old Title');
        expect(result[0].inferredText).toBe('# New Title');
    });

    it('marks blocks as new when no source block exists', () => {
        const result = diffBlocks([], [makeInferred('paragraph', 'New paragraph', 'Paragraph')]);
        expect(result[0].state).toBe('new');
        expect(result[0].originalText).toBeUndefined();
    });

    it('uses content-hash matching across positions (insertion tolerance)', () => {
        const source = ['First paragraph', 'Second paragraph'];
        const inferred = [
            makeInferred('paragraph', 'Brand new intro', 'Paragraph'),
            makeInferred('paragraph', 'First paragraph', 'Paragraph'),
            makeInferred('paragraph', 'Second paragraph', 'Paragraph'),
        ];
        const result = diffBlocks(source, inferred);
        expect(result.find(b => b.inferredText === 'Brand new intro')?.state).toBe('new');
        expect(result.find(b => b.inferredText === 'First paragraph')?.state).toBe('unchanged');
        expect(result.find(b => b.inferredText === 'Second paragraph')?.state).toBe('unchanged');
    });

    it('returns empty array when both inputs are empty', () => {
        expect(diffBlocks([], [])).toEqual([]);
    });
});
```

- [ ] **Step 2: Run to confirm they fail**

```bash
npx jest exporter --verbose
```

- [ ] **Step 3: Implement `diffBlocks` and `guessBlockType` in exporter.ts**

Add after the inference functions:

```typescript
// ─── Diff engine ─────────────────────────────────────────────────────────────

/**
 * Heuristic: infer block type from Markdown text prefix, for fingerprinting
 * source lines that were not produced by the inference engine.
 */
function guessBlockType(text: string): string {
    if (text.startsWith('# '))   return 'heading-1';
    if (text.startsWith('## '))  return 'heading-2';
    if (text.startsWith('### ')) return 'heading-3';
    if (text.startsWith('> [!')) return 'callout';
    if (text.startsWith('> '))   return 'quote';
    if (text.startsWith('- ') || text.startsWith('* ')) return 'list';
    if (text.startsWith('---'))  return 'separator';
    if (text.startsWith('```'))  return 'code';
    if (text.startsWith('$$'))   return 'math';
    if (text.startsWith('|'))    return 'table';
    return 'paragraph';
}

/**
 * Diffs source Markdown strings against inferred blocks using content-hash
 * matching with position+type as fallback.
 *
 * @param sourceLines - Markdown strings from stored pluginData, split by double-newline.
 * @param inferredBlocks - Output of inferBlocksFromFrame.
 */
export function diffBlocks(sourceLines: string[], inferredBlocks: InferredBlock[]): DiffBlock[] {
    // Build source fingerprint map for O(1) content-hash lookup
    const sourceByFingerprint = new Map<string, string>();
    for (const line of sourceLines) {
        const fp = fingerprintBlock(guessBlockType(line), line);
        sourceByFingerprint.set(fp, line);
    }

    const usedSourceIndices = new Set<number>();
    const result: DiffBlock[] = [];

    for (let i = 0; i < inferredBlocks.length; i++) {
        const inferred = inferredBlocks[i];
        const fp = fingerprintBlock(inferred.blockType, inferred.text);

        // 1. Content-hash match — position-independent
        if (sourceByFingerprint.has(fp)) {
            const originalText = sourceByFingerprint.get(fp)!;
            sourceByFingerprint.delete(fp); // consume to prevent duplicate matches
            result.push({ state: 'unchanged', originalText, inferredText: inferred.text, label: inferred.label, fidelityWarning: inferred.fidelityWarning });
            continue;
        }

        // 2. Position+type fallback
        const sourceLine = sourceLines[i];
        if (sourceLine !== undefined && guessBlockType(sourceLine) === inferred.blockType && !usedSourceIndices.has(i)) {
            usedSourceIndices.add(i);
            result.push({ state: 'modified', originalText: sourceLine, inferredText: inferred.text, label: inferred.label, fidelityWarning: inferred.fidelityWarning });
            continue;
        }

        // 3. New block
        result.push({ state: 'new', inferredText: inferred.text, label: inferred.label, fidelityWarning: inferred.fidelityWarning });
    }

    return result;
}
```

- [ ] **Step 4: Run tests**

```bash
npx jest exporter --verbose
```
Expected: all diffBlocks tests pass.

- [ ] **Step 5: Commit**

```bash
git add figma-markdown-sync/exporter.ts figma-markdown-sync/exporter.test.ts
git commit -m "feat: implement content-hash diff engine in exporter"
```

---

### Task 7: Implement assembleMarkdown and exportFrame

**Files:**
- Modify: `figma-markdown-sync/exporter.ts`
- Modify: `figma-markdown-sync/exporter.test.ts`

- [ ] **Step 1: Write failing tests for assembleMarkdown**

Add to `exporter.test.ts`:

```typescript
// ── assembleMarkdown ──────────────────────────────────────────────────────────

describe('assembleMarkdown', () => {
    it('uses originalText for unchanged blocks (preserves inline formatting)', () => {
        const blocks: DiffBlock[] = [
            { state: 'unchanged', originalText: '# My [linked](url) Heading', inferredText: '# My linked Heading', label: 'Heading 1' },
        ];
        expect(assembleMarkdown(blocks, [])).toBe('# My [linked](url) Heading');
    });

    it('uses inferredText for new blocks', () => {
        const blocks: DiffBlock[] = [{ state: 'new', inferredText: 'New paragraph', label: 'Paragraph' }];
        expect(assembleMarkdown(blocks, [])).toBe('New paragraph');
    });

    it('uses originalText by default for modified blocks (conservative)', () => {
        const blocks: DiffBlock[] = [
            { state: 'modified', originalText: 'Old text', inferredText: 'New text', label: 'Paragraph' },
        ];
        expect(assembleMarkdown(blocks, [])).toBe('Old text');
    });

    it('respects BlockSelection to use inferred for modified block', () => {
        const blocks: DiffBlock[] = [
            { state: 'modified', originalText: 'Old text', inferredText: 'New text', label: 'Paragraph' },
        ];
        expect(assembleMarkdown(blocks, [{ blockIndex: 0, useOriginal: false }])).toBe('New text');
    });

    it('respects BlockSelection useOriginal=true to skip a new block', () => {
        const blocks: DiffBlock[] = [{ state: 'new', inferredText: 'Unwanted', label: 'Paragraph' }];
        expect(assembleMarkdown(blocks, [{ blockIndex: 0, useOriginal: true }])).toBe('');
    });

    it('separates blocks with a blank line', () => {
        const blocks: DiffBlock[] = [
            { state: 'unchanged', originalText: '# Title', inferredText: '# Title', label: 'Heading 1' },
            { state: 'new', inferredText: 'Body text', label: 'Paragraph' },
        ];
        expect(assembleMarkdown(blocks, [])).toBe('# Title\n\nBody text');
    });
});
```

- [ ] **Step 2: Run to confirm they fail**

```bash
npx jest exporter --verbose
```

- [ ] **Step 3: Implement `assembleMarkdown` and `exportFrame`**

Add to `exporter.ts`:

```typescript
// ─── Assembly ─────────────────────────────────────────────────────────────────

/**
 * Merges DiffBlocks into a final Markdown string.
 *
 * Defaults per state:
 *   unchanged → originalText (preserves inline links, footnotes, etc.)
 *   modified  → originalText (conservative; user can override in review mode)
 *   new       → inferredText (include by default)
 *
 * For 'new' blocks: useOriginal = true means "skip this block".
 * Blocks are joined with a single blank line between them.
 */
export function assembleMarkdown(blocks: DiffBlock[], selections: BlockSelection[]): string {
    const selMap = new Map(selections.map(s => [s.blockIndex, s.useOriginal]));
    const lines: string[] = [];

    for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        const override = selMap.get(i);
        let text: string;

        if (block.state === 'unchanged') {
            text = block.originalText!;
        } else if (block.state === 'modified') {
            const useOriginal = override !== undefined ? override : true;
            text = useOriginal ? block.originalText! : block.inferredText;
        } else {
            if (override === true) continue; // skip
            text = block.inferredText;
        }

        if (text.trim().length > 0) lines.push(text);
    }

    return lines.join('\n\n');
}

// ─── Top-level export function ────────────────────────────────────────────────

/**
 * Runs the full 4-stage export pipeline for a single Figma FrameNode.
 * Returns an ExportFrameResult ready to send to the UI via postMessage.
 */
export async function exportFrame(frame: any): Promise<ExportFrameResult> {
    const frameId: string = frame.id;
    const storedSource: string = frame.getPluginData('markdownSource');
    const storedFilename: string = frame.getPluginData('markdownFilename');
    const sourceTruncated: boolean = frame.getPluginData('markdownSourceTruncated') === 'true';
    const hasStoredSource: boolean = storedSource.length > 0 && !sourceTruncated;

    const rawFilename = storedFilename || frame.name || 'export';
    const filename = rawFilename.replace(/\.md$/i, '') + '.md';

    const { blocks: inferredBlocks, skippedLayers } = await inferBlocksFromFrame(frame);

    let diffResult: DiffBlock[];

    if (hasStoredSource) {
        const sourceLines = storedSource
            .split(/\n\n+/)
            .map((s: string) => s.trim())
            .filter((s: string) => s.length > 0);
        diffResult = diffBlocks(sourceLines, inferredBlocks);
    } else {
        diffResult = inferredBlocks.map(b => ({
            state: 'new' as const,
            inferredText: b.text,
            label: b.label,
            fidelityWarning: b.fidelityWarning,
        }));
    }

    return { frameId, filename, hasStoredSource, sourceTruncated, blocks: diffResult, skippedLayers };
}
```

- [ ] **Step 4: Run all tests**

```bash
npx jest --verbose
```
Expected: all tests pass.

- [ ] **Step 5: Build**

```bash
npm run build
```
Expected: no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add figma-markdown-sync/exporter.ts figma-markdown-sync/exporter.test.ts
git commit -m "feat: implement assembleMarkdown and exportFrame pipeline"
```

---

### Task 8: Wire export handlers in code.ts

**Files:**
- Modify: `figma-markdown-sync/code.ts`

- [ ] **Step 1: Add imports to code.ts**

Add to the import block at the top of `code.ts`:

```typescript
import { exportFrame, assembleMarkdown } from './exporter';
import {
    MSG_EXPORT_REQUEST, MSG_EXPORT_DOWNLOAD, MSG_GET_SELECTION,
    MSG_EXPORT_RESULT, MSG_EXPORT_MARKDOWN, MSG_SELECTION_CHANGED,
} from './messages';
```

- [ ] **Step 2: Add export message handlers**

Inside the `figma.ui.onmessage` block, after the `MSG_CLEAR_HISTORY` handler, add:

```typescript
if (msg.type === MSG_GET_SELECTION) {
    const selectedFrameIds = figma.currentPage.selection
        .filter(n => n.type === 'FRAME')
        .map(n => n.id);
    figma.ui.postMessage({ type: MSG_SELECTION_CHANGED, frameIds: selectedFrameIds });
    return;
}

if (msg.type === MSG_EXPORT_REQUEST) {
    const frameIds: string[] = msg.frameIds ?? [];
    const results = [];
    for (const id of frameIds) {
        const node = await figma.getNodeByIdAsync(id);
        if (!node || node.type !== 'FRAME') continue;
        try {
            results.push(await exportFrame(node));
        } catch (err) {
            console.error(`[MarkDown For What] Export failed for frame ${id}:`, err);
        }
    }
    figma.ui.postMessage({ type: MSG_EXPORT_RESULT, frames: results });
    return;
}

if (msg.type === MSG_EXPORT_DOWNLOAD) {
    const node = await figma.getNodeByIdAsync(msg.frameId);
    if (!node || node.type !== 'FRAME') {
        figma.ui.postMessage({ type: MSG_STATUS, message: 'Frame not found.', error: true });
        return;
    }
    const result = await exportFrame(node);
    const content = assembleMarkdown(result.blocks, msg.selections ?? []);
    figma.ui.postMessage({ type: MSG_EXPORT_MARKDOWN, filename: result.filename, content });
    return;
}
```

- [ ] **Step 3: Add selectionchange listener**

Inside the plugin initialization IIFE in `code.ts`, after `figma.ui.onmessage = ...`:

```typescript
figma.on('selectionchange', () => {
    const selectedFrameIds = figma.currentPage.selection
        .filter(n => n.type === 'FRAME')
        .map(n => n.id);
    figma.ui.postMessage({ type: MSG_SELECTION_CHANGED, frameIds: selectedFrameIds });
});
```

- [ ] **Step 4: Run tests and build**

```bash
npx jest --verbose && npm run build
```
Expected: all tests pass, no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add figma-markdown-sync/code.ts
git commit -m "feat: wire export and selection handlers in code.ts"
```

---

## Chunk 4: Export Tab UI

### Task 9: Add Export tab to ui.html

**Files:**
- Modify: `figma-markdown-sync/ui.html`

- [ ] **Step 1: Add Export tab button**

Find the tab button row (elements with `class="tab"` and `data-tab` attributes). Add:

```html
<button class="tab" data-tab="export">Export</button>
```

- [ ] **Step 2: Add Export tab panel**

After the last existing tab panel `</section>`, add:

```html
<section id="export-panel" class="tab-panel" hidden>
  <div id="export-no-selection" class="export-empty">
    <p>Select one or more frames on the canvas to export them as Markdown.</p>
  </div>

  <div id="export-frame-summary" hidden>
    <div id="export-frame-info"></div>
    <div id="export-block-counts"></div>
    <div id="export-truncated-warning" class="export-warning" hidden>
      Source too large to store — using current state only.
    </div>
    <div id="export-actions">
      <button id="export-btn" class="btn-primary" disabled>Export .md</button>
      <button id="export-review-btn" class="btn-secondary" hidden>Review changes</button>
    </div>
  </div>

  <div id="export-review-panel" hidden>
    <div id="export-review-breadcrumb" hidden></div>
    <div id="export-review-blocks"></div>
    <button id="export-review-back" class="btn-link">Back to export</button>
    <button id="export-confirm-btn" class="btn-primary">Export .md</button>
  </div>

  <div id="export-log-panel" hidden>
    <details>
      <summary>Export log</summary>
      <pre id="export-log-content"></pre>
    </details>
  </div>
</section>
```

- [ ] **Step 3: Build and verify tab appears**

```bash
npm run build
```
Load plugin in Figma. Confirm Export tab shows and clicking it reveals the empty state.

- [ ] **Step 4: Commit**

```bash
git add figma-markdown-sync/ui.html
git commit -m "feat: add Export tab panel to plugin UI"
```

---

### Task 10: Implement Export tab logic in ui.ts

**Files:**
- Modify: `figma-markdown-sync/src/ui.ts`
- Modify: `figma-markdown-sync/src/styles.css`

**Security note:** All user-derived content (frame names, block text, layer names) must be passed through the existing `escapeHtml()` function before being set as innerHTML. Plain structural HTML (buttons, divs, labels) does not require escaping.

- [ ] **Step 1: Add imports for new message types in ui.ts**

Add to the import statement in `ui.ts`:

```typescript
import {
    MSG_EXPORT_REQUEST, MSG_EXPORT_DOWNLOAD, MSG_GET_SELECTION,
    MSG_EXPORT_RESULT, MSG_EXPORT_MARKDOWN, MSG_SELECTION_CHANGED,
} from '../messages';
import type { DiffBlock, BlockSelection, ExportFrameResult } from '../exporter';
```

- [ ] **Step 2: Add DOM references**

Add alongside existing DOM references:

```typescript
const exportNoSelection      = document.getElementById('export-no-selection') as HTMLElement;
const exportFrameSummary     = document.getElementById('export-frame-summary') as HTMLElement;
const exportFrameInfo        = document.getElementById('export-frame-info') as HTMLElement;
const exportBlockCounts      = document.getElementById('export-block-counts') as HTMLElement;
const exportTruncatedWarning = document.getElementById('export-truncated-warning') as HTMLElement;
const exportBtn              = document.getElementById('export-btn') as HTMLButtonElement;
const exportReviewBtn        = document.getElementById('export-review-btn') as HTMLButtonElement;
const exportReviewPanel      = document.getElementById('export-review-panel') as HTMLElement;
const exportReviewBreadcrumb = document.getElementById('export-review-breadcrumb') as HTMLElement;
const exportReviewBlocks     = document.getElementById('export-review-blocks') as HTMLElement;
const exportReviewBack       = document.getElementById('export-review-back') as HTMLButtonElement;
const exportConfirmBtn       = document.getElementById('export-confirm-btn') as HTMLButtonElement;
const exportLogPanel         = document.getElementById('export-log-panel') as HTMLElement;
const exportLogContent       = document.getElementById('export-log-content') as HTMLElement;
```

- [ ] **Step 3: Add export state variables**

```typescript
let exportFrameResults: ExportFrameResult[] = [];
let exportReviewSelections: Map<number, Map<number, boolean>> = new Map();
let exportCurrentFrameIndex = 0;
let pendingDownloadIndex = 0;
```

- [ ] **Step 4: Implement export UI helpers**

Add the following functions to `ui.ts`. All innerHTML assignments use `escapeHtml()` on any user-provided text:

```typescript
function showExportNoSelection() {
    exportNoSelection.hidden = false;
    exportFrameSummary.hidden = true;
    exportReviewPanel.hidden = true;
}

function renderExportSummary(frames: ExportFrameResult[]) {
    exportFrameResults = frames;
    exportReviewSelections = new Map();
    exportNoSelection.hidden = true;
    exportReviewPanel.hidden = true;

    if (frames.length === 0) { showExportNoSelection(); return; }

    exportFrameSummary.hidden = false;
    const frame = frames[0];

    exportFrameInfo.textContent = frames.length === 1
        ? `"${frame.filename.replace('.md', '')}"`
        : `${frames.length} frames selected`;

    exportTruncatedWarning.hidden = !frame.sourceTruncated;

    const unchanged = frames.reduce((n, f) => n + f.blocks.filter(b => b.state === 'unchanged').length, 0);
    const modified  = frames.reduce((n, f) => n + f.blocks.filter(b => b.state === 'modified').length, 0);
    const added     = frames.reduce((n, f) => n + f.blocks.filter(b => b.state === 'new').length, 0);

    if (!frame.hasStoredSource && frames.length === 1) {
        exportBlockCounts.textContent = added === 0
            ? 'No Markdown content detected. This frame may not use Markdown/* styles.'
            : `${added} block${added !== 1 ? 's' : ''} inferred`;
        exportBtn.disabled = added === 0;
        exportReviewBtn.hidden = true;
    } else {
        const parts = [
            unchanged > 0 ? `${unchanged} unchanged ✓` : '',
            modified  > 0 ? `${modified} modified ↻`  : '',
            added     > 0 ? `${added} added +`         : '',
        ].filter(Boolean);
        exportBlockCounts.textContent = parts.join('  ');
        exportBtn.disabled = false;
        exportBtn.textContent = frames.length > 1 ? `Export all (${frames.length} files)` : 'Export .md';
        exportReviewBtn.hidden = (modified + added) === 0;
    }
}

function renderReviewPanel(frameIndex: number) {
    exportCurrentFrameIndex = frameIndex;
    const frame = exportFrameResults[frameIndex];
    if (!frame) return;

    exportFrameSummary.hidden = true;
    exportReviewPanel.hidden = false;

    if (exportFrameResults.length > 1) {
        exportReviewBreadcrumb.textContent = `Frame ${frameIndex + 1} of ${exportFrameResults.length}: ${frame.filename}`;
        exportReviewBreadcrumb.hidden = false;
    } else {
        exportReviewBreadcrumb.hidden = true;
    }

    // Clear existing content using safe DOM method
    while (exportReviewBlocks.firstChild) exportReviewBlocks.removeChild(exportReviewBlocks.firstChild);

    const reviewable = frame.blocks.filter(b => b.state !== 'unchanged');
    const frameSelections = exportReviewSelections.get(frameIndex) ?? new Map<number, boolean>();

    reviewable.forEach(block => {
        const blockIndex = frame.blocks.indexOf(block);
        const defaultUseOriginal = block.state === 'modified';
        const useOriginal = frameSelections.has(blockIndex) ? frameSelections.get(blockIndex)! : defaultUseOriginal;

        const el = document.createElement('div');
        el.className = `review-block review-block--${block.state}`;

        // Header
        const header = document.createElement('div');
        header.className = 'review-block-header';
        header.textContent = `${block.state === 'modified' ? '↻' : '+'} ${block.label} (${block.state})`;
        el.appendChild(header);

        // Fidelity warning (safe — static string from our code, not user input)
        if (block.fidelityWarning) {
            const warn = document.createElement('div');
            warn.className = 'review-fidelity-warning';
            warn.textContent = `⚠ ${block.fidelityWarning}`;
            el.appendChild(warn);
        }

        // Diff panes
        const diff = document.createElement('div');
        diff.className = 'review-diff';

        if (block.originalText !== undefined) {
            const origCol = document.createElement('div');
            origCol.className = 'review-diff-col';
            const origLabel = document.createElement('div');
            origLabel.className = 'review-diff-header';
            origLabel.textContent = 'Original';
            const origPre = document.createElement('pre');
            origPre.className = 'review-diff-text';
            origPre.textContent = block.originalText; // textContent is safe — no HTML injection
            origCol.appendChild(origLabel);
            origCol.appendChild(origPre);
            diff.appendChild(origCol);
        }

        const currCol = document.createElement('div');
        currCol.className = 'review-diff-col';
        const currLabel = document.createElement('div');
        currLabel.className = 'review-diff-header';
        currLabel.textContent = 'Current';
        const currPre = document.createElement('pre');
        currPre.className = 'review-diff-text';
        currPre.textContent = block.inferredText; // textContent is safe
        currCol.appendChild(currLabel);
        currCol.appendChild(currPre);
        diff.appendChild(currCol);
        el.appendChild(diff);

        // Action buttons
        const actions = document.createElement('div');
        actions.className = 'review-block-actions';

        const makeBtn = (label: string, blockIdx: number, useOrig: boolean, active: boolean) => {
            const btn = document.createElement('button');
            btn.className = `btn-review${active ? ' btn-review--active' : ''}`;
            btn.textContent = label;
            btn.addEventListener('click', () => {
                const sel = exportReviewSelections.get(frameIndex) ?? new Map<number, boolean>();
                sel.set(blockIdx, useOrig);
                exportReviewSelections.set(frameIndex, sel);
                renderReviewPanel(frameIndex);
            });
            return btn;
        };

        if (block.state === 'modified') {
            actions.appendChild(makeBtn('✓ Keep original', blockIndex, true, useOriginal));
            actions.appendChild(makeBtn('Use current', blockIndex, false, !useOriginal));
        } else {
            actions.appendChild(makeBtn('✓ Include', blockIndex, false, !useOriginal));
            actions.appendChild(makeBtn('Skip', blockIndex, true, useOriginal));
        }

        el.appendChild(actions);
        exportReviewBlocks.appendChild(el);
    });
}

function triggerDownload(filename: string, content: string) {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function downloadFrame(frameIndex: number) {
    const frame = exportFrameResults[frameIndex];
    if (!frame) return;
    const sel = exportReviewSelections.get(frameIndex);
    const selections: BlockSelection[] = sel
        ? Array.from(sel.entries()).map(([blockIndex, useOriginal]) => ({ blockIndex, useOriginal }))
        : [];
    parent.postMessage({ pluginMessage: { type: MSG_EXPORT_DOWNLOAD, frameId: frame.frameId, selections } }, '*');
}

function startSequentialDownload() {
    pendingDownloadIndex = 0;
    downloadFrame(pendingDownloadIndex);
}

function renderExportLog(frames: ExportFrameResult[]) {
    const lines: string[] = [];
    for (const frame of frames) {
        if (frame.skippedLayers.length > 0) {
            lines.push(`--- ${frame.filename} ---`);
            for (const s of frame.skippedLayers) {
                lines.push(`  Skipped: "${s.name}" — ${s.reason}`);
            }
        }
    }
    exportLogPanel.hidden = lines.length === 0;
    exportLogContent.textContent = lines.join('\n');
}
```

- [ ] **Step 5: Wire button event listeners**

Add after the DOM reference declarations:

```typescript
exportBtn.addEventListener('click', startSequentialDownload);

exportReviewBtn.addEventListener('click', () => renderReviewPanel(0));

exportReviewBack.addEventListener('click', () => {
    exportReviewPanel.hidden = true;
    exportFrameSummary.hidden = false;
});

exportConfirmBtn.addEventListener('click', () => downloadFrame(exportCurrentFrameIndex));
```

- [ ] **Step 6: Handle incoming export messages**

In the `window.onmessage` handler, add alongside `MSG_SETTINGS`, `MSG_STATUS`, etc.:

```typescript
if (msg.type === MSG_SELECTION_CHANGED) {
    const activePanel = document.querySelector<HTMLElement>('.tab-panel:not([hidden])');
    if (activePanel?.id === 'export-panel') {
        if (msg.frameIds.length > 0) {
            parent.postMessage({ pluginMessage: { type: MSG_EXPORT_REQUEST, frameIds: msg.frameIds } }, '*');
        } else {
            showExportNoSelection();
        }
    }
    return;
}

if (msg.type === MSG_EXPORT_RESULT) {
    renderExportSummary(msg.frames);
    renderExportLog(msg.frames);
    return;
}

if (msg.type === MSG_EXPORT_MARKDOWN) {
    triggerDownload(msg.filename, msg.content);
    pendingDownloadIndex++;
    if (pendingDownloadIndex < exportFrameResults.length) {
        setTimeout(() => downloadFrame(pendingDownloadIndex), 300);
    }
    return;
}
```

- [ ] **Step 7: Trigger selection request when Export tab is activated**

In the tab-switch handler (where `data-tab` is read), add for the `'export'` case:

```typescript
parent.postMessage({ pluginMessage: { type: MSG_GET_SELECTION } }, '*');
```

- [ ] **Step 8: Add export CSS to styles.css**

```css
/* ── Export Panel ─────────────────────────────────────────────────────────── */

.export-empty {
    padding: 24px 16px;
    color: var(--figma-color-text-secondary, #666);
    text-align: center;
    font-size: 13px;
}

#export-frame-info {
    font-weight: 600;
    font-size: 13px;
    margin-bottom: 8px;
}

#export-block-counts {
    font-size: 12px;
    margin-bottom: 16px;
    color: var(--figma-color-text-secondary, #555);
}

.export-warning {
    font-size: 12px;
    color: #9a6700;
    margin-bottom: 12px;
}

#export-actions {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
}

/* ── Review Mode ──────────────────────────────────────────────────────────── */

.review-block {
    border: 1px solid var(--figma-color-border, #e0e0e0);
    border-radius: 6px;
    padding: 12px;
    margin-bottom: 12px;
}

.review-block--modified { border-left: 3px solid #9a6700; }
.review-block--new      { border-left: 3px solid #0969da; }

.review-block-header {
    font-weight: 600;
    font-size: 12px;
    margin-bottom: 8px;
}

.review-fidelity-warning {
    font-size: 11px;
    color: #9a6700;
    margin-bottom: 8px;
}

.review-diff {
    display: flex;
    gap: 8px;
    margin-bottom: 10px;
}

.review-diff-col { flex: 1; min-width: 0; }

.review-diff-header {
    font-size: 11px;
    color: #666;
    margin-bottom: 4px;
}

.review-diff-text {
    font-size: 11px;
    font-family: 'Roboto Mono', monospace;
    white-space: pre-wrap;
    word-break: break-word;
    background: var(--figma-color-bg-secondary, #f5f5f5);
    border-radius: 4px;
    padding: 6px 8px;
    margin: 0;
}

.review-block-actions {
    display: flex;
    gap: 6px;
}

.btn-review {
    font-size: 11px;
    padding: 4px 10px;
    border-radius: 4px;
    border: 1px solid var(--figma-color-border, #ccc);
    background: transparent;
    cursor: pointer;
}

.btn-review--active {
    background: var(--figma-color-bg-brand, #18a0fb);
    color: white;
    border-color: transparent;
}

.btn-link {
    background: none;
    border: none;
    color: var(--figma-color-text-brand, #0969da);
    font-size: 12px;
    cursor: pointer;
    padding: 0;
    margin-top: 12px;
    display: block;
}

#export-log-panel { margin-top: 16px; }
#export-log-content { font-size: 11px; font-family: monospace; white-space: pre-wrap; }
```

- [ ] **Step 9: Build and manually verify in Figma**

```bash
npm run build
```

Manual test checklist:
1. Select a previously-imported frame → Export tab shows block counts
2. Click Export .md → `.md` file downloads with original source preserved
3. Click Review changes → diff panel shows modified/new blocks with correct defaults
4. Toggle a block selection → button highlight updates
5. Click Export .md from review panel → download uses selected versions
6. Select a non-plugin frame → "No import history found" message appears
7. Select 0 frames → "Select one or more frames" empty state appears

- [ ] **Step 10: Run all tests**

```bash
npx jest --verbose
```

- [ ] **Step 11: Commit**

```bash
git add figma-markdown-sync/src/ui.ts figma-markdown-sync/src/styles.css
git commit -m "feat: implement Export tab UI with summary, review mode, and file download"
```

---

## Chunk 5: Final Verification

### Task 11: End-to-end test and cleanup

**Files:**
- All modified files

- [ ] **Step 1: Run full test suite**

```bash
cd figma-markdown-sync && npx jest --verbose --coverage
```
Expected: all tests pass, no regressions.

- [ ] **Step 2: Build final plugin**

```bash
npm run build
```
Expected: no TypeScript errors or warnings.

- [ ] **Step 3: End-to-end manual test in Figma**

1. Import a `.md` file with headings, paragraphs, a code block, inline links, and a table
2. Select the imported frame → open Export tab → verify unchanged/modified/added counts are correct
3. Click Export .md → verify the downloaded file matches the original source exactly (inline links preserved)
4. Edit a paragraph text node in the frame
5. Re-select the frame → open Export tab → verify "1 modified" appears
6. Click Review changes → verify the modified block shows original vs current with "Keep original" defaulted
7. Switch to "Use current" → click Export .md → verify downloaded file uses the edited text
8. Import 2 additional files → select all 3 frames → click Export tab → click Export all → verify 3 sequential `.md` downloads
9. Select a frame never imported by this plugin → verify "No import history found" state and inference-only export

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: Figma → Markdown export — full pipeline complete"
```

---

## Summary

| Chunk | Tasks | Output |
|-------|-------|--------|
| 1: pluginData Storage | 1–4 | Frames store source at import; messages.ts has all export constants |
| 2: Inference Engine | 5 | `exporter.ts` infers all 18 block types from layer tree |
| 3: Diff + Assembly | 6–8 | Content-hash diff, Markdown assembly, sandbox handlers wired |
| 4: Export Tab UI | 9–10 | Export tab, summary view, review mode, download trigger, CSS |
| 5: Verification | 11 | Full test suite + end-to-end manual verification |
