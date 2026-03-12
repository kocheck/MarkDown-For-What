# Export: Figma → Markdown Design

**Date:** 2026-03-12
**Status:** Approved
**Audience:** Designer using MarkDown For What as a personal workflow tool
**Approach:** Hybrid diff-based export — automatic merge by default, selective review on demand

---

## Context

MarkDown For What imports Markdown files into Figma as styled frames. This spec adds the reverse: exporting Figma frames back to `.md` files.

The primary use case is round-tripping: a designer imports a spec, makes edits to the Figma frame, and wants to export the updated content back to Markdown without losing formatting that didn't survive the render (inline links, footnotes, badge syntax, Mermaid source).

Two frame types exist in practice:
- **Plugin-created frames** — imported via this plugin; have `pluginData` with the original Markdown source stored at import time
- **Arbitrary frames** — any other Figma frame; no stored source; inference only

---

## Section 1: Architecture

The export pipeline runs four stages in sequence:

### Stage 1: Source detection
Check the selected frame(s) for `pluginData` key `markdownSource`. If present, parse stored Markdown into a block array (same `Block[]` type used by the import pipeline). If absent, skip to Stage 2 with an empty source block array.

### Stage 2: Layer-tree inference
Always runs. Walks the frame's layer tree and produces an inferred `Block[]` array by mapping Figma layer properties to Markdown tokens.

**Inference mapping rules:**

The exporter identifies block types by matching against the actual layer names and node types produced by the renderer:

| Figma signal | → Markdown output |
|---|---|
| Text node with style `Markdown/H1` | `# text` |
| Text node with style `Markdown/H2` | `## text` |
| Text node with style `Markdown/H3` | `### text` |
| Text node with style `Markdown/Body` | paragraph |
| Text node with style `Markdown/Code` | ` ``` \ntext\n``` ` |
| Text node with style `Markdown/Quote` | `> text` |
| `RectangleNode` with height = 1 | `---` (separator; identified by node type + height, not name) |
| Frame named `'Table'` | reconstructed GFM table (walk child rows/cells) |
| Frame named `'List Group'` | bullet list items (walk child text nodes) |
| Frame named `'Callout: Note'` / `'Callout: Tip'` etc. | `> [!NOTE]` / `> [!TIP]` etc. |
| Frame named `'Table of Contents'` | `toc` block — re-emits as a fidelity warning; TOC is auto-generated on re-import |
| Frame named `'Definition List'` | `term\n: definition` pairs |
| Frame named `'Footnotes'` | footnote section (walk child text nodes) |
| Frame named `'Badge Row'` | `[badge:Label]` syntax per child pill |
| Frame named `'Mermaid Diagram'` | ` ```mermaid\n...\n``` ` — source recovered from stored `pluginData` key `mermaidSource` if present, otherwise fidelity warning |
| Frame named `'Math Block'` | `$$\n...\n$$` — source recovered from `pluginData` key `mathSource` if present, otherwise fidelity warning |
| Image node (any `RECTANGLE` with `fills[0].type === 'IMAGE'`) | `![alt](placeholder)` with a fidelity warning (original URL not recoverable) |
| Unknown layer | skipped; logged in export summary |

**componentNames mode:** When the import was done with `componentNames: true`, text nodes inside list groups are named `'Bullet/Item'`, `'Ordered/Item'`, etc. The exporter reads these names as secondary signals when the style-based signal is unavailable.

For frames using **style binding** (custom text styles instead of `Markdown/*`), the exporter reads the `textStyleId` from each text node via `node.getTextStyleIdAsync()` and resolves the style name via `figma.getStyleByIdAsync(id)`. If the resolved name matches a bound element in the stored settings `styleBindings` map, that node is classified accordingly. This correctly handles the case where the user changed their style bindings between import and export.

### Stage 3: Block-level diff
Compare stored source blocks (Stage 1) against inferred blocks (Stage 2) to produce a diff result.

**Match strategy:** blocks are matched first by content-hash (type + normalized content fingerprint). If a block's fingerprint exists in both the source and inferred arrays, it is matched regardless of position — this handles most insertion/deletion cases. When no content match is found, position + type is used as a fallback. Content is normalized (whitespace, punctuation) before fingerprinting so minor edits are correctly flagged as `modified` rather than `new`.

**Known limitation:** If a user edits the text of a block *and* inserts or removes other blocks, the edited block may not find a content match and will be treated as `modified` via position fallback. In these cases, the `unchanged` blocks on either side of the edit will still match correctly by content hash. The review mode surfaces per-block diffs so the user can verify.

**Three block states:**

| State | Condition | Export output |
|---|---|---|
| `unchanged` | inferred content matches source (after normalization) | original source text — preserves inline links, footnotes, badge syntax, Mermaid source |
| `modified` | same position and type, content differs | inferred output; fidelity warning shown if block had lossy elements |
| `new` | no corresponding source block | inferred output |

For frames with no `pluginData`, all blocks are `new` and the diff stage is skipped.

### Stage 4: Assembly
Merge the diff result into a final Markdown string. Export as:
- Single frame → `.md` file download, named after the frame (from stored `markdownFilename` > frame name > `"export"`)
- Multiple frames → sequential per-file downloads (one `.md` per frame triggered in sequence from the UI iframe). ZIP output is deferred — the Figma plugin sandbox has no ZIP API, and bundling JSZip adds ~100 KB to the plugin bundle. Sequential downloads cover the typical use case (2–5 files). ZIP can be added as an explicit dependency if user demand warrants it.

---

## Section 2: Diff Engine

### Block fingerprinting
Each block is fingerprinted by `type + normalizedContent`. Normalization strips leading/trailing whitespace and collapses internal whitespace runs to a single space.

### Reordering
If a block's type matches but its position has changed, it is treated as `modified` at its new position. No attempt is made to track moves — this keeps the diff simple and predictable.

### Fidelity warnings
A fidelity warning is attached to a `modified` or `new` block when the inferred output is known to be lossy. Lossy block types:
- Paragraphs containing inline links (link URL lost; text preserved)
- Paragraphs containing footnote references (reference markers lost)
- Paragraphs containing badge syntax (rendered as plain text)
- Mermaid blocks (source may be partially recoverable from a stored label layer, but not guaranteed)
- Math/LaTeX blocks (same as Mermaid)

Fidelity warnings are informational only — they do not block export.

---

## Section 3: Export UX

### Export tab
A new **Export** tab added to the plugin UI alongside Import, Preview, Settings, and History.

**Plugin-created frame selected (with stored source):**
```
Export

"my-design-spec"  · imported Mar 10

3 blocks unchanged  ✓
2 blocks modified   ↻
1 block added       +

[ Export .md ]   [ Review changes ]
```

`Export .md` exports the auto-merged result immediately — no friction for the common case.

**Arbitrary frame selected (no stored source):**
```
Export

"Random Frame"
No import history found.

Inference works best on frames using
Markdown/* text styles. Other frames
may produce few or no blocks.

6 blocks inferred
2 layers skipped  ⚠

[ Export .md ]   [ View export log ]
```

If inference produces zero blocks: replace the block count with "No Markdown content detected. This frame may not use Markdown/* styles." and disable the `Export .md` button.

**No frame selected:**
```
Export

Select one or more frames on the canvas
to export them as Markdown.
```

---

### Selective review mode

Triggered by clicking **Review changes**. Shows only `modified` and `new` blocks. Each block displays an inline two-pane diff with an accept/reject control.

**Modified block (with fidelity warning):**
```
↻  Paragraph  (modified)
──────────────────────────────────────
Original              │  Current
See the [guide](url)  │  See the updated
for more details.     │  guide for more
                      │  details.
                      │  ⚠ Link lost in export
[ ✓ Keep original ]   [ Use current ]
```

**New block (no source equivalent):**
```
+  Heading (added)
──────────────────────────────────────
"## New Section"

[ ✓ Include ]   [ Skip ]
```

Default selections:
- `modified`: Keep original (preserves fidelity)
- `new`: Include (user added it, likely intentional)

After reviewing, `Export .md` at the bottom of the panel exports the final merged result with user selections applied.

---

### Multi-frame export

When multiple frames are selected:

1. Summary view shows per-frame diff counts before export
2. `Export all` triggers sequential per-file downloads — one `.md` per frame, each download initiated after the previous resolves
3. `Review changes` steps through frames one at a time in the review panel; a breadcrumb shows "Frame 2 of 5"
4. Filenames: stored `markdownFilename` > frame name > `"export-{index}"`. Duplicate names get an appended index (e.g. `spec.md`, `spec-2.md`)

### Review mode cancel behavior

- Clicking away from the Review panel or switching frame selection: selections are preserved in memory for the current plugin session; a "Back to export" link restores the panel
- Closing the plugin: all in-progress review selections are discarded (no persistence needed — the diff re-runs on next open)
- No confirmation prompt is shown on cancel — the operation is non-destructive until `Export .md` is clicked

---

### Export log

After every export, a collapsible log panel shows:
- Skipped layers (name + reason)
- Fidelity warnings per block
- Total block count and file size

The log persists until the next export action. It is not added to Import History.

---

## Section 4: Data Storage

### At import time (new behavior)
After `renderBlocks` resolves and returns a `RenderResult`, store the original Markdown source on the resulting frame. The call site is in `code.ts` inside the `MSG_IMPORT_BATCH` handler:

```typescript
const result = await renderBlocks(name, blocks, settings, targetNode)
result.frame.setPluginData('markdownSource', markdownString)
result.frame.setPluginData('markdownImportedAt', Date.now().toString())
result.frame.setPluginData('markdownFilename', filename)
```

**Size limit:** Before storing, check `markdownString.length`. If it exceeds 50,000 characters (~50 KB), skip storing and set a flag `markdownSourceTruncated: 'true'` instead. On export, if this flag is present, the export panel shows: "Source too large to store — using current state only." The inference path runs normally; the user is informed rather than silently degraded.

### At export time
Read back:
```typescript
const source = frame.getPluginData('markdownSource')
const importedAt = frame.getPluginData('markdownImportedAt')
const filename = frame.getPluginData('markdownFilename')
```

### Existing frames (no pluginData)
The export pipeline handles missing `pluginData` gracefully — falls back to inference-only with no error.

---

## Section 5: Architecture Impact

**New file:** `figma-markdown-sync/exporter.ts` — layer-tree walker, inference rules, block diff engine, Markdown assembly

**New message types** (following the pattern in `messages.ts`):

| Message | Direction | Payload | Purpose |
|---|---|---|---|
| `export-request` | UI → sandbox | `{ frameIds: string[] }` | User clicks Export tab; sandbox runs inference + diff, returns result |
| `export-result` | sandbox → UI | `{ frames: ExportFrameResult[] }` | Diff result per frame for display in export panel |
| `export-download` | UI → sandbox | `{ frameId: string, selections: BlockSelection[] }` | User confirmed; sandbox assembles final Markdown and sends back string |
| `export-markdown` | sandbox → UI | `{ filename: string, content: string }` | UI triggers file download |

```typescript
interface ExportFrameResult {
  frameId: string
  filename: string
  hasStoredSource: boolean
  sourceTruncated: boolean
  blocks: ExportBlock[]
}

interface ExportBlock {
  state: 'unchanged' | 'modified' | 'new'
  originalText?: string   // stored source text (undefined for 'new')
  inferredText: string
  fidelityWarning?: string
}

interface BlockSelection {
  blockIndex: number
  useOriginal: boolean  // true = keep original source, false = use inferred
}
```

**Modified files:**
- `figma-markdown-sync/code.ts` — store `pluginData` on frame creation; handle `export-request` and `export-download` message types
- `figma-markdown-sync/messages.ts` — add export message type constants
- `figma-markdown-sync/ui.html` — Export tab
- `figma-markdown-sync/src/ui.ts` — export tab logic, diff display, review mode, file download trigger
- `figma-markdown-sync/src/styles.css` — export tab styles, diff view styles

**New test file:** `figma-markdown-sync/exporter.test.ts` — inference rules, diff engine, assembly

**No changes to:** `parser.ts`, `renderer.ts`, `blockRenderers.ts`, `styles.ts`, `settings.ts`, `tables.ts`

---

## Priority & Sequencing

| Phase | Work | Complexity |
|---|---|---|
| 1 | Store `pluginData` at import time; add `mermaidSource`/`mathSource` keys in block renderers | Low |
| 2 | Layer-tree inference (`exporter.ts`) — all 18 block types | Medium |
| 3 | Content-hash diff engine | Medium |
| 4 | Export tab UI (default auto-merge, export log) | Medium |
| 5 | Review mode UI (selective diff, cancel/back behavior) | Medium |
| 6 | Multi-frame sequential download | Low |
