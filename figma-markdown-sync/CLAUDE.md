# MarkDown For What — Plugin Dev Instructions

## UI Dev Harness

`ui-preview.html` is a browser-based preview for iterating on the plugin UI without
reloading Figma. Open it directly in any browser:

    open figma-markdown-sync/ui-preview.html

**Iteration workflow:**
- Edit `src/styles.css` → refresh browser → see changes immediately (no build needed)
- Edit `src/components/*.ts` → run `npm run build` (from `figma-markdown-sync/`) → refresh
- Edit panel HTML in `src/panels/` → run `npm run build:html` → refresh

**What it loads:**
- `src/styles.css` via a direct link tag (source file, no build artifact)
- `dist/components.js` — the components-only bundle
- Do NOT load `dist/ui.js` in the preview — it contains Figma postMessage calls
  that throw in a plain browser context

## Web Components

All reusable UI elements live in `src/components/` as vanilla Web Components.

**Conventions:**
- Tag names: `mfw-*` (e.g., `mfw-button`, `mfw-tab-bar`)
- File names match tags: `mfw-button.ts`, `mfw-tab-bar.ts`
- All components registered in `src/components/mfw-index.ts`
- No shadow DOM — components append children directly; styles from `src/styles.css`
- Always clear children before re-rendering (guard against reconnect double-render):

      while (this.firstChild) this.removeChild(this.firstChild)

  **Exception:** `mfw-settings-section` intentionally skips this guard so that
  host-projected (slotted) children added after connection are preserved across
  re-renders triggered by attribute changes.

- Use safe DOM methods only: `createElement`, `textContent`, `setAttribute`
  Never write raw HTML string content directly into the DOM

**Design tokens:** `src/tokens.ts` is the canonical source for all design values
(colors, spacing, typography, transitions). Running `npm run build:tokens` generates
`src/tokens.css`. **Never edit `src/tokens.css` by hand** — it is generated.
CSS custom properties in `src/styles.css` use `var(--*)` references sourced from tokens.

**When to create a new component:** Any UI element appearing in 2+ places, or any
element with meaningful interactive state, should become a component.

**Tab bar:** `mfw-tab-bar` owns all tab switching logic and fires `mfw-tab-change` events.
Do not add `querySelectorAll('.tab')` code to `ui.ts` — it will conflict.

**Catalog entries:** Every new component must have a catalog row in
`src/shells/ui-preview-shell.html`'s Component Catalog section.

## Source Files (Generated Outputs)

`ui.html` and `ui-preview.html` are generated — do not edit them directly.

Panel HTML lives in `src/panels/`. Shell templates live in `src/shells/`.
Run `npm run build:html` after editing either to regenerate both output files.

**Important:** `npm run build` (webpack) reads `ui.html` as its template. Always run
`build:html` before `build` when panel HTML has changed. Use `npm run build:ui` for
full rebuilds (tokens → html → webpack).

## Component Tests

Component tests live in `src/components/__tests__/` and use `@jest-environment jsdom`.
Run with:

    cd figma-markdown-sync && npm test
