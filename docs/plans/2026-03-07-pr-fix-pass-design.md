# PR Fix Pass — Complete Design

**Date:** 2026-03-07
**Branch:** kyle/polish

## Goal

Fix all critical and important issues found in the PR review, add missing test coverage, and remove FigJam support explicitly.

## Architecture

No new modules. All changes are fixes and additions to existing files. The most significant structural change is the build-then-swap pattern in `renderBlocks` — new frames are fully constructed before the original `targetNode` is removed, preventing canvas data loss on render failure.

## Changes by Group

### Group A — Bug Fixes

**Bullet prefix in list items** (`renderer.ts:renderListBlock`)
Prepend `{ type: 'text', text: '• ' }` as a synthetic token before passing to `applyInlineStyles`. This ensures the bullet is part of the formatted character range. The `else` branch (no tokens) already prepends `•` correctly.

**`createErrorPlaceholder` safety** (`renderer.ts`)
Wrap `await loadFont(...)` in a try/catch that falls back to a hardcoded `{ family: 'Inter', style: 'Regular' }` font name if loading fails. The placeholder must never itself throw inside a catch block.

**`hexToRgb` NaN guard** (`utils.ts`)
Validate input against `/^#[0-9A-Fa-f]{6}$/` and throw a descriptive `Error` if it fails, rather than silently returning `{r: NaN, g: NaN, b: NaN}`.

**Font pre-load error handling** (`code.ts`)
Wrap the `Promise.all` font pre-load in its own try/catch. On failure, log a console warning and post a non-blocking status warning to the UI, then continue with the batch import. Do not abort.

**Image failures in batch status** (`renderer.ts`, `code.ts`)
`renderBlocks` returns `{ frame: FrameNode, imageFailures: number }`. `code.ts` includes image failure count in the final status message: "Processed N files (M images failed to load)."

**Re-import target search regression** (`code.ts`)
Change `n.type === 'FRAME'` back to `n.name.length > 0` to match the original behavior — any named node can be a re-import target, not just frames.

### Group B — Error Handling / UX

**`saveSettings` throws on invalid input** (`settings.ts`)
Change the validation guard from a silent `return` to `throw new Error('Invalid settings object — save aborted')`. The caller's outer try/catch in `code.ts` will surface this to the user via `postMessage`.

**`save-settings` / `reset-settings` success feedback** (`code.ts`)
After a successful save or reset, post `{ type: 'status', message: 'Settings saved.', error: false }` to the UI so the user gets explicit confirmation.

**`msg.settings` type guard** (`code.ts`)
Add `if (!msg.settings || typeof msg.settings !== 'object')` before passing to `saveSettings`, returning an error status if the guard fails.

**`marked.lexer` try/catch** (`parser.ts`)
Wrap `marked.lexer(cleanMarkdown)` in try/catch, rethrowing as: `Failed to parse Markdown content — ${originalError.message}`.

**Font fallback user warning** (`styles.ts`, `code.ts`)
When `loadFont` uses the Inter Regular fallback, it records the substitution. After rendering, `code.ts` includes any substitutions in the status message: "Processed 1 file (Roboto Mono unavailable — used Inter Regular)."

### Group C — Architecture

**Build-then-swap in `renderBlocks`** (`renderer.ts`)
New sequence:
1. Create new frame (no parent, no position set yet)
2. Render all blocks into the frame
3. **Only if rendering fully succeeds:** move frame to target position, remove `targetNode`
4. If rendering throws: remove the orphaned new frame, rethrow — `targetNode` is untouched

This eliminates the canvas data loss scenario where `targetNode` is deleted before the replacement is confirmed valid.

### Group D — Tests

**New `renderer.test.ts`** with a richer mock (frames/text nodes return objects with settable properties):
- List grouping: consecutive `list` blocks grouped into a frame with `listSpacing`; non-list blocks use `blockSpacing`
- `targetNode` replacement: original node removed, new frame at same layer index
- Error placeholder inserted when a block throws, import continues
- Image placeholder returned when fetch fails, `imageFailures` count incremented
- Build-then-swap: original `targetNode` NOT removed when `renderBlocks` throws mid-render

**Additions to existing test files:**
- `settings.test.ts`: `saveSettings` throws when `setAsync` rejects; `saveSettings` throws on invalid input
- `styles.test.ts`: `loadFont` when both primary and fallback fail
- `parser.test.ts`: YAML front matter stripped; ordered list items render as bullets; blockquote `content` field asserted
- `tables.test.ts`: `createTableFrame` happy path — header cells have `layoutGrow = 1`, last header cell has no right border

### Group E — Documentation

- `saveSettings`: add `@throws {Error}` for both validation failure and storage failure
- `renderListBlock`: rewrite doc to accurately describe bullet-in-token vs bullet-in-else behavior
- `applyInlineStyles @param tokens`: add `| undefined`; list recognized token types
- `resolveAlignment` + `applyRightBorderOnly`: add JSDoc to both exported functions
- `extractImagesFromTokens`: add `@internal` JSDoc tag
- `initializeStyles`: document `styleCache.clear()` side effect in JSDoc
- `createImageNode`: add `@throws {Error}` for missing `imageUrl`
- `styleCache` declaration: add inline comment explaining module-scope lifetime and clear behavior

### FigJam Removal

Manifest already has `"editorType": ["figma"]`. Add explicit runtime guard in `code.ts` immediately after `figma.showUI`:

```ts
if (figma.editorType !== 'figma') {
    figma.closePlugin('MarkDown For What only supports Figma Design — not FigJam or Slides.');
    return;
}
```

Add a comment in the module header of `code.ts` noting the plugin is Figma Design only.

## Error Handling Philosophy

- **User-visible failures** always reach the UI via `figma.ui.postMessage({ type: 'status', error: true })`
- **Recoverable failures** (single block, single image) use placeholder nodes and increment counters — import continues
- **Unrecoverable failures** (parse error, entire file) abort that file's import but continue the batch
- **Font fallbacks** are non-blocking warnings, not errors
- **Canvas mutations** (node removal/insertion) happen only after successful render

## Testing Strategy

The new `renderer.test.ts` requires extending `test-setup.ts` to return real-ish mock objects from `figma.createFrame()` and `figma.createText()` — specifically objects with settable properties (`layoutMode`, `children`, `appendChild`, etc.) so `renderBlocks` can execute without throwing. The existing `figma.createFrame: jest.fn()` returns `undefined` which causes immediate failures.
