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

| Figma signal | → Markdown output |
|---|---|
| Text node with style `Markdown/H1` | `# text` |
| Text node with style `Markdown/H2` | `## text` |
| Text node with style `Markdown/H3` | `### text` |
| Text node with style `Markdown/Body` | paragraph |
| Text node with style `Markdown/Code` | ` ``` \ntext\n``` ` |
| Text node with style `Markdown/Quote` | `> text` |
| Frame named `[hr]` | `---` |
| Frame named `[table-*]` | reconstructed GFM table |
| Image node | `![](placeholder)` with a fidelity warning |
| Unknown layer | skipped; logged in export summary |

For frames using **style binding** (custom styles via Settings), the plugin reads the stored `styleBindings` map from `pluginData` and uses those style IDs as signals in place of `Markdown/*` names.

### Stage 3: Block-level diff
Compare stored source blocks (Stage 1) against inferred blocks (Stage 2) to produce a diff result.

**Match strategy:** blocks are matched by position and type. A heading at index 0 in source matches a heading at index 0 in the inferred array. Content is normalized (whitespace, punctuation) before comparison so only meaningful changes are flagged.

**Three block states:**

| State | Condition | Export output |
|---|---|---|
| `unchanged` | inferred content matches source (after normalization) | original source text — preserves inline links, footnotes, badge syntax, Mermaid source |
| `modified` | same position and type, content differs | inferred output; fidelity warning shown if block had lossy elements |
| `new` | no corresponding source block | inferred output |

For frames with no `pluginData`, all blocks are `new` and the diff stage is skipped.

### Stage 4: Assembly
Merge the diff result into a final Markdown string. Export as:
- Single frame → `.md` file download, named after the frame
- Multiple frames → `.zip` containing one `.md` per frame

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

6 blocks inferred
2 layers skipped  ⚠

[ Export .md ]   [ View export log ]
```

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
2. `Export .md` exports all frames immediately as a `.zip`
3. `Review changes` steps through frames one at a time in the review panel
4. Output zip uses frame names as filenames; conflicts are resolved by appending an index

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
When a frame is created by this plugin, store the original Markdown source:

```typescript
figma.currentPage.selection[0].setPluginData('markdownSource', markdownString)
figma.currentPage.selection[0].setPluginData('markdownImportedAt', Date.now().toString())
figma.currentPage.selection[0].setPluginData('markdownFilename', filename)
```

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

**Modified files:**
- `figma-markdown-sync/code.ts` — store `pluginData` on frame creation; handle `export-request` and `export-confirm` message types
- `figma-markdown-sync/messages.ts` — add export message types
- `figma-markdown-sync/ui.html` — Export tab
- `figma-markdown-sync/src/ui.ts` — export tab logic, diff display, review mode, file download trigger
- `figma-markdown-sync/src/styles.css` — export tab styles, diff view styles

**New test file:** `figma-markdown-sync/exporter.test.ts` — inference rules, diff engine, assembly

**No changes to:** `parser.ts`, `renderer.ts`, `blockRenderers.ts`, `styles.ts`, `settings.ts`, `tables.ts`

---

## Priority & Sequencing

| Phase | Work | Complexity |
|---|---|---|
| 1 | Store `pluginData` at import time | Low |
| 2 | Layer-tree inference (`exporter.ts`) | Medium |
| 3 | Block-level diff engine | Medium |
| 4 | Export tab UI (default auto-merge) | Medium |
| 5 | Review mode UI (selective diff) | Medium |
| 6 | Multi-frame + zip export | Low |
