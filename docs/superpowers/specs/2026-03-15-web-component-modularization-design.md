# Web Component Modularization & Design Token System

**Date:** 2026-03-15
**Status:** Approved

## Overview

Break the plugin UI into a full set of vanilla web components backed by a TypeScript design token system. This lays the groundwork for a redesign by making every visual value swappable in one file and every UI element independently testable and renderable in the dev harness.

## Goals

- All UI elements are `mfw-*` web components
- All design values (colors, spacing, typography, transitions) are CSS custom properties sourced from a single `src/tokens.ts` file
- The manual sync rule between `ui.html` and `ui-preview.html` is eliminated
- The existing fast-refresh dev workflow is preserved
- One new devDependency: `ts-node` (to run build scripts; `ts-jest` is already present but `ts-node` must be declared explicitly)

## Architecture

### Approach: tokens.ts → generated CSS + build-html script

`src/tokens.ts` is the single source of truth for all design tokens. A lightweight build script (`scripts/build-tokens.ts`) reads the token exports and writes `src/tokens.css`. A second script (`scripts/build-html.ts`) assembles `ui.html` and `ui-preview.html` from panel partials in `src/panels/`.

```
src/tokens.ts          ──build:tokens──▶  src/tokens.css
src/panels/*.html      ──build:html────▶  ui.html
                                          ui-preview.html
src/components/*.ts    ──build (webpack)▶ dist/components.js
                                          dist/ui.js
```

## Section 1: Token System

### File: `src/tokens.ts`

Exports typed constants organized into namespaces and a `buildTokensCSS()` function that returns the full `:root { ... }` block as a string.

```ts
export const Color = {
  block:         '#1B3543',
  accent:        '#52C7A0',
  bg:            '#EFF4F2',
  bgAlt:         '#E6EDEB',
  border:        '#D8E5E0',
  borderSubtle:  '#F0F0F0',
  textPrimary:   '#333',
  textSecondary: '#555',
  textMuted:     '#888',
  textHint:      '#6B8E82',
  success:       '#18A449',
  warning:       '#9B6E00',
  error:         '#D32F2F',
} as const;

export const Spacing = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
} as const;

export const Radius = {
  sm: '4px',
  md: '6px',
  lg: '8px',
} as const;

export const Font = {
  sizeXs:      '10px',
  sizeSm:      '11px',
  sizeMd:      '12px',
  sizeLg:      '13px',
  weightNormal: '400',
  weightMedium: '500',
  weightBold:   '600',
} as const;

export const Transition = {
  fast:    '0.15s',
  spinner: '0.7s linear',
} as const;

export function buildTokensCSS(): string {
  // Iterates each namespace object and maps keys to CSS custom properties.
  // Naming convention: namespace prefix (lowercased) + camelCase key → kebab-case CSS var.
  //   Color.block      → --color-block
  //   Color.bgAlt      → --color-bg-alt
  //   Spacing.xs       → --spacing-xs
  //   Font.sizeXs      → --font-size-xs
  //   Font.weightBold  → --font-weight-bold
  //   Radius.sm        → --radius-sm
  //   Transition.fast  → --transition-fast
  // camelCase keys are split at uppercase boundaries and joined with hyphens.
  // Returns a complete ':root { ... }' block as a string.
}
```

### File: `src/tokens.css` (generated — do not edit by hand)

Output of `npm run build:tokens`. Variable names remain stable (`--color-block`, `--color-accent`, etc.) so existing component code requires no changes.

**Production path:** `src/styles.css` gains an `@import './tokens.css';` at the top. `ui.ts` already imports `styles.css`, which webpack bundles via `css-loader` + `style-loader`. The `@import` causes `tokens.css` to be included in that same bundle automatically — no changes to webpack config or `ui.ts` are needed.

**Dev harness path:** `ui-preview.html`'s shell template links `src/tokens.css` directly via `<link rel="stylesheet" href="src/tokens.css">` (same as the existing `src/styles.css` link). Both files are served as-is from disk, so editing `tokens.ts` → running `build:tokens` → refreshing the browser shows token changes immediately.

### Build script: `figma-markdown-sync/scripts/build-tokens.ts`

Calls `buildTokensCSS()` and writes the result to `src/tokens.css`. Runs in under 1 second via `ts-node`.

All scripts live under `figma-markdown-sync/scripts/` — the same directory level as `webpack.config.js`. All `package.json` script paths are relative to `figma-markdown-sync/`.

## Section 2: Component Inventory

All components follow existing conventions: no shadow DOM, DOM methods only (`createElement`, `textContent`, `setAttribute`), `while (this.firstChild) this.removeChild(this.firstChild)` guard in `render()`, registered in `src/components/mfw-index.ts`.

### Existing (unchanged)

| Tag | Purpose |
|---|---|
| `mfw-button` | Button with `variant` (primary \| secondary \| link) |
| `mfw-status` | Status message with `type` (info \| success \| error) |
| `mfw-drop-zone` | File drop target with `label`, `sub-label`, `accept`, `input-id` |

### New components

| Tag | Key Attributes | Responsibility |
|---|---|---|
| `mfw-tab-bar` | `active` | Renders 4 tab buttons; owns all tab-switching logic; fires `mfw-tab-change` (`detail: { tab: 'import' \| 'history' \| 'settings' \| 'export' }`) custom event. `active` attribute accepts the same 4 string values. Replaces the duplicated inline `<script>` in `ui-preview.html`. |
| `mfw-bottom-bar` | — | Pure layout shell. `render()` creates a flex-row container with two fixed child slots: a status area (left, `flex:1`) and a buttons area (right). `ui.ts` appends `mfw-status` and `mfw-button` elements into those slots after `connectedCallback` using `querySelector('[data-slot="status"]')` and `querySelector('[data-slot="actions"]')`. The component renders no semantic content of its own. |
| `mfw-paste-section` | — | Toggle button + collapsible textarea + frame-name input + Import Paste button. Fires `mfw-paste-import` (`detail: { text: string, name: string }`) when the Import Paste button is clicked. The expanded/collapsed state is managed internally. `ui.ts` listens for `mfw-paste-import` on the element — it does not reach into the component's DOM by ID. |
| `mfw-file-list` | — | Renders the `<ul>` of file items. Populated via an imperative `setFiles(files: Array<{ name: string, size: number }>) ` method called by `ui.ts`. Does not fire events. |
| `mfw-settings-section` | `title` | Section wrapper with styled title bar and bottom border separator. |
| `mfw-settings-row` | `label`, `type` (`number`\|`select`\|`checkbox`), `id`, `min`, `max`, `unit`, `placeholder` | Renders label + the appropriate input element for `type`. `type="select"` rows are populated via an imperative `setOptions(items: Array<{ value: string, label: string }>) ` method called by `ui.ts` after the element is connected. Fires native `change` events on the rendered input. Covers ~8 repeating settings rows. Does **not** handle color — color rows use `mfw-color-input` directly. |
| `mfw-theme-selector` | `active` | Three-button segmented control. Valid `active` values and event detail values: `'minimal-light'`, `'dark-mode'`, `'documentation'` (matching the existing `data-theme` values). Fires `mfw-theme-change` (`detail: { theme: 'minimal-light' \| 'dark-mode' \| 'documentation' }`) custom event. |
| `mfw-color-input` | `id`, `placeholder` | Paired text input + color swatch (`<input type="color">`). The `id` attribute is applied to the text `<input>` element, allowing `ui.ts` to identify which of the 4 instances fired via `event.target.id`. The text input and swatch are kept in sync: changing either updates the other. Fires native `change` on the text input. |
| `mfw-loader` | `visible` (boolean presence attribute) | Fixed overlay with spinner animation and "Importing…" message. Attribute presence = visible; attribute absence = hidden. `ui.ts` shows/hides via `setAttribute('visible', '')` / `removeAttribute('visible')`. Replaces the `#loader` div and its `.hidden` class toggle. |

Each new component gets a corresponding test file in `src/components/__tests__/` using `@jest-environment jsdom`.

Each new component gets a catalog entry in `ui-preview.html`'s Component Catalog section.

## Section 3: Panel Partials + HTML Assembly

### Panel partial files

```
figma-markdown-sync/src/panels/
  panel-import.html
  panel-history.html
  panel-settings.html
  panel-export.html
```

Each file contains exactly one `<div id="tab-*" class="tab-panel ...">` block using the new component tags internally. No outer shell, no `<head>`, no scripts.

### Shell templates

```
figma-markdown-sync/src/shells/
  ui-shell.html          — production shell (no catalog, no outer styling)
  ui-preview-shell.html  — dev harness shell (dark background, catalog section, token link)
```

Shells contain `<!-- PANEL:import -->`, `<!-- PANEL:history -->`, `<!-- PANEL:settings -->`, `<!-- PANEL:export -->` injection markers.

### Build script: `figma-markdown-sync/scripts/build-html.ts`

Reads each shell template, replaces markers with the corresponding panel partial content, writes the output files. Running `npm run build:html` updates both `ui.html` and `ui-preview.html` atomically.

### Sync rule — eliminated

The old CLAUDE.md rule ("keep ui.html and ui-preview.html character-for-character identical") is replaced with: **edit panels in `src/panels/`, run `npm run build:html` to regenerate both files.**

### Output file roles

| File | Role | Committed? |
|---|---|---|
| `figma-markdown-sync/ui.html` | Source template read by webpack; generated by `build:html` | Yes |
| `figma-markdown-sync/ui-preview.html` | Dev harness; generated by `build:html` | Yes |
| `figma-markdown-sync/dist/ui.html` | Webpack output; what `manifest.json` points to | Yes (plugin won't load without it) |

Both generated source files (`ui.html`, `ui-preview.html`) are committed so contributors can open the dev harness without running a build. `dist/ui.html` is also committed as the deployable artifact.

## Section 4: Dev Workflow

| What you're changing | Command | Then |
|---|---|---|
| Design tokens (`src/tokens.ts`) | `npm run build:tokens` | Refresh browser |
| Panel HTML (`src/panels/*.html`) | `npm run build:html` | Refresh browser |
| Component logic (`src/components/*.ts`) | `npm run build` | Refresh browser |
| Global styles (`src/styles.css`) | — | Refresh browser (no build) |
| Everything | `npm run build:ui` | Refresh browser |

### New `package.json` scripts

```json
"build:tokens": "ts-node scripts/build-tokens.ts",
"build:html":   "ts-node scripts/build-html.ts",
"build:ui":     "npm run build:tokens && npm run build:html && npm run build"
```

The existing `build` script (webpack) is unchanged.

**Important:** `npm run build` (webpack) reads `ui.html` as its template. Running `build` alone after changing panel partials will produce a stale `dist/ui.html`. Always use `npm run build:ui` for full rebuilds, or run `build:html` before `build` when only panel HTML has changed.

`ts-node` must be added as an explicit devDependency (`npm install --save-dev ts-node`) even though `ts-jest` is already present. The build scripts invoke `ts-node` directly via npm scripts, which requires it to be resolvable as a bin.

### CLAUDE.md updates required

- Replace the Sync Rule section: panels now live in `src/panels/`, edit there and run `build:html`
- Add: tokens source of truth is `src/tokens.ts` — never edit `src/tokens.css` by hand
- Add catalog entry convention: every new component must have a catalog row in the preview shell
- Remove the `querySelectorAll('.tab')` warning — that code is replaced by `mfw-tab-bar`

## Out of Scope

- No changes to `code.ts`, `renderer.ts`, `parser.ts`, or any plugin logic
- No shadow DOM — all components continue using global `src/styles.css`
- No redesign of visual appearance — tokens are extracted from current values, not new ones
- The Export tab's review panel and diff UI are not componentized in this pass (complex, stateful, low repetition)
