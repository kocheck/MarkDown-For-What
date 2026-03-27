# MarkDown For What — UI Redesign Design

**Date:** 2026-03-15
**Status:** Approved
**Branch:** kyle/redesign
**Figma file:** `y9WmO9vFpMCnMKORSjvvyQ`

---

## Context

The plugin UI is being fully redesigned to match a new Figma spec. The new design replaces the current light theme (`#EFF4F2` background) with a full dark aesthetic, introduces three custom fonts, and updates all component visuals. The existing component architecture (`mfw-*` web components, `tokens.ts` → CSS custom properties, panel HTML partials) is retained — only the visual layer changes.

The redesign covers all 4 tabs (Import, History, Settings, Export) plus a new error state for the Import panel. The Import panel's preview pane is not part of this Figma spec and is preserved as-is (token/color updates only).

---

## Approach: Foundation First (Layer 1 → 2 → 3)

```
Layer 1: Design System Foundation
  tokens.ts         ← clean break, new Figma token names + values
  src/fonts/        ← bundled font files (Space Grotesk, Geist Mono, Geist Pixel)
  webpack.config.js ← add asset/inline rule for font formats
  styles.css        ← dark theme rewrite, @font-face declarations

Layer 2: Component Visual Updates (mfw-*)
  New component:      mfw-section-header
  Structural changes: tab-bar, button, drop-zone, settings-row, status, file-list, paste-section
  Token-only updates: bottom-bar, loader, theme-selector, color-input
  Tests updated to match new token names, variant values, and DOM structure

Layer 3: Panel Layout Updates
  panel-import (preview pane preserved), panel-history, panel-settings, panel-export
  ui.ts: initBottomBar + showStatus updated; export review flow removed; history IDs preserved
```

---

## Layer 1: Design System Foundation

### `tokens.ts` — Clean Break

All current token names are replaced with Figma-aligned names. The build pipeline (`npm run build:tokens` → `tokens.css`) is unchanged.

**Color tokens** — produces `--color-gray1`, `--color-mint10`, etc. via `toKebab()`:

```typescript
Color = {
  // Backgrounds
  gray1:  '#161616',  // main bg
  gray2:  '#1c1c1c',  // elevated surface (tab bar, file rows)
  gray3:  '#232323',  // input bg, drop bg, subtle surface
  gray6:  '#343434',  // border muted, dividers
  gray8:  '#505050',  // border strong, version text
  gray11: '#a0a0a0',  // text muted, meta, labels
  gray12: '#ededed',  // text default

  // Mint (accent)
  mint8:  '#006d5b',  // accent border + inset shadow (use for borders/shadows on mint surfaces)
  mint9:  '#70e1c8',  // accent glow (use for box-shadow glow)
  mint10: '#25d0ab',  // accent fill — interactive backgrounds (primary button, active tab bg, icon container fill)
  mint11: '#25d0ab',  // accent text — foreground on dark surfaces (active tab label, status text, button label on ghost)
                      // Same hex as mint10 per Figma spec; two tokens for semantic role clarity

  // Red (error / destructive)
  red8:   '#aa2429',  // error border + inset shadow
  red10:  '#f2555a',  // error fill (error icon container bg)
  red11:  '#ff6369',  // error text (destructive button label, error status text)

  // Orange (warning / in-progress)
  orange11: '#ff8b3e', // in-progress log entry text
}
```

**Font tokens** — token keys chosen to produce clean kebab CSS property names via `toKebab()`:

```typescript
Font = {
  // Font family stacks — produces var(--font-sans-serif), var(--font-mono), var(--font-mono-brand)
  sansSerif:  '"Space Grotesk", sans-serif',  // file names, headings, drop zone label, error title
  mono:       '"Geist Mono", monospace',       // buttons, labels, values, log entries
  monoBrand:  '"Geist Pixel", monospace',      // meta text, status, section headers, unit suffixes

  // Sizes — produces var(--font-size-xs) through var(--font-size-display)
  sizeXs:      '8px',   // (reserved)
  sizeSm:      '9px',   // tab labels, status text, section headers, file meta, unit suffixes
  sizeMd:      '10px',  // button labels, log entries, export status text
  sizeLg:      '11px',  // paste placeholder, settings labels
  sizeXl:      '12px',  // settings row values / label text
  sizeXxl:     '13px',  // file names
  sizeXxxl:    '14px',  // drop zone label, error title
  sizeDisplay: '16px',  // export filename

  // Weights
  weightNormal:   '400',
  weightMedium:   '500',
  weightSemiBold: '600',
  weightBold:     '700',
}
```

**Unchanged tokens:** `Spacing` (xs–xl), `Radius` (sm–lg), `Transition` (fast, spinner).

### Font Loading

Font files are placed in `src/fonts/`. A webpack `asset/inline` rule base64-encodes each font at build time. Because Figma plugins use `InlineChunkHtmlPlugin` to produce a single `ui.html` blob, relative font file paths are inaccessible at runtime — base64 inline is required.

**Webpack change** (`webpack.config.js`):
```javascript
{ test: /\.(woff2?|ttf|eot)$/, type: 'asset/inline' }
```

**Font files to bundle** (`.woff2` format preferred; `.woff` fallback):
- Space Grotesk Regular (400), Bold (700) — download from Google Fonts
- Geist Mono Medium (500), SemiBold (600) — download from Google Fonts
- Geist Pixel Square (400) — download from Vercel's GitHub (`vercel/geist-font` repo)

`styles.css` declares `@font-face` blocks at the top referencing files via `url('../fonts/...')`. After webpack build, these URLs are replaced with base64 data URIs automatically.

### `styles.css` — Dark Theme Rewrite

- `body` background → `var(--color-gray1)`; font-family → `var(--font-sans-serif)`
- All color references throughout the file updated to new CSS custom property names
- Font-family declarations use `var(--font-mono)` or `var(--font-mono-brand)` as appropriate
- Tab bar active state: `3px` solid `var(--color-mint10)` bottom border + radial gradient bg (mint → transparent upward) + `text-shadow` using `var(--color-mint9)` glow on label text
- Inter removed from `@font-face` and font stacks

---

## Layer 2: Component Visual Updates

### New Component: `mfw-section-header`

Implements the `// LABEL` pattern used in every panel above grouped content areas. This is distinct from `mfw-settings-section` (which wraps slotted children and is unchanged).

**Attributes:** `label` (string)

**DOM structure produced by `render()`:**
```html
<span class="section-header-prefix">//</span>
<span class="section-header-label">{label}</span>
```

**Styles:** prefix in Space Grotesk Bold `var(--color-gray6)`; label in `var(--font-mono-brand)` uppercase `0.66px` letter-spacing `var(--color-gray11)`.

Registered in `mfw-index.ts`. Catalog entry added to `ui-preview-shell.html`.

### Structural Changes

**`mfw-tab-bar`**
- Active tab: `3px` solid `var(--color-mint10)` bottom border; radial gradient bg (mint tones → transparent from below); `text-shadow` glow using `var(--color-mint9)`; label font: `var(--font-mono)` Medium `var(--font-size-sm)` `var(--color-mint11)`
- Inactive tabs: same font, `var(--color-gray11)`, subtle gray radial gradient bg
- Tab height: `42px`
- Tests: update expected active/inactive color class names if any; gradient background is CSS-only (no JS class change)

**`mfw-button`**
- `VARIANT_CLASS` map updated: `primary`, `destructive`, `ghost`
  - `secondary` → renamed to `ghost` (CSS class `btn-ghost`)
  - `link` → removed
  - `destructive` → new (CSS class `btn-destructive`)
- `primary`: `var(--color-mint10)` fill, `var(--color-mint9)` glow `box-shadow`, inset `var(--color-mint8)` shadow, `var(--color-gray1)` text, `var(--font-mono)` SemiBold `var(--font-size-md)`
- `destructive`: `var(--color-gray2)` bg, `var(--color-red11)` text, red inset shadow (`rgba(41,20,21,0.32)`), `var(--font-mono)` SemiBold `var(--font-size-md)`
- `ghost`: `var(--color-gray2)` bg, `var(--color-gray11)` text, `var(--color-gray3)` border, `var(--font-mono)` SemiBold `var(--font-size-md)`
- Min size: `32px` height, `96px` min-width, `8px` icon + label gap
- All callers updated: panel HTML `variant="secondary"` → `variant="ghost"`; `variant="link"` removed; `ui.ts` query references updated

**`mfw-drop-zone`**
- Icon container: `48×48px` `<div>`, `var(--color-mint10)` fill, `1px solid var(--color-mint8)` border, `var(--color-mint9)` glow `box-shadow`, inset `var(--color-mint8)` shadow
- Icon inside container: download SVG built with `document.createElementNS('http://www.w3.org/2000/svg', 'svg')` — no `innerHTML` (per CLAUDE.md constraint). SVG path data is a constant string passed to `createElementNS` path element's `d` attribute.
- Drop area background: radial vignette gradient (`#232323` center → `rgba(35,35,35,0.8)` edges) via CSS `background-image`
- Label: `var(--font-sans-serif)` Bold `var(--font-size-xxxl)` `var(--color-gray12)`
- Sub-label: `var(--font-mono-brand)` `var(--font-size-sm)` `var(--color-gray11)`
- Border: `1px solid var(--color-gray6)`, `var(--radius-sm)` radius

**`mfw-settings-row`**
- Label: `var(--font-mono)` Medium `var(--font-size-xl)` `var(--color-gray12)`
- Number input field: `28px` height, `64px` width, right-aligned value, same font
- Unit suffix (`px`): `var(--font-mono-brand)` `var(--font-size-lg)` `var(--color-gray11)`
- Select field variant: `130px` width; native `<select>` with `appearance: none` + chevron SVG appended via `createElementNS` (same approach as drop zone icon — no `innerHTML`)

**`mfw-status`** (structural change — not token-only)
- New `render()` DOM structure:
  ```html
  <span class="status-dot"></span>
  <span class="status-text">{message}</span>
  ```
- Dot: `6px` inline-block circle, color by type — info: `var(--color-gray11)`, success: `var(--color-mint10)`, error: `var(--color-red10)`
- Text: `var(--font-mono-brand)` `var(--font-size-sm)`, color by type — info/success: `var(--color-gray11)`, error: `var(--color-red11)`
- Whole element hidden when `message === ''` (unchanged behavior)

**`mfw-status` and `ui.ts` `showStatus()` alignment:**
`ui.ts` currently bypasses `mfw-status` and directly creates a `<p class="status-message">` in `initBottomBar()`. After Layer 2, `initBottomBar()` is updated to create the new dot+text DOM structure (same `<span class="status-dot">` + `<span class="status-text">`) directly, and `showStatus()` updates both spans. The imperative bottom-bar status and the declarative `mfw-status` component produce identical DOM structure and share the same CSS rules.

**`mfw-file-list`** (interface change)
- `FileItem` extended: `{ name: string; meta?: string }`
- `setFiles()` renders two-row layout per item: name row (Space Grotesk Bold `var(--font-size-xxl)` `var(--color-gray12)`) + optional meta row (`var(--font-mono-brand)` `var(--font-size-sm)` `var(--color-gray11)`)
- `meta` is optional — name-only items render a single row (backwards compatible)

**`mfw-paste-section`** (structural change)
- Toggle button and `paste-area-wrap hidden` pattern removed; paste area always visible
- New `render()` produces: `<textarea>` + `<div class="paste-actions">` (name input + import button) without a wrapping collapsed state
- Internal button class updated: `btn-secondary` → `btn-ghost`
- `reset()` updated: clears `textarea.value` and `nameInput.value` only (no `wrap.classList.add('hidden')` — nothing to hide). API preserved: `ui.ts` call to `pasteSectionEl.reset()` continues to work.
- `mfw-paste-import` event still fired on import action (unchanged)

### Token-Only Updates

| Component | Changes |
|---|---|
| `mfw-bottom-bar` | Bg → `var(--color-gray1)`, border-top → `var(--color-gray3)`, padding `12px 16px` |
| `mfw-loader` | Color tokens updated |
| `mfw-theme-selector` | Color tokens updated |
| `mfw-color-input` | Color tokens updated |

### Test Updates (Layer 2 scope)

| File | What changes |
|---|---|
| `tokens.test.ts` | All token key names updated (`Color.block` → `Color.gray1`, etc.) |
| `mfw-button.test.ts` | Variant classes: `btn-secondary` → `btn-ghost`; `btn-link` tests removed; `btn-destructive` tests added |
| `mfw-tab-bar.test.ts` | No JS logic changes expected; update only if CSS class names on active tab element change |
| `mfw-status.test.ts` | Assert `status-dot` span exists; assert color class per type |
| `mfw-file-list.test.ts` | Assert `meta` row rendered when `meta` provided; absent when not |
| `mfw-paste-section.test.ts` | Assert toggle button absent; assert `reset()` clears inputs only; assert `btn-ghost` on import button |

---

## Layer 3: Panel Layout Updates

### `panel-import.html`

**Normal state:**
```
<mfw-section-header label="MARKDOWN_FOR_WHAT">
<mfw-drop-zone>                           (160px height)
<div class="divider-row">                 (line — or paste Markdown text — line)
<mfw-paste-section>                       (always visible, no toggle)
<mfw-section-header label="SELECTED">
<mfw-file-list>
[preview pane — preserved unchanged, hidden by default, shown by showPreview()]
```

**Error state** — `ui.ts` adds class `error-state` to `.import-panel` when file validation fails; removes it on reset / Try Again:
```
<mfw-section-header label="IMPORT_ERROR">
<div class="error-center">               (centered, py-48px)
  icon container (48px, red10 fill/border/glow, alert SVG via createElementNS)
  error title                            (Space Grotesk Bold sizeXxxl gray12)
  error message                          (two lines, monoBrand sizeSm gray11)
<mfw-file-list>                          (invalid files with meta "unsupported format — .ext")
```
Bottom bar in error state: `mfw-status type="error" message="INVALID_FILE"` left, `<mfw-button variant="destructive" label="Try Again">` right.

### `panel-history.html`

```
<mfw-section-header label="RECENT IMPORTS">
<mfw-file-list id="history-list-component">
  [populated by ui.ts with meta "{date} · {n} blocks imported"]
<p id="history-empty">                   (preserved; shown when history is empty)
```

Bottom bar: `<span id="history-count">` count text (`var(--font-mono-brand)` `sizeSm` `gray11`) left, `<mfw-button id="clear-history-btn" variant="destructive" label="Clear History">` right.

**DOM ID note:** `#history-list` (the `<ul>` inside `mfw-file-list`) is now accessed via `mfw-file-list`'s `setFiles()` API rather than direct DOM query. `ui.ts` updated to use the component API. `#history-empty` and `#clear-history-btn` IDs are preserved on their elements so `ui.ts` query selectors continue to work.

### `panel-settings.html`

Four `<mfw-section-header>` + settings card sections:

1. `// THEME` — `<mfw-theme-selector>` (Light / Dark / Docs segments; active = mint fill)
2. `// SPACING` — settings card: `block_spacing` row, `list_spacing` row (both `<mfw-settings-row>`)
3. `// FRAME` — settings card: `padding` row, `width` row (select variant)
4. `// COLORS` — settings card: `frame_fill` row + swatch, `code_background` row + swatch

**Preserved sections** (visual token updates, layout unchanged): Style Mapping, Component Mapping, Content checkboxes, remaining Color inputs. These receive font and color token updates only — no structural changes, no ID changes.

Bottom bar: `<span class="version-text">MDW v4.1</span>` left (`gray8` monoBrand `sizeSm`), `<mfw-button variant="destructive" label="Reset Defaults">` right (id preserved: `#reset-btn`).

### `panel-export.html`

Export panel restructured: review-mode/diff UI replaced with an export log view.

**Symbols removed from `ui.ts`:**
- DOM references: `exportReviewBtn`, `exportReviewPanel`, `exportReviewBreadcrumb`, `exportReviewBlocks`, `exportReviewBack`, `exportConfirmBtn`
- Event listeners on the above
- Function: `renderReviewPanel()`
- State variable: `exportReviewSelections`

**New layout:**
```
<div class="export-file-info">
  <p class="export-filename">            (Space Grotesk Bold sizeDisplay gray12)
  <p class="export-meta">               (monoBrand sizeSm gray11 — block summary)
<div class="export-status-row">
  status dot (mint10) + READY_TO_EXPORT (mono SemiBold sizeMd mint11)
<div class="export-log-card">           (gray2 bg, gray3 border, 4px radius)
  <mfw-section-header label="EXPORT_LOG">
  <div id="export-log-entries">         (populated by ui.ts)
    log entry: check SVG + mono text (gray11)
    in-progress: loader SVG + text (orange11)
```

Bottom bar: `<mfw-button variant="ghost" label="Preview">` left, `<mfw-button variant="primary" label="Export.md">` right.

`ui.ts` changes: remove all 6 `exportReview*` DOM references and associated listeners; remove `renderReviewPanel()` and `exportReviewSelections`; add handlers to populate `#export-filename`, `#export-meta`, and `#export-log-entries` from existing plugin→ui message flow (message structure unchanged).

---

## What Is Not Changing

- Build pipeline (tokens → CSS, webpack, HTML assembly) — one new webpack `asset/inline` rule added only
- Web component architecture (no shadow DOM, safe DOM methods via `createElement`/`createElementNS`, reconnect guard)
- `mfw-index.ts` registration pattern
- `mfw-settings-section` component (wraps slotted settings content — distinct from new `mfw-section-header`)
- Panel/shell assembly system
- Import panel preview pane and its `showPreview()` / `hidePreview()` logic in `ui.ts`
- All plugin logic (`code.ts`, `parser.ts`, `renderer.ts`, `exporter.ts`, `settings.ts`, `tables.ts`, etc.)
- Parser, renderer, exporter, and settings tests
- Plugin→UI message format/contract
