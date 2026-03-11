# MarkDown For What — v2 Feature Expansion Design

**Date:** 2026-03-10
**Status:** Approved
**Audience:** Designer documenting their own work (personal workflow tool)
**Approach:** Content First — 12 new content types, 4 styling features, 4 UX features

---

## Context

MarkDown For What is a Figma plugin that converts Markdown files into styled Figma frames via drag-and-drop. The current feature set covers headings, paragraphs, bullet lists, code blocks, tables, images, blockquotes, and horizontal rules.

The primary user is a designer who writes in Markdown and imports into Figma for presentation and documentation. The biggest pain points are: (1) content types that don't render at all, requiring manual recreation, (2) output styling that doesn't match existing Figma file styles, and (3) fixed layout with no flexibility.

This spec defines 20 features organized into three categories, weighted toward new content types since missing content is the most expensive gap to fix manually.

### Inline Token System

The current parser uses `flattenTokens()` to produce `StyledSegment[]` with shape `{ text, bold?, italic?, code? }`. This spec **extends `StyledSegment`** with new optional fields rather than introducing a separate inline token system:

```typescript
interface StyledSegment {
  text: string
  bold?: boolean
  italic?: boolean
  code?: boolean
  strikethrough?: boolean  // NEW: feature #5
  link?: string            // NEW: feature #4 — URL value
  badge?: { label: string, color?: string }  // NEW: feature #9
  footnoteRef?: { id: string, index: number } // NEW: feature #7
}
```

All features below that reference "inline formatting" or "inline tokens" use this extended `StyledSegment` type.

---

## Section 1: New Content Types (12 features)

### 1. Task Lists / Checklists

**What:** Render `- [ ]` and `- [x]` as styled checkbox rows with checked/unchecked visual states.

**Design:**
- In `marked`, task list items are regular `ListItem` tokens with `task: boolean` and `checked: boolean` properties on the item itself (not a separate token type)
- Parser emits individual `taskListItem` blocks (one per item, matching the existing pattern where `list` blocks are emitted per-item) — not a grouped block
- Renderer creates a horizontal auto-layout row per item: checkbox icon (rectangle with optional checkmark vector) + text node
- Checked items get a filled checkbox and optionally dimmed text
- Spacing follows existing list spacing setting
- Task lists are flat-only in v2. Nested task lists are deferred until feature #2 (nested lists) is proven stable, at which point task list items would gain the same `depth` field

**Block type:** `{ type: 'taskListItem', checked: boolean, text: string, segments: StyledSegment[] }`

**Parser change:** In the list-processing loop (parser.ts ~lines 229-235), check `item.task === true` and emit `taskListItem` instead of `list`.

---

### 2. Nested Lists

**What:** Support indented sub-bullets and nested ordered lists with proper indentation levels.

**Design:**
- `marked` represents nesting via child `list` tokens inside a parent `ListItem`'s `tokens` array (recursive structure), NOT via a flat `depth` property
- Parser implements a recursive traversal function that walks the nested `ListItem.tokens` arrays and flattens them into a sequence of `list` blocks annotated with a computed `depth: number` (0-based)
- Renderer adds left padding per depth level (20px per level)
- Each depth level uses a different bullet character: depth 0 = disc (•), depth 1 = circle (◦), depth 2 = dash (–), depth 3 = dot (·)
- Works for both unordered and ordered lists
- Maximum rendered depth: 4 levels (deeper levels clamped to depth 3 styling)

**Changes to existing block type:** Add `depth: number` to list blocks. Existing flat lists have `depth: 0` (backwards compatible).

**Parser change:** Replace the flat `listToken.items` iteration with a recursive `flattenListItems(items, depth)` function.

---

### 3. Ordered (Numbered) Lists

**What:** Render `1. 2. 3.` with number prefixes and consistent spacing.

**Design:**
- Parser emits individual `orderedListItem` blocks (one per item, matching existing `list` block pattern)
- Each block includes `index: number` (the display number) and `depth: number` for nesting
- Renderer creates text nodes with `{index}. ` prefix, matching bullet list layout
- Supports inline formatting within list items (bold, italic, code via `StyledSegment[]`)
- Numbering respects the `start` attribute from the `marked` list token (e.g. `5. ` starts at 5)
- Uses same spacing as unordered lists

**Block type:** `{ type: 'orderedListItem', index: number, depth: number, text: string, segments: StyledSegment[] }`

---

### 4. Inline Links

**What:** Render `[text](url)` as visually distinct styled text with clickable hyperlinks.

**Design:**
- Parser sets the `link` field on `StyledSegment` with the URL value when processing `marked` link tokens
- `flattenTokens()` extended to handle `'link'` token type, propagating the URL to child segments
- Renderer applies underline decoration via `node.setRangeTextDecoration(start, end, 'UNDERLINE')` and a link color (default: #0969DA, configurable in settings)
- Renderer applies clickable hyperlink via `node.setRangeHyperlink(start, end, { type: 'URL', value: url })` — Figma natively supports this on TextNode ranges
- Works within paragraphs, list items, blockquotes, and table cells

**StyledSegment field:** `link?: string` (URL value)

---

### 5. Strikethrough Text

**What:** Render `~~text~~` with strikethrough text decoration.

**Design:**
- Parser sets `strikethrough: true` on `StyledSegment` when processing `marked` `'del'` tokens
- `flattenTokens()` extended to handle `'del'` token type (currently not handled)
- Renderer applies strikethrough via `node.setRangeTextDecoration(start, end, 'STRIKETHROUGH')` — this is a method call on TextNode, not a property assignment
- Works alongside bold, italic, and code inline styles
- Note: a single range can only have one `textDecoration` value in Figma. If a range is both a link (underline) and strikethrough, strikethrough takes precedence (underline is implied by the link color).

**StyledSegment field:** `strikethrough?: boolean`

---

### 6. Callout / Admonition Blocks

**What:** Render GitHub-style `> [!NOTE]`, `> [!WARNING]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!CAUTION]` as colored blocks with icons.

**Design:**
- Parser detects admonition syntax inside blockquote tokens (regex: `/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i` on first line of blockquote text)
- Five types with distinct colors:
  - NOTE: blue (#0969DA)
  - TIP: green (#1A7F37)
  - IMPORTANT: purple (#8250DF)
  - WARNING: yellow (#9A6700)
  - CAUTION: red (#CF222E)
- Renderer creates an auto-layout frame with:
  - Left colored border (4px, type-specific color) via `strokeLeftWeight`
  - Light background fill (type-specific, 10% opacity)
  - Label row: bold text in type-specific color (e.g., "Note", "Warning")
  - Body text below the label, rendered with full inline formatting via `StyledSegment[]`
- Falls back to regular blockquote if admonition type is unrecognized

**Block type:** `{ type: 'callout', calloutType: 'note' | 'tip' | 'important' | 'warning' | 'caution', text: string, segments: StyledSegment[] }`

---

### 7. Footnotes

**What:** Render `[^1]` inline references with a collected footnote section at the bottom.

**Design:**
- `marked` does not natively support footnotes. Implementation uses `marked.use({ extensions: [...] })` with two custom extensions:
  1. **Block extension** for footnote definitions (`[^id]: text`): tokenizer regex `/^\[\^([^\]]+)\]: (.+)$/gm`, collected into a map
  2. **Inline extension** for footnote references (`[^id]`): tokenizer regex `/\[\^([^\]]+)\]/`
- Parser collects all footnote definitions in a first pass, then processes inline references during normal parsing
- Footnote references rendered as smaller text (0.75x body size) — true superscript (baseline shift) is not possible in Figma's TextNode API, so this is a visual approximation using `setRangeFontSize()` only
- At the end of the block array, parser appends a `footnoteSection` block with all collected footnotes, ordered by first reference appearance
- Footnote section rendered after a horizontal rule, with each entry as `{index}. {text}` in a smaller body font

**Block type:** `{ type: 'footnoteSection', footnotes: Array<{ id: string, index: number, text: string }> }`
**StyledSegment field:** `footnoteRef?: { id: string, index: number }`

---

### 8. Definition Lists

**What:** Render `Term\n: Definition` as bold term + indented definition.

**Design:**
- `marked` does not natively support definition lists. Implementation uses `marked.use({ extensions: [...] })` with a custom block-level tokenizer
- Tokenizer regex: `/^([^\n]+)\n(?=: )(?:: ([^\n]+)\n?)+/` — matches a term line followed by one or more `: definition` lines
- Renderer creates pairs: term as bold text node, definition as indented (20px left padding) body text below
- Multiple definitions per term supported (each on its own `: ` line)
- Vertical spacing between term-definition pairs matches block spacing setting

**Block type:** `{ type: 'definitionList', items: Array<{ term: string, definitions: string[] }> }`

---

### 9. Badge / Tag Pills

**What:** Render frontmatter tags and an inline syntax as small colored pill shapes.

**Design:**
- Two sources:
  1. YAML frontmatter `tags: [design, v2, draft]` field (currently stripped — would render as a badge row instead)
  2. Inline syntax `[badge:Label]` or `[badge:Label:color]` within text (single-bracket syntax avoids collision with Mustache/Handlebars `{{ }}` templates)
- Renderer creates small auto-layout frames: rounded rectangle (corner radius 12px) background + text (small font, white or dark depending on background contrast)
- Default colors: deterministic hash-based color from label text (e.g. `hashCode(label) % palette.length` from a curated 8-color palette)
- Optional explicit color via named colors: `[badge:Approved:green]` — supported names: red, orange, yellow, green, blue, purple, gray
- Badge row rendered as horizontal auto-layout with 8px gap and wrap enabled
- Frontmatter tags rendered as a badge row at the top of the frame, before other content

**Block type:** `{ type: 'badgeRow', badges: Array<{ label: string, color?: string }> }`
**StyledSegment field:** `badge?: { label: string, color?: string }`

**Parser change:** Custom inline extension for `[badge:...]` syntax. Frontmatter parsing (currently stripping YAML) extended to extract `tags` field before stripping.

---

### 10. Table of Contents Generation

**What:** Auto-generate a TOC from headings at the top of the frame.

**Design:**
- Opt-in via a setting toggle or frontmatter flag (`toc: true`)
- Parser scans all heading blocks after full parse and builds a TOC structure
- Renderer creates a TOC block at the top of the frame:
  - "Contents" label using the `Markdown/H3` text style
  - Each heading as an indented text line (H1 = no indent, H2 = 1 level indent at 20px, H3 = 2 levels at 40px)
  - Text uses `Markdown/Body` style at 14px (one size smaller than default body)
  - Separator line below the TOC
- Updates automatically on re-import

**Block type:** `{ type: 'toc', entries: Array<{ text: string, level: number }> }`

**Settings shape addition:** `generateToc?: boolean` (default: false)

---

### 11. Mermaid Diagram Embedding

**What:** Render `mermaid` code blocks as diagram images instead of code text.

**Design:**
- Parser detects code blocks with language `mermaid` and emits a `mermaid` block instead of `codeBlock`
- Rendering pipeline (runs in the UI iframe, which has web access):
  1. UI iframe loads Mermaid.js library (bundled or from CDN)
  2. Calls `mermaid.render()` to produce SVG string
  3. Rasterizes SVG to PNG via an offscreen `<canvas>`: create an `Image` element with the SVG as a data URI, draw to canvas, call `canvas.toDataURL('image/png')`, convert to `Uint8Array`
  4. Passes PNG bytes to the plugin sandbox via `postMessage` as part of the file payload, with a message type `{ type: 'mermaid-rendered', blockIndex: number, imageBytes: Uint8Array }`
  5. Plugin sandbox creates an image node from the bytes using `figma.createImage(bytes)`
- Image placed in the frame, sized to fit within frame width while maintaining aspect ratio
- If rendering fails (syntax error, timeout), fall back to displaying as a regular code block with a `[Mermaid render failed]` label above it

**Import pipeline impact:** When Live Preview (feature #17) is implemented, Mermaid rendering happens during the preview phase in the iframe, before the user clicks "Import." The rendered images are sent alongside the parsed blocks. Without preview, rendering happens immediately after file drop before sending to the sandbox.

**Block type:** `{ type: 'mermaid', source: string, renderedImageBytes?: Uint8Array }`

---

### 12. Math / LaTeX Blocks

**What:** Render `$$ ... $$` blocks as formula images.

**Design:**
- Parser detects `$$` fenced blocks via a custom `marked` block extension (tokenizer regex: `/^\$\$\n([\s\S]+?)\n\$\$/)`)
- **Scope: block-level math only.** Inline math (`$ ... $`) is deferred — Figma's TextNode does not support inline images within a text run, so there is no good way to position formula images mid-paragraph. Inline math falls back to code-styled monospace text.
- Rendering pipeline (same pattern as Mermaid, runs in UI iframe):
  1. UI iframe loads KaTeX library (bundled)
  2. Calls `katex.renderToString()` to produce HTML
  3. Renders HTML to an offscreen canvas via a temporary DOM element, captures as PNG bytes
  4. Passes PNG bytes to plugin sandbox via `postMessage`
- Block math rendered as a centered image in the frame
- Fallback: render as code block with monospace text if KaTeX rendering fails

**Block type:** `{ type: 'math', source: string, renderedImageBytes?: Uint8Array }`

---

## Section 2: Styling & Design Output (4 features)

### 13. Style Binding to Existing Local Styles

**What:** Map Markdown elements to text/color styles already in the Figma file instead of creating `Markdown/*` styles.

**Design:**
- Settings UI addition: a "Style Mapping" section listing each element (H1, H2, H3, Body, Code, List, Quote)
- Each element shows a dropdown populated with the file's existing local text styles
- **Message-passing flow:** Plugin sandbox calls `figma.getLocalTextStylesAsync()` and sends the style list (id + name pairs) to the UI iframe via `figma.ui.postMessage()`. UI renders dropdowns from this list. User selections are sent back to the sandbox and saved to `clientStorage`.
- Default: "Auto" (creates `Markdown/*` styles as today)
- When a mapping is set, the renderer uses `setTextStyleIdAsync()` with the chosen style ID instead of creating a new one
- Color styles can be mapped separately for backgrounds (code blocks, table headers, callout blocks) using `figma.getLocalPaintStylesAsync()`

**Settings shape addition:**
```typescript
styleBindings?: {
  h1?: string       // text style ID or 'auto'
  h2?: string
  h3?: string
  body?: string
  code?: string
  list?: string
  quote?: string
  codeBg?: string   // paint style ID for code block background
  tableBg?: string  // paint style ID for table header background
}
```

---

### 14. Theme Presets

**What:** Built-in visual themes that set colors, spacing, and typography as a bundle.

**Design:**
- Three initial presets:
  - **Minimal Light:** Current defaults, clean and neutral, white frame fill
  - **Dark Mode:** Dark frame fill (#1E1E1E), light text (#E0E0E0), muted syntax colors
  - **Documentation:** Tighter spacing (8px block, 4px list), smaller fonts, more information-dense
- Settings UI: theme selector at the top of the Settings tab (segmented control)
- Selecting a theme populates all settings fields (spacing, colors, widths, **frame fill color**) with preset values
- User can then customize individual settings after selecting a theme (theme becomes "Custom" automatically)
- Presets stored as const objects in settings.ts
- **New setting:** `frameFillColor` added to support dark mode and custom backgrounds

**Settings shape addition:** `theme?: 'minimal-light' | 'dark-mode' | 'documentation' | 'custom'` and `frameFillColor?: string`

---

### 15. Component Output Mode

**What:** Option to render blocks as instances of user-defined Figma components.

**Design:**
- Settings UI: "Component Mapping" section (similar to style binding)
- User selects components from their file for each block type (code block, blockquote, callout, table, image)
- **Layer naming convention:** The plugin looks for text layers by name, searched recursively through the component tree:
  - `#content` or `#body` — primary text content (required for mapping to work)
  - `#title` or `#label` — optional title/label text (used for callout type labels, code block language labels)
  - `#background` — optional frame whose fill color can be overridden (for callout type colors)
- When a mapping exists, the renderer:
  1. Creates an instance of the component via `component.createInstance()`
  2. Walks the instance tree recursively to find text layers matching the naming convention
  3. Populates `#content` with parsed text and inline formatting
  4. Populates `#title` if present and applicable
  5. Resizes to fit content if the component uses auto-layout
- Unmapped block types render normally (raw frames as today)
- **If naming convention is not met** (no `#content` layer found): skip component instantiation, render as raw frame, and log a warning to the plugin UI status
- Component list sent to UI via same message-passing pattern as style binding: sandbox sends component names/IDs, UI renders dropdowns

**Settings shape addition:**
```typescript
componentBindings?: {
  codeBlock?: string    // component key or ID
  blockquote?: string
  callout?: string
  table?: string
  image?: string
}
```

---

### 16. Responsive Width Modes

**What:** Multiple frame width options instead of one fixed value.

**Design:**
- Four modes:
  - **Narrow (480px):** Text column for reading, changelogs
  - **Medium (800px):** Current default
  - **Wide (960px):** Specs with tables, side-by-side content
  - **Custom:** User-defined pixel value
- Settings UI: radio buttons or segmented control for width mode, with a custom input field shown when "Custom" is selected
- Width mode can also be set per-import in the preview UI (feature #17)

**Settings migration:** The existing `frameWidth: number` field is replaced with `widthMode` + `customWidth`. Migration rule in `mergeWithDefaults()`:
- If `frameWidth` exists in stored settings but `widthMode` does not:
  - If `frameWidth === 480` → `widthMode: 'narrow'`
  - If `frameWidth === 800` → `widthMode: 'medium'`
  - If `frameWidth === 960` → `widthMode: 'wide'`
  - Otherwise → `widthMode: 'custom'`, `customWidth: frameWidth`
- Delete the legacy `frameWidth` key after migration

**Settings shape change:** `widthMode: 'narrow' | 'medium' | 'wide' | 'custom'` + `customWidth: number`

---

## Section 3: Plugin UX & Workflow (4 features)

### 17. Live Preview Before Import

**What:** Show a lightweight preview of parsed content in the plugin UI before creating frames.

**Design:**
- After file drop, instead of immediately sending to the plugin sandbox, the UI parses the Markdown and shows a styled HTML preview in the plugin panel
- Preview uses the same `marked` parser but renders to HTML (already built into `marked`) with CSS approximating Figma output
- User sees a "Preview" state with two buttons: "Import to Canvas" and "Cancel"
- Preview includes block count, detected elements summary (e.g., "3 headings, 2 tables, 1 code block")
- Multi-file: preview each file in a scrollable list
- This is also the phase where Mermaid (#11) and Math (#12) rendering occurs in the iframe, if those features are present

**UI flow change:** Drop file -> Parse in UI -> Show preview -> [optional: render Mermaid/Math in background] -> User confirms -> Send blocks + rendered images to plugin sandbox -> Render

---

### 18. Selective Block Import

**What:** Toggle individual blocks on/off in the preview before importing.

**Design:**
- In the preview (feature #17), each block has a checkbox
- All blocks checked by default
- User unchecks blocks they don't want (e.g., skip the intro paragraph, only import the table)
- "Select All" / "Deselect All" controls
- Unchecked blocks are filtered from the block array before sending to the renderer
- Block labels in the preview: type + first few words (e.g., "Heading: Introduction", "Table: Feature Matrix")

**Dependency:** Requires feature #17 (Live Preview).

---

### 19. Import History & Re-import

**What:** Track imported files for one-click re-import.

**Design:**
- Plugin stores recent imports in `clientStorage`: filename, timestamp, block count
- No file content is cached (respecting `clientStorage` size limits, believed ~4MB)
- Settings tab or a new "History" tab shows the list
- Each entry has a "Re-import" button that opens a file picker — the user must select the file again (Figma plugin sandbox cannot persist file paths across sessions), but the filename matching + in-place update logic already handles the rest
- History limited to last 20 imports
- Clear history button

**Settings shape addition:** `importHistory?: Array<{ filename: string, timestamp: number, blockCount: number }>`

---

### 20. Paste Markdown from Clipboard

**What:** Paste raw Markdown text directly into the plugin instead of requiring a file.

**Design:**
- New input mode alongside drag-drop: a "Paste" tab or a text area toggle in the Import tab
- User pastes Markdown text, clicks "Import"
- Parsed identically to file-based import (same parser, same renderer)
- Default frame name: "Pasted Markdown" with timestamp, or user can type a name
- **Preview integration:** If feature #17 (Live Preview) is available, paste shows preview before import. If #17 is not yet shipped, paste imports directly (same as current file drop behavior). This is a soft dependency, not a hard one.
- Supports paste from clipboard button (reads from `navigator.clipboard.readText()`)

**UI addition:** Third input method in the Import tab — "Paste Markdown" expandable text area with an "Import" button.

---

## Priority & Dependencies

| Priority | Feature | Dependencies | Complexity |
|----------|---------|-------------|------------|
| P0 | 3. Ordered lists | None | Low |
| P0 | 5. Strikethrough | None | Low |
| P0 | 4. Inline links | None | Low |
| P0 | 2. Nested lists | None | Medium |
| P0 | 1. Task lists | None (flat-only; nesting deferred) | Medium |
| P1 | 20. Clipboard paste | None (soft dep on #17 for preview) | Low |
| P1 | 6. Callouts | None | Medium |
| P1 | 16. Responsive widths | None | Low |
| P1 | 17. Live preview | None | Medium |
| P1 | 10. TOC generation | None | Low |
| P2 | 13. Style binding | None | Medium |
| P2 | 18. Selective import | #17 preview (hard dep) | Medium |
| P2 | 14. Theme presets | None | Low |
| P2 | 9. Badge pills | Custom inline extension | Medium |
| P2 | 8. Definition lists | Custom block extension | Medium |
| P2 | 7. Footnotes | Custom extensions (block + inline) | Medium |
| P3 | 19. Import history | None | Low |
| P3 | 11. Mermaid diagrams | UI iframe rendering pipeline | High |
| P3 | 15. Component output | Layer naming convention | High |
| P3 | 12. Math/LaTeX | UI iframe rendering pipeline | High |

---

## Architecture Impact

**Parser changes:** New block types (`taskListItem`, `orderedListItem`, `callout`, `footnoteSection`, `definitionList`, `badgeRow`, `toc`, `mermaid`, `math`). Extended `StyledSegment` with `strikethrough`, `link`, `badge`, `footnoteRef` fields. Custom `marked` extensions for footnotes, definition lists, math, and badge syntax. Recursive list traversal for nesting.

**Renderer changes:** New rendering functions for each block type. The `renderBlocks` function dispatches to type-specific handlers — this pattern scales cleanly. New Figma API usage: `setRangeHyperlink()`, `setRangeTextDecoration('STRIKETHROUGH')`. Image creation from bytes for Mermaid/Math.

**Styles changes:** New text styles for callout labels, TOC entries. Style binding adds a lookup layer before style creation. `applyInlineStyles` extended for strikethrough and link formatting.

**Settings changes:** New fields for style bindings, component bindings, width mode (with migration from `frameWidth`), theme, frame fill color, TOC toggle, import history. Settings validation and `mergeWithDefaults` need migration logic for breaking changes.

**UI changes:** Preview system is the biggest UI change — adds a new intermediate state between file drop and import. Clipboard paste adds a new input mode. Settings tab grows with style mapping, component mapping, and theme selection. Message-passing added for style/component list retrieval from sandbox.

**Manifest changes:** None required. Mermaid/LaTeX rendering happens in the UI iframe which already has web access. `networkAccess` stays `"none"` for the plugin sandbox.
