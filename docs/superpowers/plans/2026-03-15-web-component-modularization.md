# Web Component Modularization & Design Token System — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract all plugin UI elements into `mfw-*` web components, replace hardcoded values in `styles.css` with CSS custom properties sourced from a typed `src/tokens.ts` file, and eliminate the manual HTML sync rule by generating `ui.html` and `ui-preview.html` from shared panel partials.

**Architecture:** `src/tokens.ts` exports token namespaces and a `buildTokensCSS()` function; `scripts/build-tokens.ts` writes the generated `src/tokens.css`, which is `@import`-ed by `styles.css`. Four panel partials in `src/panels/` are assembled into output HTML by `scripts/build-html.ts` using shell templates from `src/shells/`. Nine new `mfw-*` components are registered via `src/components/mfw-index.ts`; `src/ui.ts` is updated to use the new component event APIs.

**Tech Stack:** TypeScript, vanilla Web Components (no shadow DOM), Jest + jsdom for tests, ts-node for build scripts, webpack for production bundle.

---

## File Structure

**New files:**
```
figma-markdown-sync/
  src/
    tokens.ts                          — token namespaces + buildTokensCSS()
    tokens.css                         — generated; committed; do not edit
    tokens.test.ts                     — tests for buildTokensCSS()
    panels/
      panel-import.html                — import tab panel partial
      panel-history.html               — history tab panel partial
      panel-settings.html              — settings tab panel partial
      panel-export.html                — export tab panel partial
    shells/
      ui-shell.html                    — production HTML shell with injection markers
      ui-preview-shell.html            — dev harness HTML shell with catalog section
    components/
      mfw-tab-bar.ts
      mfw-loader.ts
      mfw-theme-selector.ts
      mfw-bottom-bar.ts
      mfw-settings-section.ts
      mfw-settings-row.ts
      mfw-color-input.ts
      mfw-paste-section.ts
      mfw-file-list.ts
      __tests__/
        mfw-tab-bar.test.ts
        mfw-loader.test.ts
        mfw-theme-selector.test.ts
        mfw-bottom-bar.test.ts
        mfw-settings-section.test.ts
        mfw-settings-row.test.ts
        mfw-color-input.test.ts
        mfw-paste-section.test.ts
        mfw-file-list.test.ts
  scripts/
    build-tokens.ts                    — CLI: writes src/tokens.css
    build-html.ts                      — CLI: assembles ui.html + ui-preview.html
```

**Modified files:**
```
figma-markdown-sync/
  package.json                         — add ts-node devDep; add build:tokens, build:html, build:ui
  src/styles.css                       — @import tokens.css; replace hardcoded values with var()
  src/components/mfw-index.ts          — register all 9 new components
  src/ui.ts                            — wire new component event APIs; update DOM refs
  ui.html                              — becomes generated output (initially hand-bootstrapped)
  ui-preview.html                      — becomes generated output (initially hand-bootstrapped)
  CLAUDE.md                            — update workflow docs
```

---

## Chunk 1: Token Foundation

### Task 1: Install ts-node and write the failing test for `buildTokensCSS`

**Files:**
- Create: `figma-markdown-sync/src/tokens.test.ts`
- Modify: `figma-markdown-sync/package.json`

- [ ] **Step 1: Install ts-node**

```bash
cd figma-markdown-sync
npm install --save-dev ts-node
```

Expected: `ts-node` appears in `package.json` devDependencies.

- [ ] **Step 2: Write the failing test**

Create `figma-markdown-sync/src/tokens.test.ts`:

```ts
// No @jest-environment annotation needed — runs in Node (default)
import { buildTokensCSS, Color, Font } from './tokens';

describe('buildTokensCSS', () => {
  let css: string;

  beforeAll(() => {
    css = buildTokensCSS();
  });

  it('returns a :root block', () => {
    expect(css.trimStart()).toMatch(/^:root \{/);
    expect(css.trimEnd()).toMatch(/\}$/);
  });

  it('maps Color.block to --color-block', () => {
    expect(css).toContain(`--color-block: ${Color.block}`);
  });

  it('maps camelCase Color.bgAlt to --color-bg-alt', () => {
    expect(css).toContain(`--color-bg-alt: ${Color.bgAlt}`);
  });

  it('maps Font.sizeXs to --font-size-xs', () => {
    expect(css).toContain(`--font-size-xs: ${Font.sizeXs}`);
  });

  it('maps Font.weightBold to --font-weight-bold', () => {
    expect(css).toContain(`--font-weight-bold: ${Font.weightBold}`);
  });

  it('maps Color.textPrimary to --color-text-primary', () => {
    expect(css).toContain(`--color-text-primary: ${Color.textPrimary}`);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd figma-markdown-sync && npm test -- --testPathPattern=src/tokens.test.ts
```

Expected: FAIL with `Cannot find module './tokens'`

---

### Task 2: Implement `src/tokens.ts`

**Files:**
- Create: `figma-markdown-sync/src/tokens.ts`

- [ ] **Step 1: Write `tokens.ts`**

Create `figma-markdown-sync/src/tokens.ts`:

```ts
export const Color = {
  block:         '#1B3543',
  accent:        '#52C7A0',
  bg:            '#EFF4F2',
  bgAlt:         '#E6EDEB',
  border:        '#D8E5E0',
  borderSubtle:  '#F0F0F0',
  textPrimary:   '#333333',
  textSecondary: '#555555',
  textMuted:     '#888888',
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
  sizeXs:       '10px',
  sizeSm:       '11px',
  sizeMd:       '12px',
  sizeLg:       '13px',
  weightNormal: '400',
  weightMedium: '500',
  weightBold:   '600',
} as const;

export const Transition = {
  fast:    '0.15s',
  spinner: '0.7s linear',
} as const;

type TokenRecord = Record<string, string>;

const NAMESPACES: Record<string, TokenRecord> = {
  color:      Color      as unknown as TokenRecord,
  spacing:    Spacing    as unknown as TokenRecord,
  radius:     Radius     as unknown as TokenRecord,
  font:       Font       as unknown as TokenRecord,
  transition: Transition as unknown as TokenRecord,
};

/** Converts camelCase to kebab-case: "bgAlt" → "bg-alt", "sizeXs" → "size-xs" */
function toKebab(camel: string): string {
  return camel.replace(/([A-Z])/g, '-$1').toLowerCase();
}

/** Returns a :root { ... } block with all token namespaces as CSS custom properties. */
export function buildTokensCSS(): string {
  const lines: string[] = [':root {'];
  for (const [ns, tokens] of Object.entries(NAMESPACES)) {
    for (const [key, value] of Object.entries(tokens)) {
      lines.push(`  --${ns}-${toKebab(key)}: ${value};`);
    }
  }
  lines.push('}');
  return lines.join('\n');
}
```

- [ ] **Step 2: Run test to verify it passes**

```bash
cd figma-markdown-sync && npm test -- --testPathPattern=src/tokens.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 3: Commit**

```bash
cd figma-markdown-sync
git add src/tokens.ts src/tokens.test.ts package.json package-lock.json
git commit -m "feat: add design token system with buildTokensCSS"
```

---

### Task 3: Build script, `@import`, and `styles.css` token replacements

**Files:**
- Create: `figma-markdown-sync/scripts/build-tokens.ts`
- Modify: `figma-markdown-sync/package.json`
- Modify: `figma-markdown-sync/src/styles.css`

- [ ] **Step 1: Create the build script**

Create `figma-markdown-sync/scripts/build-tokens.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';
import { buildTokensCSS } from '../src/tokens';

const outPath = path.resolve(__dirname, '../src/tokens.css');
const header = '/* GENERATED — do not edit by hand. Run: npm run build:tokens */\n';
fs.writeFileSync(outPath, header + buildTokensCSS() + '\n', 'utf-8');
console.log('tokens.css written to', outPath);
```

- [ ] **Step 2: Add `build:tokens` to package.json scripts**

In `figma-markdown-sync/package.json`, add to the `"scripts"` object:

```json
"build:tokens": "ts-node scripts/build-tokens.ts"
```

- [ ] **Step 3: Run `build:tokens` and verify the output**

```bash
cd figma-markdown-sync && npm run build:tokens
```

Expected output: `tokens.css written to .../src/tokens.css`

Open `src/tokens.css` and confirm it begins with `:root {` and contains entries like `--color-block: #1B3543;` and `--font-size-xs: 10px;`.

- [ ] **Step 4: Add `@import` to `src/styles.css`**

Add this as the very first line of `figma-markdown-sync/src/styles.css`:

```css
@import './tokens.css';
```

Remove the existing `:root { --color-block: ...; --color-accent: ...; }` block (lines 1-5 of the current file) — these values are now in `tokens.css`.

- [ ] **Step 5: Replace hardcoded values in `src/styles.css` with CSS custom properties**

Apply the following replacements throughout `src/styles.css`. Only replace in the plugin chrome sections (before the export panel). Leave `var(--figma-color-*)` references and rgba/derived values untouched.

**Color replacements:**

| Find | Replace with |
|---|---|
| `#1B3543` | `var(--color-block)` |
| `#52C7A0` | `var(--color-accent)` |
| `#EFF4F2` | `var(--color-bg)` |
| `#E6EDEB` | `var(--color-bg-alt)` |
| `#D8E5E0` | `var(--color-border)` |
| `#F0F0F0` | `var(--color-border-subtle)` |
| `color: #333` | `color: var(--color-text-primary)` |
| `color: #555` | `color: var(--color-text-secondary)` |
| `color: #888` | `color: var(--color-text-muted)` |
| `color: #6B8E82` | `color: var(--color-text-hint)` |
| `color: #18A449` | `color: var(--color-success)` |
| `color: #9B6E00` | `color: var(--color-warning)` |
| `color: #D32F2F` | `color: var(--color-error)` |

**Border-radius replacements:**

| Find | Replace with |
|---|---|
| `border-radius: 8px` | `border-radius: var(--radius-lg)` |
| `border-radius: 6px` | `border-radius: var(--radius-md)` |
| `border-radius: 4px` | `border-radius: var(--radius-sm)` |

**Font replacements** (only in lines not inside the export/review panel section):

| Find | Replace with |
|---|---|
| `font-size: 10px` | `font-size: var(--font-size-xs)` |
| `font-size: 11px` | `font-size: var(--font-size-sm)` |
| `font-size: 12px` | `font-size: var(--font-size-md)` |
| `font-size: 13px` | `font-size: var(--font-size-lg)` |
| `font-weight: 500` | `font-weight: var(--font-weight-medium)` |
| `font-weight: 600` | `font-weight: var(--font-weight-bold)` |

**Transition replacements:**

| Find | Replace with |
|---|---|
| `0.15s` (in transition properties) | `var(--transition-fast)` |

**Do not replace:** `rgba(82, 199, 160, ...)`, `#243F52`, `#B0C4CE`, `#E5E5E5`, `#F5F5F5`, `#fff`/`#FFFFFF`, `#DCE6E3`, `#FAFCFB`, `#999`, `#0969DA`, `#18a0fb`, `#0d8de0`. These are either derived, Figma-brand, or don't have direct token equivalents.

- [ ] **Step 6: Verify no visual change in the dev harness**

Open `figma-markdown-sync/ui-preview.html` in a browser. The UI should look identical to before.

If any styles are broken (e.g., a color disappears), check that `src/tokens.css` is being loaded (it should be via the existing `<link rel="stylesheet" href="src/styles.css">` since webpack css-loader handles `@import` — for the browser dev harness, add `<link rel="stylesheet" href="src/tokens.css">` before the styles.css link in the preview shell when building it in Task 5).

- [ ] **Step 7: Commit**

```bash
cd figma-markdown-sync
git add scripts/build-tokens.ts src/tokens.css src/styles.css package.json
git commit -m "feat: replace hardcoded values in styles.css with CSS custom properties"
```

---

## Chunk 2: HTML Assembly Pipeline

### Task 4: Extract panel partials

**Files:**
- Create: `figma-markdown-sync/src/panels/panel-import.html`
- Create: `figma-markdown-sync/src/panels/panel-history.html`
- Create: `figma-markdown-sync/src/panels/panel-settings.html`
- Create: `figma-markdown-sync/src/panels/panel-export.html`

These partials contain the current tab panel HTML verbatim (no component tags yet — that comes in Task 17). The goal here is purely to extract the panels so the assembly pipeline works.

- [ ] **Step 1: Create `src/panels/panel-import.html`**

Copy the `<div id="tab-import" ...>...</div>` block from `ui.html` (lines 19-65) exactly as-is:

```html
<div id="tab-import" class="tab-panel active">

    <div id="import-section" class="import-color-block">
        <span class="plugin-wordmark">Markdown For What</span>

        <div id="drop-zone" class="drop-zone">
            <span class="drop-zone-icon">&darr;</span>
            <p class="drop-zone-label">Drop your Markdown here</p>
            <p class="drop-zone-sub">or click to browse &middot; .md .markdown .txt</p>
            <input type="file" id="file-input" accept=".md,.markdown,.txt" multiple aria-label="Choose Markdown files">
        </div>

        <!-- Paste section -->
        <div class="paste-section">
            <button id="paste-toggle" class="paste-toggle-btn">or paste Markdown text</button>
            <div id="paste-area-wrap" class="paste-area-wrap hidden">
                <textarea id="paste-area" class="paste-area" rows="6" placeholder="Paste your Markdown here..."></textarea>
                <div class="paste-actions">
                    <input type="text" id="paste-name" class="paste-name-input" placeholder="Frame name (optional)">
                    <button id="paste-import-btn" class="btn-secondary" disabled>Import Paste</button>
                </div>
            </div>
        </div>
    </div>

    <ul id="file-list" class="file-list"></ul>

    <!-- Preview pane (hidden by default, shown after file drop) -->
    <div id="preview-pane" class="preview-pane hidden">
        <div class="preview-header">
            <span class="preview-title">Preview</span>
            <span id="preview-summary" class="preview-summary"></span>
            <span class="preview-select-controls">
                <button id="select-all-btn" class="btn-link">All</button>
                <button id="deselect-all-btn" class="btn-link">None</button>
            </span>
        </div>
        <div id="preview-content" class="preview-content"></div>
    </div>

    <div class="bottom-bar">
        <p id="status-message" class="status-message"></p>
        <button id="preview-cancel" class="btn-secondary hidden">Cancel</button>
        <button id="import-btn" disabled>Import</button>
    </div>

</div>
```

- [ ] **Step 2: Create `src/panels/panel-history.html`**

Copy the `<div id="tab-history" ...>...</div>` block from `ui.html` (lines 67-77):

```html
<div id="tab-history" class="tab-panel hidden">
    <div class="settings-section">
        <h3 class="settings-section-title">Recent Imports</h3>
        <p id="history-empty" class="settings-hint">No imports yet.</p>
        <ul id="history-list" class="history-list"></ul>
    </div>
    <div class="settings-footer">
        <button id="clear-history-btn" class="btn-secondary">Clear history</button>
    </div>
</div>
```

- [ ] **Step 3: Create `src/panels/panel-settings.html`**

Copy the `<div id="tab-settings" ...>...</div>` block from `ui.html` (lines 79-184) exactly as-is. (Long block — copy verbatim, do not modify.)

- [ ] **Step 4: Create `src/panels/panel-export.html`**

Copy the `<div id="tab-export" ...>...</div>` block from `ui.html` (lines 186-217) exactly as-is.

- [ ] **Step 5: Commit**

```bash
cd figma-markdown-sync
git add src/panels/
git commit -m "feat: extract tab panel HTML into src/panels/ partials"
```

---

### Task 5: Create shell templates

**Files:**
- Create: `figma-markdown-sync/src/shells/ui-shell.html`
- Create: `figma-markdown-sync/src/shells/ui-preview-shell.html`

- [ ] **Step 1: Create `src/shells/ui-shell.html`**

This is the production shell — the outer structure of `ui.html` with panel content replaced by markers:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MarkDown For What</title>
</head>
<body>

    <!-- Tab bar -->
    <nav class="tab-bar">
        <button class="tab active" data-tab="import">Import</button>
        <button class="tab" data-tab="history">History</button>
        <button class="tab" data-tab="settings">Settings</button>
        <button class="tab" data-tab="export">Export</button>
    </nav>

    <!-- PANEL:import -->

    <!-- PANEL:history -->

    <!-- PANEL:settings -->

    <!-- PANEL:export -->

    <!-- Loading overlay -->
    <div id="loader" class="loader-overlay hidden">
        <div class="loader-content">
            <div class="spinner"></div>
            <p>Importing&hellip;<br>Please do not close this window.</p>
        </div>
    </div>

</body>
</html>
```

- [ ] **Step 2: Create `src/shells/ui-preview-shell.html`**

This is the dev harness shell — includes the dark background, token/style links, catalog section, and tab switching script. Panels are replaced by markers:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MFW UI Preview</title>
    <!-- Links source CSS directly — edit src/styles.css and refresh, no build needed -->
    <!-- tokens.css is @imported by styles.css in the webpack bundle, but the browser
         needs it linked separately here since it can't process @import without a bundler -->
    <link rel="stylesheet" href="src/tokens.css">
    <link rel="stylesheet" href="src/styles.css">
    <style>
        /* Preview shell — not part of the plugin UI */
        body {
            background: #2C2C2C;
            margin: 0;
            padding: 40px 20px;
            font-family: Inter, -apple-system, sans-serif;
            min-height: 100vh;
        }
        .preview-shell {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 40px;
        }
        .preview-label {
            color: #888;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 8px;
            text-align: center;
        }
        .plugin-frame {
            width: 320px;
            height: 500px;
            border-radius: 4px;
            overflow: hidden;
            box-shadow: 0 8px 32px rgba(0,0,0,0.4);
            background: #EFF4F2;
            display: flex;
            flex-direction: column;
        }
        /* Catalog */
        .catalog { width: 320px; }
        .catalog-section { margin-bottom: 32px; }
        .catalog-section-title {
            color: #888;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin: 0 0 12px;
            padding-bottom: 6px;
            border-bottom: 1px solid #444;
        }
        .catalog-row {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            align-items: center;
            background: #EFF4F2;
            padding: 12px;
            border-radius: 4px;
            margin-bottom: 8px;
        }
        .catalog-row-label {
            color: #666;
            font-size: 10px;
            width: 100%;
            margin-bottom: 4px;
        }
    </style>
</head>
<body>
<div class="preview-shell">

    <!-- Plugin Frame -->
    <div>
        <p class="preview-label">Plugin UI &mdash; 320&times;500</p>
        <div class="plugin-frame">

            <!-- Tab bar -->
            <nav class="tab-bar">
                <button class="tab active" data-tab="import">Import</button>
                <button class="tab" data-tab="history">History</button>
                <button class="tab" data-tab="settings">Settings</button>
                <button class="tab" data-tab="export">Export</button>
            </nav>

            <!-- PANEL:import -->

            <!-- PANEL:history -->

            <!-- PANEL:settings -->

            <!-- PANEL:export -->

        </div>
    </div>

    <!-- Component Catalog — add a catalog-section for each new component below -->
    <div>
        <p class="preview-label">Component Catalog</p>
        <div class="catalog">

            <div class="catalog-section">
                <h3 class="catalog-section-title">mfw-button</h3>
                <div class="catalog-row">
                    <span class="catalog-row-label">variant="primary" (default)</span>
                    <mfw-button label="Import"></mfw-button>
                    <mfw-button label="Disabled" disabled></mfw-button>
                </div>
                <div class="catalog-row">
                    <span class="catalog-row-label">variant="secondary"</span>
                    <mfw-button variant="secondary" label="Cancel"></mfw-button>
                    <mfw-button variant="secondary" label="Reset to defaults"></mfw-button>
                </div>
                <div class="catalog-row">
                    <span class="catalog-row-label">variant="link"</span>
                    <mfw-button variant="link" label="All"></mfw-button>
                    <mfw-button variant="link" label="None"></mfw-button>
                </div>
            </div>

            <div class="catalog-section">
                <h3 class="catalog-section-title">mfw-status</h3>
                <div class="catalog-row">
                    <span class="catalog-row-label">type="info" (default)</span>
                    <mfw-status message="3 files ready to import"></mfw-status>
                </div>
                <div class="catalog-row">
                    <span class="catalog-row-label">type="success"</span>
                    <mfw-status type="success" message="Import complete"></mfw-status>
                </div>
                <div class="catalog-row">
                    <span class="catalog-row-label">type="error"</span>
                    <mfw-status type="error" message="Failed to parse file"></mfw-status>
                </div>
            </div>

            <div class="catalog-section">
                <h3 class="catalog-section-title">mfw-drop-zone</h3>
                <div class="catalog-row">
                    <span class="catalog-row-label">default</span>
                    <mfw-drop-zone style="width:100%"></mfw-drop-zone>
                </div>
            </div>

            <!-- NEW COMPONENT CATALOG ENTRIES GO HERE -->

        </div>
    </div>

</div>

<!-- Loads component definitions only. Do NOT swap this for dist/ui.js. -->
<script src="dist/components.js"></script>
<script>
    // Tab switching for the preview frame
    document.querySelectorAll('.tab').forEach(function(tab) {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.tab').forEach(function(t) {
                t.classList.remove('active');
            });
            document.querySelectorAll('.tab-panel').forEach(function(p) {
                p.classList.add('hidden');
                p.classList.remove('active');
            });
            tab.classList.add('active');
            var panel = document.getElementById('tab-' + tab.dataset.tab);
            if (panel) {
                panel.classList.remove('hidden');
                panel.classList.add('active');
            }
        });
    });
</script>
</body>
</html>
```

Note: The preview shell retains its inline tab-switching script for now. It will be replaced by `mfw-tab-bar` in Task 17.

- [ ] **Step 3: Commit**

```bash
cd figma-markdown-sync
git add src/shells/
git commit -m "feat: add HTML shell templates with panel injection markers"
```

---

### Task 6: Write `build-html.ts` and add npm scripts

**Files:**
- Create: `figma-markdown-sync/scripts/build-html.ts`
- Modify: `figma-markdown-sync/package.json`

- [ ] **Step 1: Write the assembly script**

Create `figma-markdown-sync/scripts/build-html.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

function readPanel(name: string): string {
  return fs.readFileSync(path.join(ROOT, 'src', 'panels', `panel-${name}.html`), 'utf-8');
}

function readShell(name: string): string {
  return fs.readFileSync(path.join(ROOT, 'src', 'shells', `${name}-shell.html`), 'utf-8');
}

function injectPanels(shell: string): string {
  const panelNames = ['import', 'history', 'settings', 'export'];
  let result = shell;
  for (const name of panelNames) {
    result = result.replace(`<!-- PANEL:${name} -->`, readPanel(name));
  }
  return result;
}

const outputs: Array<{ shell: string; outFile: string }> = [
  { shell: 'ui',         outFile: 'ui.html' },
  { shell: 'ui-preview', outFile: 'ui-preview.html' },
];

for (const { shell, outFile } of outputs) {
  const content = injectPanels(readShell(shell));
  const outPath = path.join(ROOT, outFile);
  fs.writeFileSync(outPath, content, 'utf-8');
  console.log(`Written: ${outFile}`);
}
```

- [ ] **Step 2: Add scripts to `package.json`**

Add to the `"scripts"` object in `figma-markdown-sync/package.json`:

```json
"build:html":  "ts-node scripts/build-html.ts",
"build:ui":    "npm run build:tokens && npm run build:html && npm run build"
```

- [ ] **Step 3: Run `build:html` and verify outputs match the originals**

```bash
cd figma-markdown-sync && npm run build:html
```

Expected console output:
```
Written: ui.html
Written: ui-preview.html
```

Manually diff the generated `ui.html` against the original to confirm the tab panels are correctly injected. The content should be functionally identical (minor whitespace differences from the injection are acceptable).

- [ ] **Step 4: Open `ui-preview.html` in a browser and confirm the UI still works**

```bash
open figma-markdown-sync/ui-preview.html
```

All four tabs should be navigable. The Import tab should show the drop zone.

- [ ] **Step 5: Commit**

```bash
cd figma-markdown-sync
git add scripts/build-html.ts package.json
git commit -m "feat: add build:html assembly script and build:ui script"
```

---

## Chunk 3: Components — Batch 1

### Task 7: `mfw-tab-bar`

**Files:**
- Create: `figma-markdown-sync/src/components/mfw-tab-bar.ts`
- Create: `figma-markdown-sync/src/components/__tests__/mfw-tab-bar.test.ts`

- [ ] **Step 1: Write the failing test**

Create `figma-markdown-sync/src/components/__tests__/mfw-tab-bar.test.ts`:

```ts
/**
 * @jest-environment jsdom
 */
import '../mfw-tab-bar';
import { makeComponent } from '../test-helpers';

describe('mfw-tab-bar', () => {
  function make(attrs: Record<string, string> = {}): HTMLElement {
    return makeComponent('mfw-tab-bar', attrs);
  }

  afterEach(() => { document.body.textContent = ''; });

  it('registers as a custom element', () => {
    expect(customElements.get('mfw-tab-bar')).toBeDefined();
  });

  it('renders a nav with 4 tab buttons', () => {
    const el = make({ active: 'import' });
    const nav = el.querySelector('nav.tab-bar');
    expect(nav).not.toBeNull();
    expect(nav!.querySelectorAll('button.tab').length).toBe(4);
  });

  it('marks the active tab with class "active"', () => {
    const el = make({ active: 'history' });
    const activeBtn = el.querySelector('button.tab.active');
    expect(activeBtn).not.toBeNull();
    expect(activeBtn!.getAttribute('data-tab')).toBe('history');
  });

  it('defaults to import tab when no active attribute', () => {
    const el = make();
    const activeBtn = el.querySelector('button.tab.active');
    expect(activeBtn!.getAttribute('data-tab')).toBe('import');
  });

  it('fires mfw-tab-change with correct tab when a button is clicked', () => {
    const el = make({ active: 'import' });
    const received: string[] = [];
    el.addEventListener('mfw-tab-change', (e) => {
      received.push((e as CustomEvent).detail.tab);
    });
    const settingsBtn = el.querySelector<HTMLButtonElement>('[data-tab="settings"]')!;
    settingsBtn.click();
    expect(received).toEqual(['settings']);
  });

  it('does not double-render on reconnect', () => {
    const el = make({ active: 'import' });
    document.body.removeChild(el);
    document.body.appendChild(el);
    expect(el.querySelectorAll('nav').length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd figma-markdown-sync && npm test -- --testPathPattern=mfw-tab-bar
```

Expected: FAIL — `Cannot find module '../mfw-tab-bar'`

- [ ] **Step 3: Implement `mfw-tab-bar.ts`**

Create `figma-markdown-sync/src/components/mfw-tab-bar.ts`:

```ts
type TabId = 'import' | 'history' | 'settings' | 'export';

const TAB_IDS: TabId[] = ['import', 'history', 'settings', 'export'];
const TAB_LABELS: Record<TabId, string> = {
  import: 'Import', history: 'History', settings: 'Settings', export: 'Export',
};

function isTabId(value: string): value is TabId {
  return (TAB_IDS as string[]).includes(value);
}

class MfwTabBar extends HTMLElement {
  connectedCallback(): void {
    this.render();
  }

  render(): void {
    while (this.firstChild) this.removeChild(this.firstChild);

    const raw = this.getAttribute('active') ?? 'import';
    const active = isTabId(raw) ? raw : 'import';
    if (!isTabId(raw)) {
      console.warn(`[mfw-tab-bar] Unknown tab "${raw}", falling back to "import".`);
    }

    const nav = document.createElement('nav');
    nav.className = 'tab-bar';

    for (const id of TAB_IDS) {
      const btn = document.createElement('button');
      btn.className = `tab${id === active ? ' active' : ''}`;
      btn.setAttribute('data-tab', id);
      btn.textContent = TAB_LABELS[id];
      btn.addEventListener('click', () => {
        this.setAttribute('active', id);
        this.render();
        this.dispatchEvent(new CustomEvent('mfw-tab-change', {
          detail: { tab: id },
          bubbles: true,
        }));
      });
      nav.appendChild(btn);
    }

    this.appendChild(nav);
  }
}

customElements.define('mfw-tab-bar', MfwTabBar);
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd figma-markdown-sync && npm test -- --testPathPattern=mfw-tab-bar
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd figma-markdown-sync
git add src/components/mfw-tab-bar.ts src/components/__tests__/mfw-tab-bar.test.ts
git commit -m "feat: add mfw-tab-bar component"
```

---

### Task 8: `mfw-loader`

**Files:**
- Create: `figma-markdown-sync/src/components/mfw-loader.ts`
- Create: `figma-markdown-sync/src/components/__tests__/mfw-loader.test.ts`

- [ ] **Step 1: Write the failing test**

Create `figma-markdown-sync/src/components/__tests__/mfw-loader.test.ts`:

```ts
/**
 * @jest-environment jsdom
 */
import '../mfw-loader';
import { makeComponent } from '../test-helpers';

describe('mfw-loader', () => {
  function make(attrs: Record<string, string> = {}): HTMLElement {
    return makeComponent('mfw-loader', attrs);
  }

  afterEach(() => { document.body.textContent = ''; });

  it('registers as a custom element', () => {
    expect(customElements.get('mfw-loader')).toBeDefined();
  });

  it('renders hidden overlay when visible attribute is absent', () => {
    const el = make();
    const overlay = el.querySelector('.loader-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay!.classList.contains('hidden')).toBe(true);
  });

  it('renders visible overlay when visible attribute is present', () => {
    const el = make({ visible: '' });
    const overlay = el.querySelector('.loader-overlay');
    expect(overlay!.classList.contains('hidden')).toBe(false);
  });

  it('renders a spinner and message', () => {
    const el = make({ visible: '' });
    expect(el.querySelector('.spinner')).not.toBeNull();
    expect(el.querySelector('p')!.textContent).toContain('Importing');
  });

  it('shows when visible attribute is added', () => {
    const el = make();
    el.setAttribute('visible', '');
    const overlay = el.querySelector('.loader-overlay');
    expect(overlay!.classList.contains('hidden')).toBe(false);
  });

  it('hides when visible attribute is removed', () => {
    const el = make({ visible: '' });
    el.removeAttribute('visible');
    const overlay = el.querySelector('.loader-overlay');
    expect(overlay!.classList.contains('hidden')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd figma-markdown-sync && npm test -- --testPathPattern=mfw-loader
```

Expected: FAIL

- [ ] **Step 3: Implement `mfw-loader.ts`**

Create `figma-markdown-sync/src/components/mfw-loader.ts`:

```ts
class MfwLoader extends HTMLElement {
  static get observedAttributes() { return ['visible']; }

  connectedCallback(): void {
    this.render();
  }

  attributeChangedCallback(): void {
    this.render();
  }

  render(): void {
    while (this.firstChild) this.removeChild(this.firstChild);

    const overlay = document.createElement('div');
    overlay.className = 'loader-overlay';
    if (!this.hasAttribute('visible')) overlay.classList.add('hidden');

    const content = document.createElement('div');
    content.className = 'loader-content';

    const spinner = document.createElement('div');
    spinner.className = 'spinner';

    const msg = document.createElement('p');
    msg.textContent = 'Importing\u2026';

    content.appendChild(spinner);
    content.appendChild(msg);
    overlay.appendChild(content);
    this.appendChild(overlay);
  }
}

customElements.define('mfw-loader', MfwLoader);
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd figma-markdown-sync && npm test -- --testPathPattern=mfw-loader
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd figma-markdown-sync
git add src/components/mfw-loader.ts src/components/__tests__/mfw-loader.test.ts
git commit -m "feat: add mfw-loader component"
```

---

### Task 9: `mfw-theme-selector`

**Files:**
- Create: `figma-markdown-sync/src/components/mfw-theme-selector.ts`
- Create: `figma-markdown-sync/src/components/__tests__/mfw-theme-selector.test.ts`

- [ ] **Step 1: Write the failing test**

Create `figma-markdown-sync/src/components/__tests__/mfw-theme-selector.test.ts`:

```ts
/**
 * @jest-environment jsdom
 */
import '../mfw-theme-selector';
import { makeComponent } from '../test-helpers';

describe('mfw-theme-selector', () => {
  function make(attrs: Record<string, string> = {}): HTMLElement {
    return makeComponent('mfw-theme-selector', attrs);
  }

  afterEach(() => { document.body.textContent = ''; });

  it('registers as a custom element', () => {
    expect(customElements.get('mfw-theme-selector')).toBeDefined();
  });

  it('renders 3 theme buttons inside .theme-selector', () => {
    const el = make({ active: 'minimal-light' });
    const container = el.querySelector('.theme-selector');
    expect(container).not.toBeNull();
    expect(container!.querySelectorAll('button.theme-btn').length).toBe(3);
  });

  it('marks the active theme button', () => {
    const el = make({ active: 'dark-mode' });
    const activeBtn = el.querySelector('button.theme-btn.active');
    expect(activeBtn!.getAttribute('data-theme')).toBe('dark-mode');
  });

  it('fires mfw-theme-change with correct theme when clicked', () => {
    const el = make({ active: 'minimal-light' });
    const received: string[] = [];
    el.addEventListener('mfw-theme-change', (e) => {
      received.push((e as CustomEvent).detail.theme);
    });
    const docsBtn = el.querySelector<HTMLButtonElement>('[data-theme="documentation"]')!;
    docsBtn.click();
    expect(received).toEqual(['documentation']);
  });

  it('falls back to minimal-light for unknown active value', () => {
    const el = make({ active: 'neon' });
    const activeBtn = el.querySelector('button.theme-btn.active');
    expect(activeBtn!.getAttribute('data-theme')).toBe('minimal-light');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd figma-markdown-sync && npm test -- --testPathPattern=mfw-theme-selector
```

Expected: FAIL — `Cannot find module '../mfw-theme-selector'`

- [ ] **Step 3: Implement `mfw-theme-selector.ts`**

Create `figma-markdown-sync/src/components/mfw-theme-selector.ts`:

```ts
type ThemeId = 'minimal-light' | 'dark-mode' | 'documentation';

const THEME_OPTIONS: Array<{ id: ThemeId; label: string }> = [
  { id: 'minimal-light', label: 'Light' },
  { id: 'dark-mode',     label: 'Dark' },
  { id: 'documentation', label: 'Docs' },
];

function isThemeId(value: string): value is ThemeId {
  return THEME_OPTIONS.some(t => t.id === value);
}

class MfwThemeSelector extends HTMLElement {
  static get observedAttributes() { return ['active']; }

  connectedCallback(): void {
    this.render();
  }

  attributeChangedCallback(): void {
    this.render();
  }

  render(): void {
    while (this.firstChild) this.removeChild(this.firstChild);

    const raw = this.getAttribute('active') ?? 'minimal-light';
    const active: ThemeId = isThemeId(raw) ? raw : 'minimal-light';
    if (!isThemeId(raw)) {
      console.warn(`[mfw-theme-selector] Unknown theme "${raw}", falling back to "minimal-light".`);
    }

    const container = document.createElement('div');
    container.className = 'theme-selector';

    for (const option of THEME_OPTIONS) {
      const btn = document.createElement('button');
      btn.className = `theme-btn${option.id === active ? ' active' : ''}`;
      btn.setAttribute('data-theme', option.id);
      btn.textContent = option.label;
      btn.addEventListener('click', () => {
        this.setAttribute('active', option.id);
        this.render();
        this.dispatchEvent(new CustomEvent('mfw-theme-change', {
          detail: { theme: option.id },
          bubbles: true,
        }));
      });
      container.appendChild(btn);
    }

    this.appendChild(container);
  }
}

customElements.define('mfw-theme-selector', MfwThemeSelector);
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd figma-markdown-sync && npm test -- --testPathPattern=mfw-theme-selector
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd figma-markdown-sync
git add src/components/mfw-theme-selector.ts src/components/__tests__/mfw-theme-selector.test.ts
git commit -m "feat: add mfw-theme-selector component"
```

---

### Task 10: `mfw-bottom-bar`

**Files:**
- Create: `figma-markdown-sync/src/components/mfw-bottom-bar.ts`
- Create: `figma-markdown-sync/src/components/__tests__/mfw-bottom-bar.test.ts`

- [ ] **Step 1: Write the failing test**

Create `figma-markdown-sync/src/components/__tests__/mfw-bottom-bar.test.ts`:

```ts
/**
 * @jest-environment jsdom
 */
import '../mfw-bottom-bar';
import { makeComponent } from '../test-helpers';

describe('mfw-bottom-bar', () => {
  function make(): HTMLElement {
    return makeComponent('mfw-bottom-bar');
  }

  afterEach(() => { document.body.textContent = ''; });

  it('registers as a custom element', () => {
    expect(customElements.get('mfw-bottom-bar')).toBeDefined();
  });

  it('renders a .bottom-bar container', () => {
    const el = make();
    expect(el.querySelector('.bottom-bar')).not.toBeNull();
  });

  it('renders a status slot and an actions slot', () => {
    const el = make();
    expect(el.querySelector('[data-slot="status"]')).not.toBeNull();
    expect(el.querySelector('[data-slot="actions"]')).not.toBeNull();
  });

  it('allows programmatic children to be added to slots', () => {
    const el = make();
    const statusSlot = el.querySelector('[data-slot="status"]')!;
    const p = document.createElement('p');
    p.textContent = 'Ready';
    statusSlot.appendChild(p);
    expect(el.querySelector('[data-slot="status"] p')!.textContent).toBe('Ready');
  });

  it('does not double-render on reconnect', () => {
    const el = make();
    document.body.removeChild(el);
    document.body.appendChild(el);
    expect(el.querySelectorAll('.bottom-bar').length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd figma-markdown-sync && npm test -- --testPathPattern=mfw-bottom-bar
```

Expected: FAIL — `Cannot find module '../mfw-bottom-bar'`

- [ ] **Step 3: Implement `mfw-bottom-bar.ts`**

Create `figma-markdown-sync/src/components/mfw-bottom-bar.ts`:

```ts
class MfwBottomBar extends HTMLElement {
  connectedCallback(): void {
    this.render();
  }

  render(): void {
    while (this.firstChild) this.removeChild(this.firstChild);

    const bar = document.createElement('div');
    bar.className = 'bottom-bar';

    const statusDiv = document.createElement('div');
    statusDiv.setAttribute('data-slot', 'status');
    statusDiv.style.flex = '1';
    statusDiv.style.display = 'flex';
    statusDiv.style.alignItems = 'center';

    const actionsDiv = document.createElement('div');
    actionsDiv.setAttribute('data-slot', 'actions');
    actionsDiv.style.display = 'flex';
    actionsDiv.style.gap = '8px';
    actionsDiv.style.alignItems = 'center';

    bar.appendChild(statusDiv);
    bar.appendChild(actionsDiv);
    this.appendChild(bar);
  }
}

customElements.define('mfw-bottom-bar', MfwBottomBar);
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd figma-markdown-sync && npm test -- --testPathPattern=mfw-bottom-bar
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd figma-markdown-sync
git add src/components/mfw-bottom-bar.ts src/components/__tests__/mfw-bottom-bar.test.ts
git commit -m "feat: add mfw-bottom-bar component"
```

---

### Task 11: `mfw-settings-section`

**Files:**
- Create: `figma-markdown-sync/src/components/mfw-settings-section.ts`
- Create: `figma-markdown-sync/src/components/__tests__/mfw-settings-section.test.ts`

Note: This component uses a different render pattern to preserve child elements. Instead of clearing all children, it only manages its own `h3` title while leaving other children untouched.

- [ ] **Step 1: Write the failing test**

Create `figma-markdown-sync/src/components/__tests__/mfw-settings-section.test.ts`:

```ts
/**
 * @jest-environment jsdom
 */
import '../mfw-settings-section';
import { makeComponent } from '../test-helpers';

describe('mfw-settings-section', () => {
  afterEach(() => { document.body.textContent = ''; });

  it('registers as a custom element', () => {
    expect(customElements.get('mfw-settings-section')).toBeDefined();
  });

  it('applies settings-section class to itself', () => {
    const el = makeComponent('mfw-settings-section', { title: 'Theme' });
    expect(el.classList.contains('settings-section')).toBe(true);
  });

  it('renders an h3 with settings-section-title class', () => {
    const el = makeComponent('mfw-settings-section', { title: 'Spacing' });
    const h3 = el.querySelector('h3.settings-section-title');
    expect(h3).not.toBeNull();
    expect(h3!.textContent).toBe('Spacing');
  });

  it('does not render h3 when title attribute is absent', () => {
    const el = makeComponent('mfw-settings-section', {});
    expect(el.querySelector('h3')).toBeNull();
  });

  it('preserves existing child elements when title is rendered', () => {
    const el = document.createElement('mfw-settings-section');
    el.setAttribute('title', 'Frame');
    const child = document.createElement('label');
    child.className = 'settings-row';
    el.appendChild(child);
    document.body.appendChild(el);
    expect(el.querySelector('label.settings-row')).not.toBeNull();
  });

  it('does not duplicate h3 on reconnect', () => {
    const el = makeComponent('mfw-settings-section', { title: 'Colors' });
    document.body.removeChild(el);
    document.body.appendChild(el);
    expect(el.querySelectorAll('h3').length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd figma-markdown-sync && npm test -- --testPathPattern=mfw-settings-section
```

Expected: FAIL — `Cannot find module '../mfw-settings-section'`

- [ ] **Step 3: Implement `mfw-settings-section.ts`**

Create `figma-markdown-sync/src/components/mfw-settings-section.ts`:

```ts
class MfwSettingsSection extends HTMLElement {
  static get observedAttributes() { return ['title']; }

  connectedCallback(): void {
    this.render();
  }

  attributeChangedCallback(): void {
    this.render();
  }

  render(): void {
    // Apply class to self (no inner wrapper needed)
    this.className = 'settings-section';

    // Remove any previously rendered title
    const existing = this.querySelector('.settings-section-title');
    if (existing) this.removeChild(existing);

    const title = this.getAttribute('title');
    if (!title) return;

    const h3 = document.createElement('h3');
    h3.className = 'settings-section-title';
    h3.textContent = title;
    this.insertBefore(h3, this.firstChild);
  }
}

customElements.define('mfw-settings-section', MfwSettingsSection);
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd figma-markdown-sync && npm test -- --testPathPattern=mfw-settings-section
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd figma-markdown-sync
git add src/components/mfw-settings-section.ts src/components/__tests__/mfw-settings-section.test.ts
git commit -m "feat: add mfw-settings-section component"
```

---

## Chunk 4: Components — Batch 2

### Task 12: `mfw-settings-row`

**Files:**
- Create: `figma-markdown-sync/src/components/mfw-settings-row.ts`
- Create: `figma-markdown-sync/src/components/__tests__/mfw-settings-row.test.ts`

Note: The `input-id` attribute (not `id`) is used to set the `id` on the inner input element — consistent with the `mfw-drop-zone` `input-id` pattern. This avoids having two DOM elements with the same `id`.

- [ ] **Step 1: Write the failing test**

Create `figma-markdown-sync/src/components/__tests__/mfw-settings-row.test.ts`:

```ts
/**
 * @jest-environment jsdom
 */
import '../mfw-settings-row';
import { makeComponent } from '../test-helpers';

describe('mfw-settings-row', () => {
  afterEach(() => { document.body.textContent = ''; });

  it('registers as a custom element', () => {
    expect(customElements.get('mfw-settings-row')).toBeDefined();
  });

  it('renders a label and a number input for type=number', () => {
    const el = makeComponent('mfw-settings-row', {
      label: 'Block spacing', type: 'number', 'input-id': 'blockSpacing', min: '0', max: '200', unit: 'px',
    });
    expect(el.querySelector('span.settings-label')!.textContent).toBe('Block spacing');
    const input = el.querySelector<HTMLInputElement>('input[type="number"]')!;
    expect(input).not.toBeNull();
    expect(input.id).toBe('blockSpacing');
    expect(input.min).toBe('0');
    expect(input.max).toBe('200');
    expect(el.querySelector('span.settings-unit')!.textContent).toBe('px');
  });

  it('renders a select for type=select', () => {
    const el = makeComponent('mfw-settings-row', {
      label: 'Width', type: 'select', 'input-id': 'widthMode',
    });
    const select = el.querySelector<HTMLSelectElement>('select')!;
    expect(select).not.toBeNull();
    expect(select.id).toBe('widthMode');
  });

  it('setOptions populates a select', () => {
    const el = makeComponent('mfw-settings-row', { label: 'Width', type: 'select', 'input-id': 'widthMode' });
    (el as any).setOptions([
      { value: 'narrow', label: 'Narrow (480px)' },
      { value: 'medium', label: 'Medium (800px)' },
    ]);
    const options = el.querySelectorAll('option');
    expect(options.length).toBe(2);
    expect(options[0].value).toBe('narrow');
    expect(options[1].textContent).toBe('Medium (800px)');
  });

  it('renders a checkbox for type=checkbox', () => {
    const el = makeComponent('mfw-settings-row', {
      label: 'Generate TOC', type: 'checkbox', 'input-id': 'generateToc',
    });
    const cb = el.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(cb).not.toBeNull();
    expect(cb.id).toBe('generateToc');
  });

  it('warns and falls back to number for unknown type', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const el = makeComponent('mfw-settings-row', { label: 'Test', type: 'color', 'input-id': 'x' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[mfw-settings-row]'));
    expect(el.querySelector('input[type="number"]')).not.toBeNull();
    warn.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd figma-markdown-sync && npm test -- --testPathPattern=mfw-settings-row
```

Expected: FAIL — `Cannot find module '../mfw-settings-row'`

- [ ] **Step 3: Implement `mfw-settings-row.ts`**

Create `figma-markdown-sync/src/components/mfw-settings-row.ts`:

```ts
type RowType = 'number' | 'select' | 'checkbox';

function isRowType(value: string): value is RowType {
  return value === 'number' || value === 'select' || value === 'checkbox';
}

class MfwSettingsRow extends HTMLElement {
  connectedCallback(): void {
    this.render();
  }

  render(): void {
    while (this.firstChild) this.removeChild(this.firstChild);

    this.className = 'settings-row';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'settings-label';
    labelSpan.textContent = this.getAttribute('label') ?? '';

    const wrap = document.createElement('div');
    wrap.className = 'settings-input-wrap';

    const rawType = this.getAttribute('type') ?? 'number';
    let type: RowType;
    if (isRowType(rawType)) {
      type = rawType;
    } else {
      console.warn(`[mfw-settings-row] Unknown type "${rawType}", falling back to "number".`);
      type = 'number';
    }

    const inputId = this.getAttribute('input-id') ?? undefined;

    if (type === 'number') {
      const input = document.createElement('input');
      input.type = 'number';
      if (inputId) input.id = inputId;
      const min = this.getAttribute('min');
      const max = this.getAttribute('max');
      if (min !== null) input.min = min;
      if (max !== null) input.max = max;
      wrap.appendChild(input);

      const unit = this.getAttribute('unit');
      if (unit) {
        const unitSpan = document.createElement('span');
        unitSpan.className = 'settings-unit';
        unitSpan.textContent = unit;
        wrap.appendChild(unitSpan);
      }
    } else if (type === 'select') {
      const select = document.createElement('select');
      select.className = 'settings-select';
      if (inputId) select.id = inputId;
      wrap.appendChild(select);
    } else {
      // checkbox
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'settings-checkbox';
      if (inputId) cb.id = inputId;
      wrap.appendChild(cb);
    }

    this.appendChild(labelSpan);
    this.appendChild(wrap);
  }

  setOptions(items: Array<{ value: string; label: string }>): void {
    const select = this.querySelector('select');
    if (!select) return;
    while (select.options.length > 0) select.remove(0);
    for (const item of items) {
      const opt = document.createElement('option');
      opt.value = item.value;
      opt.textContent = item.label;
      select.appendChild(opt);
    }
  }
}

customElements.define('mfw-settings-row', MfwSettingsRow);
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd figma-markdown-sync && npm test -- --testPathPattern=mfw-settings-row
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd figma-markdown-sync
git add src/components/mfw-settings-row.ts src/components/__tests__/mfw-settings-row.test.ts
git commit -m "feat: add mfw-settings-row component"
```

---

### Task 13: `mfw-color-input`

**Files:**
- Create: `figma-markdown-sync/src/components/mfw-color-input.ts`
- Create: `figma-markdown-sync/src/components/__tests__/mfw-color-input.test.ts`

- [ ] **Step 1: Write the failing test**

Create `figma-markdown-sync/src/components/__tests__/mfw-color-input.test.ts`:

```ts
/**
 * @jest-environment jsdom
 */
import '../mfw-color-input';
import { makeComponent } from '../test-helpers';

describe('mfw-color-input', () => {
  afterEach(() => { document.body.textContent = ''; });

  it('registers as a custom element', () => {
    expect(customElements.get('mfw-color-input')).toBeDefined();
  });

  it('renders a text input with the given input-id and placeholder', () => {
    const el = makeComponent('mfw-color-input', { 'input-id': 'frameFillColor', placeholder: '#FFFFFF' });
    const textInput = el.querySelector<HTMLInputElement>('input[type="text"]')!;
    expect(textInput).not.toBeNull();
    expect(textInput.id).toBe('frameFillColor');
    expect(textInput.placeholder).toBe('#FFFFFF');
  });

  it('renders a color swatch input with id matching <input-id>-swatch', () => {
    const el = makeComponent('mfw-color-input', { 'input-id': 'frameFillColor', placeholder: '#FFFFFF' });
    const swatch = el.querySelector<HTMLInputElement>('input[type="color"]')!;
    expect(swatch).not.toBeNull();
    expect(swatch.id).toBe('frameFillColor-swatch');
  });

  it('syncs swatch to text input when text changes to valid hex', () => {
    const el = makeComponent('mfw-color-input', { 'input-id': 'codeBackground', placeholder: '#F2F2F2' });
    const textInput = el.querySelector<HTMLInputElement>('input[type="text"]')!;
    const swatch = el.querySelector<HTMLInputElement>('input[type="color"]')!;
    textInput.value = '#1B3543';
    textInput.dispatchEvent(new Event('change'));
    expect(swatch.value).toBe('#1b3543');
  });

  it('syncs text input to swatch when swatch changes', () => {
    const el = makeComponent('mfw-color-input', { 'input-id': 'separatorColor', placeholder: '#CCCCCC' });
    const textInput = el.querySelector<HTMLInputElement>('input[type="text"]')!;
    const swatch = el.querySelector<HTMLInputElement>('input[type="color"]')!;
    swatch.value = '#52c7a0';
    swatch.dispatchEvent(new Event('input'));
    expect(textInput.value).toBe('#52c7a0');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd figma-markdown-sync && npm test -- --testPathPattern=mfw-color-input
```

Expected: FAIL — `Cannot find module '../mfw-color-input'`

- [ ] **Step 3: Implement `mfw-color-input.ts`**

Create `figma-markdown-sync/src/components/mfw-color-input.ts`:

```ts
import { isValidHex } from '../../utils';

class MfwColorInput extends HTMLElement {
  connectedCallback(): void {
    this.render();
  }

  render(): void {
    while (this.firstChild) this.removeChild(this.firstChild);

    const inputId = this.getAttribute('input-id') ?? '';
    const placeholder = this.getAttribute('placeholder') ?? '';

    const textInput = document.createElement('input');
    textInput.type = 'text';
    if (inputId) textInput.id = inputId;
    textInput.maxLength = 7;
    textInput.placeholder = placeholder;

    const swatch = document.createElement('input');
    swatch.type = 'color';
    swatch.className = 'color-swatch';
    if (inputId) swatch.id = `${inputId}-swatch`;

    textInput.addEventListener('change', () => {
      if (isValidHex(textInput.value)) {
        swatch.value = textInput.value;
      }
    });

    swatch.addEventListener('input', () => {
      textInput.value = swatch.value;
    });

    this.appendChild(textInput);
    this.appendChild(swatch);
  }
}

customElements.define('mfw-color-input', MfwColorInput);
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd figma-markdown-sync && npm test -- --testPathPattern=mfw-color-input
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd figma-markdown-sync
git add src/components/mfw-color-input.ts src/components/__tests__/mfw-color-input.test.ts
git commit -m "feat: add mfw-color-input component"
```

---

### Task 14: `mfw-paste-section`

**Files:**
- Create: `figma-markdown-sync/src/components/mfw-paste-section.ts`
- Create: `figma-markdown-sync/src/components/__tests__/mfw-paste-section.test.ts`

- [ ] **Step 1: Write the failing test**

Create `figma-markdown-sync/src/components/__tests__/mfw-paste-section.test.ts`:

```ts
/**
 * @jest-environment jsdom
 */
import '../mfw-paste-section';
import { makeComponent } from '../test-helpers';

describe('mfw-paste-section', () => {
  function make(): HTMLElement {
    return makeComponent('mfw-paste-section');
  }

  afterEach(() => { document.body.textContent = ''; });

  it('registers as a custom element', () => {
    expect(customElements.get('mfw-paste-section')).toBeDefined();
  });

  it('renders the toggle button', () => {
    const el = make();
    expect(el.querySelector('button.paste-toggle-btn')).not.toBeNull();
  });

  it('hides the paste area by default', () => {
    const el = make();
    const wrap = el.querySelector('.paste-area-wrap')!;
    expect(wrap.classList.contains('hidden')).toBe(true);
  });

  it('reveals the paste area when toggle button is clicked', () => {
    const el = make();
    el.querySelector<HTMLButtonElement>('button.paste-toggle-btn')!.click();
    expect(el.querySelector('.paste-area-wrap')!.classList.contains('hidden')).toBe(false);
  });

  it('disables Import Paste button when textarea is empty', () => {
    const el = make();
    const importBtn = el.querySelector<HTMLButtonElement>('#paste-import-btn')!;
    expect(importBtn.disabled).toBe(true);
  });

  it('fires mfw-paste-import with text and name when Import Paste is clicked', () => {
    const el = make();
    // expand the paste area
    el.querySelector<HTMLButtonElement>('.paste-toggle-btn')!.click();
    const received: Array<{ text: string; name: string }> = [];
    el.addEventListener('mfw-paste-import', (e) => {
      received.push((e as CustomEvent).detail);
    });
    const textarea = el.querySelector<HTMLTextAreaElement>('textarea')!;
    textarea.value = '# Hello';
    textarea.dispatchEvent(new Event('input'));
    el.querySelector<HTMLInputElement>('input[type="text"]')!.value = 'My Doc';
    el.querySelector<HTMLButtonElement>('#paste-import-btn')!.click();
    expect(received).toEqual([{ text: '# Hello', name: 'My Doc' }]);
  });

  it('reset() clears textarea, name, and collapses the section', () => {
    const el = make();
    el.querySelector<HTMLButtonElement>('.paste-toggle-btn')!.click();
    const textarea = el.querySelector<HTMLTextAreaElement>('textarea')!;
    textarea.value = '# Hello';
    textarea.dispatchEvent(new Event('input'));
    (el as any).reset();
    expect(textarea.value).toBe('');
    expect(el.querySelector('.paste-area-wrap')!.classList.contains('hidden')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd figma-markdown-sync && npm test -- --testPathPattern=mfw-paste-section
```

Expected: FAIL — `Cannot find module '../mfw-paste-section'`

- [ ] **Step 3: Implement `mfw-paste-section.ts`**

Create `figma-markdown-sync/src/components/mfw-paste-section.ts`:

```ts
class MfwPasteSection extends HTMLElement {
  connectedCallback(): void {
    this.render();
  }

  render(): void {
    while (this.firstChild) this.removeChild(this.firstChild);

    const section = document.createElement('div');
    section.className = 'paste-section';

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'paste-toggle-btn';
    toggleBtn.textContent = 'or paste Markdown text';

    const wrap = document.createElement('div');
    wrap.className = 'paste-area-wrap hidden';

    const textarea = document.createElement('textarea');
    textarea.className = 'paste-area';
    textarea.rows = 6;
    textarea.placeholder = 'Paste your Markdown here...';

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'paste-actions';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'paste-name-input';
    nameInput.placeholder = 'Frame name (optional)';

    const importBtn = document.createElement('button');
    importBtn.id = 'paste-import-btn';
    importBtn.className = 'btn-secondary';
    importBtn.textContent = 'Import Paste';
    importBtn.disabled = true;

    actionsDiv.appendChild(nameInput);
    actionsDiv.appendChild(importBtn);
    wrap.appendChild(textarea);
    wrap.appendChild(actionsDiv);
    section.appendChild(toggleBtn);
    section.appendChild(wrap);
    this.appendChild(section);

    // Events
    toggleBtn.addEventListener('click', () => {
      wrap.classList.toggle('hidden');
    });

    textarea.addEventListener('input', () => {
      importBtn.disabled = textarea.value.trim().length === 0;
    });

    importBtn.addEventListener('click', () => {
      const text = textarea.value.trim();
      if (!text) return;
      this.dispatchEvent(new CustomEvent('mfw-paste-import', {
        detail: { text, name: nameInput.value.trim() },
        bubbles: true,
      }));
    });
  }

  reset(): void {
    const textarea = this.querySelector<HTMLTextAreaElement>('textarea');
    const nameInput = this.querySelector<HTMLInputElement>('input[type="text"]');
    const importBtn = this.querySelector<HTMLButtonElement>('#paste-import-btn');
    const wrap = this.querySelector<HTMLElement>('.paste-area-wrap');
    if (textarea) textarea.value = '';
    if (nameInput) nameInput.value = '';
    if (importBtn) importBtn.disabled = true;
    if (wrap) wrap.classList.add('hidden');
  }
}

customElements.define('mfw-paste-section', MfwPasteSection);
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd figma-markdown-sync && npm test -- --testPathPattern=mfw-paste-section
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd figma-markdown-sync
git add src/components/mfw-paste-section.ts src/components/__tests__/mfw-paste-section.test.ts
git commit -m "feat: add mfw-paste-section component"
```

---

### Task 15: `mfw-file-list`

**Files:**
- Create: `figma-markdown-sync/src/components/mfw-file-list.ts`
- Create: `figma-markdown-sync/src/components/__tests__/mfw-file-list.test.ts`

- [ ] **Step 1: Write the failing test**

Create `figma-markdown-sync/src/components/__tests__/mfw-file-list.test.ts`:

```ts
/**
 * @jest-environment jsdom
 */
import '../mfw-file-list';
import { makeComponent } from '../test-helpers';

describe('mfw-file-list', () => {
  function make(): HTMLElement {
    return makeComponent('mfw-file-list');
  }

  afterEach(() => { document.body.textContent = ''; });

  it('registers as a custom element', () => {
    expect(customElements.get('mfw-file-list')).toBeDefined();
  });

  it('renders an empty <ul> on connect', () => {
    const el = make();
    const ul = el.querySelector('ul.file-list');
    expect(ul).not.toBeNull();
    expect(ul!.children.length).toBe(0);
  });

  it('setFiles renders one li per file', () => {
    const el = make();
    (el as any).setFiles([
      { name: 'readme.md', size: 1024 },
      { name: 'notes.md', size: 512 },
    ]);
    expect(el.querySelectorAll('li').length).toBe(2);
  });

  it('setFiles shows file names as text content', () => {
    const el = make();
    (el as any).setFiles([{ name: 'design.md', size: 200 }]);
    expect(el.querySelector('li')!.textContent).toBe('design.md');
  });

  it('setFiles clears previous list before rendering', () => {
    const el = make();
    (el as any).setFiles([{ name: 'a.md', size: 100 }]);
    (el as any).setFiles([{ name: 'b.md', size: 200 }, { name: 'c.md', size: 300 }]);
    expect(el.querySelectorAll('li').length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd figma-markdown-sync && npm test -- --testPathPattern=mfw-file-list
```

Expected: FAIL — `Cannot find module '../mfw-file-list'`

- [ ] **Step 3: Implement `mfw-file-list.ts`**

Create `figma-markdown-sync/src/components/mfw-file-list.ts`:

```ts
interface FileItem {
  name: string;
  size: number;
}

class MfwFileList extends HTMLElement {
  private _ul: HTMLUListElement | null = null;

  connectedCallback(): void {
    this.render();
  }

  render(): void {
    while (this.firstChild) this.removeChild(this.firstChild);
    this._ul = document.createElement('ul');
    this._ul.className = 'file-list';
    this.appendChild(this._ul);
  }

  setFiles(files: FileItem[]): void {
    if (!this._ul) return;
    while (this._ul.firstChild) this._ul.removeChild(this._ul.firstChild);
    for (const file of files) {
      const li = document.createElement('li');
      li.textContent = file.name;
      this._ul.appendChild(li);
    }
  }
}

customElements.define('mfw-file-list', MfwFileList);
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd figma-markdown-sync && npm test -- --testPathPattern=mfw-file-list
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Run the full test suite to confirm nothing is broken**

```bash
cd figma-markdown-sync && npm test
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
cd figma-markdown-sync
git add src/components/mfw-file-list.ts src/components/__tests__/mfw-file-list.test.ts
git commit -m "feat: add mfw-file-list component"
```

---

## Chunk 5: Integration

### Task 16: Register all new components in `mfw-index.ts`

**Files:**
- Modify: `figma-markdown-sync/src/components/mfw-index.ts`

- [ ] **Step 1: Add all new component imports**

Replace the contents of `figma-markdown-sync/src/components/mfw-index.ts`:

```ts
// Component registry — import each component here to register it.
// This file is the entry point for dist/components.js (dev preview)
// and is also imported by src/ui.ts (production bundle).
import './mfw-button';
import './mfw-status';
import './mfw-drop-zone';
import './mfw-tab-bar';
import './mfw-loader';
import './mfw-theme-selector';
import './mfw-bottom-bar';
import './mfw-settings-section';
import './mfw-settings-row';
import './mfw-color-input';
import './mfw-paste-section';
import './mfw-file-list';
```

- [ ] **Step 2: Run build to confirm everything compiles**

```bash
cd figma-markdown-sync && npm run build
```

Expected: webpack build completes with no errors. `dist/components.js` and `dist/ui.js` are updated.

- [ ] **Step 3: Commit**

```bash
cd figma-markdown-sync
git add src/components/mfw-index.ts
git commit -m "feat: register all new mfw-* components in mfw-index.ts"
```

---

### Task 17: Update panel partials to use new component tags

**Files:**
- Modify: `figma-markdown-sync/src/panels/panel-import.html`
- Modify: `figma-markdown-sync/src/panels/panel-history.html`
- Modify: `figma-markdown-sync/src/panels/panel-settings.html`

Note: `panel-export.html` is not componentized in this pass (out of scope per spec).

- [ ] **Step 1: Replace `panel-import.html` with component-based version**

Replace the entire contents of `figma-markdown-sync/src/panels/panel-import.html`:

```html
<div id="tab-import" class="tab-panel active">

    <div id="import-section" class="import-color-block">
        <span class="plugin-wordmark">Markdown For What</span>
        <mfw-drop-zone input-id="file-input"
            label="Drop your Markdown here"
            sub-label="or click to browse &middot; .md .markdown .txt">
        </mfw-drop-zone>
        <mfw-paste-section></mfw-paste-section>
    </div>

    <mfw-file-list></mfw-file-list>

    <!-- Preview pane (hidden by default, shown after file drop) -->
    <div id="preview-pane" class="preview-pane hidden">
        <div class="preview-header">
            <span class="preview-title">Preview</span>
            <span id="preview-summary" class="preview-summary"></span>
            <span class="preview-select-controls">
                <button id="select-all-btn" class="btn-link">All</button>
                <button id="deselect-all-btn" class="btn-link">None</button>
            </span>
        </div>
        <div id="preview-content" class="preview-content"></div>
    </div>

    <mfw-bottom-bar></mfw-bottom-bar>

</div>
```

- [ ] **Step 2: Replace `panel-history.html` with component-based version**

Replace the entire contents of `figma-markdown-sync/src/panels/panel-history.html`:

```html
<div id="tab-history" class="tab-panel hidden">
    <mfw-settings-section title="Recent Imports">
        <p id="history-empty" class="settings-hint">No imports yet.</p>
        <ul id="history-list" class="history-list"></ul>
    </mfw-settings-section>
    <div class="settings-footer">
        <button id="clear-history-btn" class="btn-secondary">Clear history</button>
    </div>
</div>
```

- [ ] **Step 3: Replace `panel-settings.html` with component-based version**

Replace the entire contents of `figma-markdown-sync/src/panels/panel-settings.html`:

```html
<div id="tab-settings" class="tab-panel hidden">

    <mfw-settings-section title="Theme">
        <mfw-theme-selector active="minimal-light"></mfw-theme-selector>
    </mfw-settings-section>

    <mfw-settings-section title="Spacing">
        <mfw-settings-row label="Block spacing" type="number" input-id="blockSpacing" min="0" max="200" unit="px"></mfw-settings-row>
        <mfw-settings-row label="List spacing"  type="number" input-id="listSpacing"  min="0" max="100" unit="px"></mfw-settings-row>
    </mfw-settings-section>

    <mfw-settings-section title="Frame">
        <mfw-settings-row label="Padding" type="number" input-id="framePadding" min="0" max="200" unit="px"></mfw-settings-row>
        <mfw-settings-row label="Width"   type="select" input-id="widthMode"></mfw-settings-row>
        <label class="settings-row" id="customWidthRow" style="display:none">
            <span class="settings-label">Custom width</span>
            <div class="settings-input-wrap">
                <input type="number" id="customWidth" min="200" max="4000">
                <span class="settings-unit">px</span>
            </div>
        </label>
    </mfw-settings-section>

    <mfw-settings-section id="style-mapping-section" title="Style Mapping">
        <p class="settings-hint">Map elements to existing local text styles. "Auto" creates Markdown/* styles.</p>
        <mfw-settings-row label="H1"    type="select" input-id="style-h1"    select-class="style-binding-select" data-binding="h1"></mfw-settings-row>
        <mfw-settings-row label="H2"    type="select" input-id="style-h2"    select-class="style-binding-select" data-binding="h2"></mfw-settings-row>
        <mfw-settings-row label="H3"    type="select" input-id="style-h3"    select-class="style-binding-select" data-binding="h3"></mfw-settings-row>
        <mfw-settings-row label="Body"  type="select" input-id="style-body"  select-class="style-binding-select" data-binding="body"></mfw-settings-row>
        <mfw-settings-row label="Code"  type="select" input-id="style-code"  select-class="style-binding-select" data-binding="code"></mfw-settings-row>
        <mfw-settings-row label="List"  type="select" input-id="style-list"  select-class="style-binding-select" data-binding="list"></mfw-settings-row>
        <mfw-settings-row label="Quote" type="select" input-id="style-quote" select-class="style-binding-select" data-binding="quote"></mfw-settings-row>
    </mfw-settings-section>

    <mfw-settings-section id="component-mapping-section" title="Component Mapping">
        <p class="settings-hint">Map block types to components on this page. Components need a <code>#content</code> (or <code>#body</code>) text layer. An optional <code>#title</code> (or <code>#label</code>) layer receives context like language or callout type.</p>
        <mfw-settings-row label="Code Block" type="select" input-id="comp-codeBlock"  select-class="component-binding-select" data-binding="codeBlock"></mfw-settings-row>
        <mfw-settings-row label="Blockquote" type="select" input-id="comp-blockquote" select-class="component-binding-select" data-binding="blockquote"></mfw-settings-row>
        <mfw-settings-row label="Callout"    type="select" input-id="comp-callout"    select-class="component-binding-select" data-binding="callout"></mfw-settings-row>
        <mfw-settings-row label="Table"      type="select" input-id="comp-table"      select-class="component-binding-select" data-binding="table"></mfw-settings-row>
        <mfw-settings-row label="Image"      type="select" input-id="comp-image"      select-class="component-binding-select" data-binding="image"></mfw-settings-row>
    </mfw-settings-section>

    <mfw-settings-section title="Content">
        <mfw-settings-row label="Generate TOC"    type="checkbox" input-id="generateToc"></mfw-settings-row>
        <mfw-settings-row label="Component names" type="checkbox" input-id="componentNames"></mfw-settings-row>
    </mfw-settings-section>

    <mfw-settings-section title="Colors">
        <mfw-color-input input-id="frameFillColor"        placeholder="#FFFFFF"></mfw-color-input>
        <mfw-color-input input-id="codeBackground"        placeholder="#F2F2F2"></mfw-color-input>
        <mfw-color-input input-id="tableHeaderBackground" placeholder="#F2F2F7"></mfw-color-input>
        <mfw-color-input input-id="separatorColor"        placeholder="#CCCCCC"></mfw-color-input>
    </mfw-settings-section>

    <div class="settings-footer">
        <button id="reset-btn" class="btn-secondary">Reset to defaults</button>
    </div>

</div>
```

Note: `mfw-color-input` uses `input-id` (not `id`) — consistent with `mfw-settings-row` and `mfw-drop-zone`. The component reads `input-id` and applies it to the inner `<input type="text">` element. Style and component binding rows include `select-class` and `data-binding` attributes so the rendered `<select>` elements carry the CSS classes that `ui.ts` queries via `querySelectorAll`.

- [ ] **Step 4: Run `build:html` to regenerate `ui.html` and `ui-preview.html`**

```bash
cd figma-markdown-sync && npm run build:html
```

- [ ] **Step 5: Open the dev harness and verify the panels render**

```bash
open figma-markdown-sync/ui-preview.html
```

Open browser devtools console. Confirm no errors. All four tabs should switch correctly. The Settings tab should show labeled rows. The Import tab should show the drop zone and paste toggle.

- [ ] **Step 6: Commit**

```bash
cd figma-markdown-sync
git add src/panels/ ui.html ui-preview.html
git commit -m "feat: update panel partials to use mfw-* component tags"
```

---

### Task 18: Update `ui.ts` to use new component APIs

**Files:**
- Modify: `figma-markdown-sync/src/ui.ts`

This task updates `ui.ts` to wire the new components instead of querying raw DOM elements by ID for: tab bar, bottom bar, loader, paste section, file list, and theme selector. Settings inputs (accessed by `input-id`) remain getElementById-based since the components render inner inputs with those IDs into the global DOM.

- [ ] **Step 1: Replace tab-switching DOM refs and event binding**

In `src/ui.ts`, remove:
```ts
const tabs = document.querySelectorAll<HTMLButtonElement>('.tab');
const tabPanels = document.querySelectorAll<HTMLElement>('.tab-panel');
```

And remove the entire `tabs.forEach(tab => { ... });` block (lines 338-360 in the original).

Add at the top of the DOM references section:
```ts
const tabBar = document.querySelector('mfw-tab-bar') as HTMLElement;
```

Add a new tab-change handler after the imports (after `setupSettingListeners()`):
```ts
tabBar.addEventListener('mfw-tab-change', (e) => {
    const tab = (e as CustomEvent<{ tab: string }>).detail.tab;
    const panels = document.querySelectorAll<HTMLElement>('.tab-panel');
    panels.forEach(p => {
        p.classList.toggle('active', p.id === `tab-${tab}`);
        p.classList.toggle('hidden', p.id !== `tab-${tab}`);
    });
    if (tab === 'settings') {
        parent.postMessage({ pluginMessage: { type: MSG_GET_SETTINGS } }, '*');
        parent.postMessage({ pluginMessage: { type: MSG_GET_LOCAL_STYLES } }, '*');
        parent.postMessage({ pluginMessage: { type: MSG_GET_LOCAL_COMPONENTS } }, '*');
    }
    if (tab === 'history') {
        parent.postMessage({ pluginMessage: { type: MSG_GET_HISTORY } }, '*');
    }
    if (tab === 'export') {
        parent.postMessage({ pluginMessage: { type: MSG_GET_SELECTION } }, '*');
    }
});
```

- [ ] **Step 2: Replace loader ref and usages**

Remove:
```ts
const loader = document.getElementById('loader') as HTMLElement;
```

Add:
```ts
const loader = document.querySelector('mfw-loader') as HTMLElement;
```

Replace all `loader.classList.remove('hidden')` with `loader.setAttribute('visible', '')`.
Replace all `loader.classList.add('hidden')` with `loader.removeAttribute('visible')`.

(Two occurrences: in `importBtn.addEventListener('click', ...)` and in `window.onmessage` MSG_STATUS handler.)

- [ ] **Step 3: Wire up `mfw-bottom-bar` slots and replace status/button refs**

Remove these getElementById calls:
```ts
const importBtn = document.getElementById('import-btn') as HTMLButtonElement;
const statusMsg = document.getElementById('status-message') as HTMLParagraphElement;
const previewCancelBtn = document.getElementById('preview-cancel') as HTMLButtonElement;
```

Add this block immediately after `import './components/mfw-index';` (after the components are registered and elements are upgraded):

```ts
// Wire bottom-bar slots — must run after mfw-index import upgrades the custom element
const _bottomBar = document.querySelector('mfw-bottom-bar')!;
const _statusSlot = _bottomBar.querySelector('[data-slot="status"]')!;
const _actionsSlot = _bottomBar.querySelector('[data-slot="actions"]')!;

const statusMsg = document.createElement('p');
statusMsg.className = 'status-message';
_statusSlot.appendChild(statusMsg);

const previewCancelBtn = document.createElement('button');
previewCancelBtn.className = 'btn-secondary hidden';
previewCancelBtn.textContent = 'Cancel';
_actionsSlot.appendChild(previewCancelBtn);

const importBtn = document.createElement('button');
importBtn.disabled = true;
importBtn.textContent = 'Import';
_actionsSlot.appendChild(importBtn);
```

Note: `importBtn`, `statusMsg`, `previewCancelBtn` are still accessible as `const` variables throughout the rest of the file — the rest of ui.ts is unchanged.

- [ ] **Step 4: Replace paste section DOM refs and event binding**

Remove:
```ts
const pasteToggle = document.getElementById('paste-toggle') as HTMLButtonElement;
const pasteAreaWrap = document.getElementById('paste-area-wrap') as HTMLElement;
const pasteArea = document.getElementById('paste-area') as HTMLTextAreaElement;
const pasteName = document.getElementById('paste-name') as HTMLInputElement;
const pasteImportBtn = document.getElementById('paste-import-btn') as HTMLButtonElement;
```

Add:
```ts
const pasteSectionEl = document.querySelector('mfw-paste-section') as HTMLElement & { reset(): void };
```

Remove the paste event listeners section (the `pasteToggle.addEventListener`, `pasteArea.addEventListener`, `pasteImportBtn.addEventListener` blocks).

Add:
```ts
pasteSectionEl.addEventListener('mfw-paste-import', (e) => {
    const { text, name } = (e as CustomEvent<{ text: string; name: string }>).detail;
    currentFiles = [{ name: `${name || 'Pasted Markdown'}.md`, content: text }];
    showPreview(currentFiles);
});
```

In the `MSG_STATUS` handler, replace the paste-reset block:
```ts
// Before:
pasteArea.value = '';
pasteName.value = '';
pasteImportBtn.disabled = true;

// After:
pasteSectionEl.reset();
```

- [ ] **Step 5: Replace file list ref and usage**

Remove:
```ts
const fileList = document.getElementById('file-list') as HTMLUListElement;
```

Add:
```ts
const fileListEl = document.querySelector('mfw-file-list') as HTMLElement & {
    setFiles(files: Array<{ name: string; size: number }>): void;
};
```

Replace `renderFileList` function:
```ts
// Before:
function renderFileList(files: { name: string; content: string }[]) {
    fileList.textContent = '';
    for (const file of files) {
        const li = document.createElement('li');
        li.textContent = file.name;
        fileList.appendChild(li);
    }
}

// After:
function renderFileList(files: { name: string; content: string }[]) {
    fileListEl.setFiles(files.map(f => ({ name: f.name, size: 0 })));
}
```

In `showPreview` and `hidePreview`, replace:
```ts
// Before:
fileList.style.display = 'none';   // in showPreview
fileList.style.display = '';       // in hidePreview

// After:
(fileListEl as HTMLElement).style.display = 'none';   // in showPreview
(fileListEl as HTMLElement).style.display = '';       // in hidePreview
```

- [ ] **Step 6: Replace theme selector refs and binding**

Remove:
```ts
const themeBtns = document.querySelectorAll<HTMLButtonElement>('.theme-btn');
```

Add:
```ts
const themeSelectorEl = document.querySelector('mfw-theme-selector') as HTMLElement;
```

In `populateSettings`, replace the theme-button activation block:
```ts
// Before:
const theme = settings.theme as string ?? 'minimal-light';
themeBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
});

// After:
const theme = settings.theme as string ?? 'minimal-light';
themeSelectorEl.setAttribute('active', theme);
```

In `setupSettingListeners`, replace the `themeBtns.forEach` block with:
```ts
themeSelectorEl.addEventListener('mfw-theme-change', (e) => {
    const theme = (e as CustomEvent<{ theme: string }>).detail.theme;
    if (!THEME_PRESETS[theme]) return;
    const preset = THEME_PRESETS[theme];
    for (const [key, value] of Object.entries(preset)) {
        const input = document.getElementById(key) as HTMLInputElement | null;
        if (input) {
            input.value = String(value);
            const swatch = document.getElementById(`${key}-swatch`) as HTMLInputElement | null;
            if (swatch && typeof value === 'string') swatch.value = value;
        }
    }
    updateCustomWidthVisibility();
    sendCurrentSettings();
});
```

In `sendCurrentSettings`, replace:
```ts
// Before:
const activeThemeBtn = document.querySelector('.theme-btn.active') as HTMLButtonElement | null;
settings.theme = activeThemeBtn?.dataset.theme ?? 'custom';

// After:
settings.theme = themeSelectorEl.getAttribute('active') ?? 'custom';
```

- [ ] **Step 7: Add `select-class` and `data-binding` forwarding to `mfw-settings-row.ts`**

The panel-settings.html rows (written in Task 17 Step 3) already carry `select-class` and `data-binding` attributes. `mfw-settings-row.ts` must forward these to the rendered `<select>` so `ui.ts` can query them via `querySelectorAll('.style-binding-select')` and `querySelectorAll('.component-binding-select')`.

In the select rendering branch of `mfw-settings-row.ts` (after `select.className = 'settings-select'`), add:

```ts
const selectClass = this.getAttribute('select-class');
if (selectClass) select.classList.add(selectClass);
const binding = this.getAttribute('data-binding');
if (binding) select.setAttribute('data-binding', binding);
```

Also add a test case for `select-class` forwarding to `src/components/__tests__/mfw-settings-row.test.ts`:

```ts
  it('forwards select-class and data-binding to the rendered select', () => {
    const el = makeComponent('mfw-settings-row', {
      label: 'H1', type: 'select', 'input-id': 'style-h1',
      'select-class': 'style-binding-select', 'data-binding': 'h1',
    });
    const select = el.querySelector<HTMLSelectElement>('select')!;
    expect(select.classList.contains('style-binding-select')).toBe(true);
    expect(select.getAttribute('data-binding')).toBe('h1');
  });
```

Run the updated test to confirm it passes:

```bash
cd figma-markdown-sync && npm test -- --testPathPattern=mfw-settings-row
```

Expected: All 6 tests PASS.

- [ ] **Step 8: Run `build:html` to apply panel changes, then run full build**

```bash
cd figma-markdown-sync && npm run build:html && npm run build
```

Expected: No TypeScript errors. Webpack build completes successfully.

- [ ] **Step 9: Run all tests**

```bash
cd figma-markdown-sync && npm test
```

Expected: All tests PASS.

- [ ] **Step 10: Open dev harness and smoke-test all functionality**

```bash
open figma-markdown-sync/ui-preview.html
```

Verify:
- All 4 tabs switch correctly
- Import tab: drop zone visible, paste toggle expands/collapses
- Settings tab: all sections render with labels and inputs
- Theme selector buttons highlight correctly
- History tab: "No imports yet." shows
- Export tab: "Select one or more frames..." shows
- Browser console: no errors

- [ ] **Step 11: Commit**

```bash
cd figma-markdown-sync
git add src/ui.ts src/components/mfw-settings-row.ts src/components/__tests__/mfw-settings-row.test.ts ui.html ui-preview.html
git commit -m "feat: wire new component APIs in ui.ts; add select-class forwarding to mfw-settings-row"
```

---

### Task 19: Update CLAUDE.md, add catalog entries, final verification

**Files:**
- Modify: `figma-markdown-sync/CLAUDE.md`
- Modify: `figma-markdown-sync/src/shells/ui-preview-shell.html`

- [ ] **Step 1: Update CLAUDE.md**

Replace the **Sync Rule** section with:

```markdown
## Source Files (Generated Outputs)

`ui.html` and `ui-preview.html` are generated — do not edit them directly.

Panel HTML lives in `src/panels/`. Shell templates live in `src/shells/`.
Run `npm run build:html` after editing either to regenerate both output files.

**Important:** `npm run build` (webpack) reads `ui.html` as its template. Always run
`build:html` before `build` when panel HTML has changed. Use `npm run build:ui` for
full rebuilds (tokens → html → webpack).
```

Replace the **Design tokens** line with:

```markdown
**Design tokens:** `src/tokens.ts` is the canonical source for all design values
(colors, spacing, typography, transitions). Running `npm run build:tokens` generates
`src/tokens.css`. **Never edit `src/tokens.css` by hand** — it is generated.
CSS custom properties in `src/styles.css` use `var(--*)` references sourced from tokens.
```

Update the **Web Components** section to remove the `querySelectorAll('.tab')` warning (that code has been replaced by `mfw-tab-bar`).

Add to **Web Components**:
```markdown
**Tab bar:** `mfw-tab-bar` owns all tab switching logic and fires `mfw-tab-change` events.
Do not add `querySelectorAll('.tab')` code to `ui.ts` — it will conflict.

**Catalog entries:** Every new component must have a catalog row in
`src/shells/ui-preview-shell.html`'s Component Catalog section.
```

- [ ] **Step 2: Add catalog entries for new components to `ui-preview-shell.html`**

In `figma-markdown-sync/src/shells/ui-preview-shell.html`, replace `<!-- NEW COMPONENT CATALOG ENTRIES GO HERE -->` with:

```html
<div class="catalog-section">
    <h3 class="catalog-section-title">mfw-tab-bar</h3>
    <div class="catalog-row">
        <span class="catalog-row-label">active="import" (default)</span>
        <mfw-tab-bar active="import" style="width:100%"></mfw-tab-bar>
    </div>
</div>

<div class="catalog-section">
    <h3 class="catalog-section-title">mfw-theme-selector</h3>
    <div class="catalog-row">
        <span class="catalog-row-label">active="minimal-light"</span>
        <mfw-theme-selector active="minimal-light"></mfw-theme-selector>
    </div>
    <div class="catalog-row">
        <span class="catalog-row-label">active="dark-mode"</span>
        <mfw-theme-selector active="dark-mode"></mfw-theme-selector>
    </div>
</div>

<div class="catalog-section">
    <h3 class="catalog-section-title">mfw-settings-section</h3>
    <div class="catalog-row">
        <span class="catalog-row-label">with title</span>
        <mfw-settings-section title="Example Section" style="width:100%">
            <p style="font-size:11px;color:#888;margin:4px 0;">Child content preserved</p>
        </mfw-settings-section>
    </div>
</div>

<div class="catalog-section">
    <h3 class="catalog-section-title">mfw-settings-row</h3>
    <div class="catalog-row" style="background:#fff;">
        <span class="catalog-row-label">type=number</span>
        <mfw-settings-row label="Block spacing" type="number" input-id="cat-blockSpacing" min="0" max="200" unit="px" style="width:100%"></mfw-settings-row>
    </div>
    <div class="catalog-row" style="background:#fff;">
        <span class="catalog-row-label">type=checkbox</span>
        <mfw-settings-row label="Generate TOC" type="checkbox" input-id="cat-generateToc" style="width:100%"></mfw-settings-row>
    </div>
</div>

<div class="catalog-section">
    <h3 class="catalog-section-title">mfw-color-input</h3>
    <div class="catalog-row" style="background:#fff;">
        <span class="catalog-row-label">with placeholder</span>
        <mfw-color-input input-id="cat-frameFill" placeholder="#FFFFFF" style="display:flex;gap:4px;"></mfw-color-input>
    </div>
</div>

<div class="catalog-section">
    <h3 class="catalog-section-title">mfw-paste-section</h3>
    <div class="catalog-row">
        <span class="catalog-row-label">collapsed (default)</span>
        <mfw-paste-section style="width:100%"></mfw-paste-section>
    </div>
</div>

<div class="catalog-section">
    <h3 class="catalog-section-title">mfw-loader</h3>
    <div class="catalog-row">
        <span class="catalog-row-label">visible=absent (hidden)</span>
        <mfw-loader></mfw-loader><span style="color:#888;font-size:11px;">(overlay hidden)</span>
    </div>
</div>
```

- [ ] **Step 3: Run `build:html` to update `ui-preview.html` with new catalog entries**

```bash
cd figma-markdown-sync && npm run build:html
```

- [ ] **Step 4: Run the full build:ui to confirm everything wires up end-to-end**

```bash
cd figma-markdown-sync && npm run build:ui
```

Expected: all three steps complete with no errors:
```
tokens.css written to .../src/tokens.css
Written: ui.html
Written: ui-preview.html
webpack compilation successful
```

- [ ] **Step 5: Run all tests one final time**

```bash
cd figma-markdown-sync && npm test
```

Expected: All tests PASS.

- [ ] **Step 6: Final smoke test in browser**

Open `figma-markdown-sync/ui-preview.html`. Verify:
- Plugin frame renders correctly with all 4 tabs
- Component catalog shows all new components
- No console errors

- [ ] **Step 7: Final commit**

```bash
cd figma-markdown-sync
git add CLAUDE.md src/shells/ui-preview-shell.html ui-preview.html
git commit -m "docs: update CLAUDE.md with new dev workflow; add component catalog entries"
```
