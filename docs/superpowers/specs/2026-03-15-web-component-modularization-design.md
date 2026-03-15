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
- No new npm dependencies required

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

export function buildTokensCSS(): string { /* maps exports to CSS custom properties */ }
```

### File: `src/tokens.css` (generated — do not edit by hand)

Output of `npm run build:tokens`. Linked by `ui-preview.html` for fast-refresh iteration. All ~20+ previously hardcoded hex and spacing values in `styles.css` are replaced with `var(--*)` references. Variable names remain stable (`--color-block`, `--color-accent`, etc.) so existing component code requires no changes.

### Build script: `scripts/build-tokens.ts`

Calls `buildTokensCSS()` and writes the result to `src/tokens.css`. Runs in under 1 second via `ts-node`.

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
| `mfw-tab-bar` | `active` | Renders 4 tab buttons; owns all tab-switching logic; fires `mfw-tab-change` custom event. Replaces the duplicated inline `<script>` in `ui-preview.html`. |
| `mfw-bottom-bar` | — | Layout shell: flex row containing status area and action buttons. Children composed via DOM by `ui.ts`. |
| `mfw-paste-section` | — | "or paste Markdown" toggle button + collapsible textarea + frame-name input + Import Paste button. |
| `mfw-file-list` | — | Renders the `<ul>` of dropped/selected file items. |
| `mfw-settings-section` | `title` | Section wrapper with styled title bar and bottom border separator. |
| `mfw-settings-row` | `label`, `type` (`number`\|`select`\|`checkbox`\|`color`), `id`, `min`, `max`, `unit`, `placeholder` | Renders label + the appropriate input element for the given `type`. Fires native `change` events. Covers the ~12 repeating settings rows. |
| `mfw-theme-selector` | `active` | Three-button segmented control (Light / Dark / Docs). Fires `mfw-theme-change` event. |
| `mfw-color-input` | `id`, `placeholder` | Paired text input + color swatch (`<input type="color">`). Used for the 4 color settings rows. |
| `mfw-loader` | `visible` | Fixed overlay with spinner animation and "Importing…" message. Replaces the `#loader` div. |

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

### Build script: `scripts/build-html.ts`

Reads each shell template, replaces markers with the corresponding panel partial content, writes the output files. Running `npm run build:html` updates both `ui.html` and `ui-preview.html` atomically.

### Sync rule — eliminated

The old CLAUDE.md rule ("keep ui.html and ui-preview.html character-for-character identical") is replaced with: **edit panels in `src/panels/`, run `npm run build:html` to regenerate both files.** Both output files are committed to git so the plugin works without a build step for contributors who only consume the UI.

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
