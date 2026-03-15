# MarkDown For What — Plugin Dev Instructions

## UI Dev Harness

`ui-preview.html` is a browser-based preview for iterating on the plugin UI without
reloading Figma. Open it directly in any browser:

    open figma-markdown-sync/ui-preview.html

**Iteration workflow:**
- Edit `src/styles.css` → refresh browser → see changes immediately (no build needed)
- Edit `src/components/*.ts` → run `npm run build` (from `figma-markdown-sync/`) → refresh
- Edit `ui.html` → apply the same change in `ui-preview.html` (see Sync Rule below)

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

- Use safe DOM methods only: `createElement`, `textContent`, `setAttribute`
  Never write raw HTML string content directly into the DOM

**Design tokens:** CSS custom properties in `src/styles.css` (e.g., `--color-block`,
`--color-accent`) are canonical. Never hardcode color or spacing values in component TS.

**When to create a new component:** Any UI element appearing in 2+ places, or any
element with meaningful interactive state, should become a component.

**Tab ownership:** `mfw-tab-bar` owns all tab switching logic. When it exists, the
`querySelectorAll('.tab')` code in `ui.ts` must be deleted. They must not coexist.

## Sync Rule

The four tab panels inside the 320x500 frame in `ui-preview.html` must stay
character-for-character identical to their counterparts in `ui.html`. Only the outer
shell and the Component Catalog section below the frame may differ.

When modifying tab panel HTML:
1. Make the change in `ui.html`
2. Apply the identical change in `ui-preview.html`

## Component Tests

Component tests live in `src/components/__tests__/` and use `@jest-environment jsdom`.
Run with:

    cd figma-markdown-sync && npm test
