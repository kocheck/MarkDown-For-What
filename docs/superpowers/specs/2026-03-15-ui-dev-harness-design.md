# UI Dev Harness & Mini Design System

**Date:** 2026-03-15
**Status:** Approved

## Overview

Set up a fast UI iteration loop for the Figma plugin without needing to reload Figma on every change. Introduce a Web Components-based mini design system so UI elements can be built once and reused as the plugin UI evolves.

## Goals

- Edit CSS or component markup and see the result in a browser in under one second (refresh)
- Establish a component authoring pattern using vanilla Web Components that the developer can learn from
- Document the setup in CLAUDE.md so Claude understands the workflow and respects it in future sessions

## Non-Goals

- No framework (React, Vue, Lit) — vanilla Web Components only
- No Storybook or separate design tooling
- No shadow DOM (for now) — components share the existing stylesheet for simplicity

---

## Prerequisites

**TypeScript target must be ES2017 or later.** The current `tsconfig.json` targets ES5, which is incompatible with Web Components. TypeScript's ES5 transpilation converts `class` syntax to constructor functions; the `customElements.define()` API requires a real ES6 class and will throw `TypeError: Class constructor HTMLElement cannot be invoked without 'new'` at runtime.

Before authoring any component, update `figma-markdown-sync/tsconfig.json`:
```json
"target": "es2017"
```

Verify the existing `lib` array includes `"es6"` (alias for `"es2015"`) — the current config does, so no additional `lib` changes are needed.

---

## Piece 1 — ui-preview.html

**Location:** `figma-markdown-sync/ui-preview.html`

A standalone HTML file that renders the full plugin UI in a Figma-sized frame (320x500px) directly in the browser. It is not compiled or bundled — it links to `src/styles.css` via a relative link tag so CSS changes are visible on browser refresh with no build step.

### Structure

- A fixed 320x500px framed container styled to match the Figma plugin panel
- Full tab bar with working JS click handlers to switch between Import, History, Settings, and Export tab panels
- All four tab panel contents rendered (same HTML as `ui.html`)
- A **Component Catalog** section below the plugin frame — every Web Component rendered in isolation with its available variants (e.g., button primary/secondary/disabled, tab active/inactive)

### Workflow

```
Edit src/styles.css  ->  refresh browser  ->  see changes
Edit src/components/*.ts  ->  npm run build  ->  refresh browser  ->  see changes
```

### How it loads styles and components

`ui-preview.html` loads two things:

1. `<link rel="stylesheet" href="src/styles.css">` — links the source CSS file directly, so edits are visible on browser refresh with no build step
2. `<script src="dist/components.js">` — a **separate webpack entry point** (see Webpack section below) that registers all `mfw-*` components without executing the Figma-specific plugin code in `ui.ts`

`dist/ui.js` must **not** be loaded in the preview page. It contains `postMessage` calls to the Figma plugin API that throw in a plain browser context, and its DOM queries assume `ui.html`'s exact structure.

### Webpack: separate components entry point

Add a `components` entry to `webpack.config.js`:

```js
entry: {
  ui: './src/ui.ts',
  code: './code.ts',
  components: './src/components/mfw-index.ts',  // new
}
```

This produces `dist/components.js` — a bundle containing only the component class definitions and `customElements.define()` calls. No Figma API usage, safe to load in any browser context.

### Important notes

- `ui-preview.html` is a **dev file only** — never compiled into `dist/`, never shipped with the plugin
- The four tab panels inside the 320x500 frame must be kept character-for-character identical to their counterparts in `ui.html`; only the outer shell and the component catalog section below the frame should differ
- The tab bar in the preview must use the same JS click handler approach as `ui.html` to accurately reflect real plugin behavior

---

## Piece 2 — Web Components (`src/components/`)

**Location:** `figma-markdown-sync/src/components/`

Each reusable UI element gets its own TypeScript file following a shared authoring pattern. All components are registered in a single index file imported by `ui.ts`.

### Naming convention

- Custom element tag: `mfw-*` (e.g., `mfw-button`, `mfw-tab-bar`)
- File name matches tag: `mfw-button.ts`, `mfw-tab-bar.ts`
- Index: `mfw-index.ts` — imports and registers all components

### Component pattern

Components extend `HTMLElement`, read their attributes in `connectedCallback`, and use safe DOM methods (`createElement`, `textContent`, `setAttribute`) rather than setting raw HTML strings. This avoids XSS risk and keeps component internals inspectable.

`render()` must clear existing children before appending new ones, to avoid double-rendering when an element is moved in the DOM (which triggers a disconnect/reconnect cycle).

```typescript
class MfwButton extends HTMLElement {
  connectedCallback() {
    this.render()
  }

  render() {
    // Clear first to guard against reconnect double-render
    while (this.firstChild) this.removeChild(this.firstChild)

    const variant = this.getAttribute('variant') ?? 'primary'
    const label = this.getAttribute('label') ?? ''
    const btn = document.createElement('button')
    btn.className = `btn btn--${variant}`
    btn.textContent = label
    this.appendChild(btn)
  }
}

customElements.define('mfw-button', MfwButton)
```

### No shadow DOM

Components do **not** use shadow DOM. They append child elements directly and rely on `src/styles.css` for all styling. This means:
- Components automatically pick up design token changes (CSS variables)
- No need to duplicate or import styles inside each component
- Easier to inspect and debug in browser DevTools

Shadow DOM can be added to individual components later if encapsulation becomes necessary.

### Initial components to extract (first pass)

| Component | Tag | Replaces |
|---|---|---|
| Primary/secondary button | `mfw-button` | All button elements in the UI |
| Tab bar | `mfw-tab-bar` | The nav.tab-bar + tab switching logic |
| Status message | `mfw-status` | The #status-message paragraph |
| Drop zone | `mfw-drop-zone` | The #drop-zone div |

Start with `mfw-button` as the first component to establish the pattern, then extract others incrementally as the UI is redesigned. `mfw-tab-bar` should be introduced only after `mfw-button` is verified working, because it carries a behavioral ownership shift (see note below) that the other components do not.

**Note on `mfw-tab-bar`:** `ui.ts` currently manages tab switching via `document.querySelectorAll('.tab')`. When `mfw-tab-bar` is introduced, it takes full ownership of that logic — the corresponding code in `ui.ts` is deleted. The two must not coexist.

### Webpack integration

Components live in `src/components/` and are TypeScript files. Two integration points:

1. `src/ui.ts` imports `./components/mfw-index` — components are bundled into `dist/ui.js` for production
2. `webpack.config.js` gets a new `components` entry (`./src/components/mfw-index.ts`) that produces `dist/components.js` — used exclusively by `ui-preview.html`

---

## Piece 3 — CLAUDE.md

**Location:** `figma-markdown-sync/CLAUDE.md`

Instructions that persist across sessions so Claude understands the dev setup and component system without needing re-explanation.

### Contents

1. **What ui-preview.html is** — the browser-based dev harness; not a production file; loads `src/styles.css` directly and `dist/components.js` (not `dist/ui.js`)
2. **Iteration workflow** — CSS changes need only a browser refresh; TS/component changes need `npm run build` first
3. **Component conventions** — `mfw-*` naming, one file per component, registered in `mfw-index.ts`, no shadow DOM, safe DOM methods only (no raw HTML string injection), always clear children before re-rendering
4. **Design tokens** — CSS custom properties defined in `src/styles.css` are canonical; never hardcode color/spacing values in component code
5. **When to create a new component** — any UI element appearing in 2+ places, or any element with meaningful interactive state, should become a component
6. **Keeping files in sync** — the four tab panels inside the 320x500 frame in `ui-preview.html` must be character-for-character identical to their counterparts in `ui.html`; only the outer shell and component catalog section below the frame may differ
7. **Tab ownership rule** — `mfw-tab-bar` owns all tab switching logic; if it exists, the corresponding code in `ui.ts` must be removed (they must not coexist)

---

## File Change Summary

| File | Action |
|---|---|
| `figma-markdown-sync/tsconfig.json` | Modify — set `"target": "es2017"` |
| `figma-markdown-sync/webpack.config.js` | Modify — add `components` entry point |
| `figma-markdown-sync/ui-preview.html` | Create |
| `figma-markdown-sync/src/components/mfw-button.ts` | Create |
| `figma-markdown-sync/src/components/mfw-tab-bar.ts` | Create |
| `figma-markdown-sync/src/components/mfw-status.ts` | Create |
| `figma-markdown-sync/src/components/mfw-drop-zone.ts` | Create |
| `figma-markdown-sync/src/components/mfw-index.ts` | Create |
| `figma-markdown-sync/src/ui.ts` | Modify — import `mfw-index.ts`; remove tab switching logic when `mfw-tab-bar` is added |
| `figma-markdown-sync/ui.html` | Modify — replace elements with mfw-* tags |
| `figma-markdown-sync/CLAUDE.md` | Create |
| `.gitignore` | Already updated — `.superpowers/` excluded |
