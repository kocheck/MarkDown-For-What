# MarkDown For What — Polish & Release Prep Design

**Date**: 2026-03-07
**Branch**: kyle/polish
**Goal**: Polish the plugin to a release-ready state across UI, output quality, and code quality.

---

## Overview

Three parallel workstreams:

1. **UI Polish** — Fix panel overflow, redesign import experience, add Settings tab
2. **Output Quality** — Fix table column rendering, tighten list spacing, preserve existing Figma styles on re-import
3. **Code Quality** — Remove FigJam, deep module refactor, JSDoc documentation, hardened error handling, expanded test coverage

---

## Section 1: Plugin UI

### Layout

Two fixed tabs at the top of the plugin panel: **Import** and **Settings**.
Each tab has its own independently scrollable content area.
Panel dimensions remain 400×500.

Visual direction: clean white background, subtle gray borders, Inter font throughout — native to Figma's own UI aesthetic.

### Import Tab

```
┌─────────────────────────────┐
│  [Import]  [Settings]       │  ← fixed tabs
├─────────────────────────────┤
│                             │
│   [ Drop Zone ]             │  ← drag & drop area with icon
│                             │
├─────────────────────────────┤
│  file-preview-list.md       │  ← scrollable file list
│  another-file.md            │     (takes remaining height)
│  ...                        │
├─────────────────────────────┤
│  Status: 2 files processed  │  ← fixed bottom bar
│  [ Import ]                 │  ← always visible, no scroll needed
└─────────────────────────────┘
```

- Drop zone: large, visually distinct, dashed border with upload icon
- File list: shows queued files with filenames, scrollable independently
- Bottom bar: pinned — Import button always visible regardless of file list length
- Status message: appears inline above the Import button after processing (success green / error red)

### Settings Tab

Three grouped sections: **Spacing**, **Frame**, **Colors**.

| Setting | Type | Default |
|---|---|---|
| Block item spacing | Number input (px) | 16 |
| List item spacing | Number input (px) | 6 |
| Frame padding | Number input (px) | 40 |
| Frame width | Number input (px) | 800 |
| Code block background | Hex color input | #F2F2F2 |
| Table header background | Hex color input | #F2F2F7 |
| Separator color | Hex color input | #CCCCCC |

- Settings auto-save to Figma `clientStorage` on change (no save button needed)
- "Reset to defaults" button at the bottom of the tab
- Settings are loaded on plugin open with fallback to defaults if storage is missing or corrupted

---

## Section 2: Output Quality

### Table Column Rendering

**Problem**: Table cell frames use `primaryAxisSizingMode = 'FIXED'` with `layoutGrow = 1` which causes squished/uneven columns.

**Fix**: Set each cell frame's `layoutAlign = 'STRETCH'` and ensure the parent row frame uses `primaryAxisSizingMode = 'FIXED'` pinned to `FRAME_WIDTH`. This makes columns fill available width equally using Figma's auto-layout fill behavior.

### List Item Spacing

**Problem**: All blocks share a uniform 16px `itemSpacing`, making list items feel over-spaced relative to each other.

**Fix**: Track the previous block type during frame construction. When the current block is `list` and the previous block is also `list`, insert a smaller spacer (from settings, default 6px). Normal 16px spacing applies before the first list item and after the last.

Implementation: wrap consecutive list items in a nested auto-layout list frame with its own tighter `itemSpacing`, then append that frame to the parent with normal spacing.

### Style Preservation on Re-import

**Problem**: Every import overwrites local Figma text styles (`Markdown/H1`, etc.), destroying any designer tweaks.

**Fix**: In `styles.ts`, `getOrCreateTextStyle()` checks if the style already exists before writing. If it exists, return it as-is without modifying font, size, or line height. Only newly missing styles are created with defaults.

This means:
- First import: all `Markdown/*` styles are created with defaults
- Subsequent imports: existing styles are untouched, only new styles (if any) are created

---

## Section 3: Code Quality

### FigJam Removal

- Delete `createMarkdownInFigJam()` from `code.ts`
- Delete `isFigJam()` helper
- Update `manifest.json`: `"editorType": ["figma"]`
- Remove FigJam-related test cases if any exist

This removes an untested, non-functional code path and simplifies the codebase significantly.

### Module Structure (Deep Modules)

Break the single 955-line `code.ts` into focused modules with simple public interfaces:

```
figma-markdown-sync/
├── code.ts          # Plugin entry point — init, message handler only
├── parser.ts        # parseMarkdownToBlocks() — markdown string → Block[]
├── renderer.ts      # renderBlocks() — Block[] + settings → Figma FrameNode
├── styles.ts        # getOrCreateTextStyle(), applyInlineStyles()
├── settings.ts      # loadSettings(), saveSettings(), DEFAULT_SETTINGS, validation
└── tables.ts        # createTableFrame() — isolated table rendering complexity
```

Each module:
- Has a **file-level JSDoc** explaining what it owns and what it does not touch
- Exposes only what other modules need (minimal public API)
- Hides implementation details internally

### Documentation Standard

Every module gets a file-level doc:

```ts
/**
 * parser.ts
 *
 * Converts raw Markdown text into a structured array of Blocks.
 * This is the only module responsible for understanding Markdown syntax —
 * nothing else in the codebase should import or call `marked` directly.
 */
```

Every exported function gets full JSDoc:

```ts
/**
 * Converts a Markdown string into an array of Block objects.
 * Each Block represents a single renderable unit (heading, paragraph, table, etc.)
 * YAML front matter is stripped before parsing.
 *
 * @param markdown - Raw markdown string, may include YAML front matter
 * @returns Array of Block objects ready to be passed to renderer.ts
 *
 * @example
 * const blocks = parseMarkdownToBlocks("# Hello\nWorld");
 * // → [{ type: 'heading', level: 1, content: 'Hello' }, { type: 'paragraph', ... }]
 */
```

Internal helpers get a one-line comment if their purpose is not immediately obvious from the name.

### Error Handling

- Wrap each block render in an individual try/catch in `renderer.ts`
- Failed blocks render a visible error placeholder node in the frame (so the import completes rather than aborting)
- Per-file errors are surfaced back to the UI with a descriptive message
- `settings.ts` validates all values loaded from `clientStorage` against expected types and ranges, falling back to `DEFAULT_SETTINGS` for any invalid value

### Test Coverage

Tests mirror the module structure — one test file per module:

```
figma-markdown-sync/
├── parser.test.ts     # parseMarkdownToBlocks, extractImagesFromTokens, flattenTokens
├── styles.test.ts     # style preservation — existing styles not overwritten
├── settings.test.ts   # validation, defaults, corrupted storage fallback
└── tables.test.ts     # createTableFrame block structure
```

Existing tests in `code.test.ts` are migrated to the appropriate module test files and the old file is removed.

---

## Implementation Order

1. Module refactor + JSDoc (foundation everything else builds on)
2. FigJam removal (simplifies module refactor)
3. Settings module + clientStorage
4. Style preservation fix
5. Table column rendering fix
6. List spacing fix
7. UI rebuild (Import tab + Settings tab)
8. Error handling hardening
9. Test coverage expansion
10. Final review pass
