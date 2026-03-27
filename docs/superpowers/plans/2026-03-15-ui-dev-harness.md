# UI Dev Harness & Mini Design System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up a browser-based UI preview page and vanilla Web Components library so the plugin UI can be iterated without reloading Figma.

**Architecture:** A standalone `ui-preview.html` links directly to `src/styles.css` (no build needed for CSS changes) and loads a separate `dist/components.js` webpack bundle that registers all `mfw-*` Web Components. The components bundle is isolated from `dist/ui.js` so Figma API calls never execute in the preview. Components are vanilla `HTMLElement` subclasses with no shadow DOM, styled via the shared design token CSS variables.

**Tech Stack:** TypeScript, webpack 5, vanilla Web Components (no library), jest 30 + jest-environment-jsdom for component tests

---

## File Structure

| File | Role |
|---|---|
| `figma-markdown-sync/tsconfig.json` | Compiler config — target bumped to es2017 |
| `figma-markdown-sync/webpack.config.js` | Build config — new `components` entry produces `dist/components.js` |
| `figma-markdown-sync/src/components/mfw-index.ts` | Registers all `mfw-*` components; imported by `ui.ts` and used as the components entry point |
| `figma-markdown-sync/src/components/mfw-button.ts` | Button component — wraps existing `.btn-primary` / `.btn-secondary` / `.btn-link` CSS classes |
| `figma-markdown-sync/src/components/mfw-status.ts` | Status message component — wraps `#status-message` paragraph pattern |
| `figma-markdown-sync/src/components/mfw-drop-zone.ts` | Drop zone component — wraps the file drop target UI |
| `figma-markdown-sync/src/components/__tests__/mfw-button.test.ts` | Unit tests for mfw-button |
| `figma-markdown-sync/src/components/__tests__/mfw-status.test.ts` | Unit tests for mfw-status |
| `figma-markdown-sync/src/components/__tests__/mfw-drop-zone.test.ts` | Unit tests for mfw-drop-zone |
| `figma-markdown-sync/ui-preview.html` | Browser dev harness — 320x500px plugin frame + component catalog |
| `figma-markdown-sync/CLAUDE.md` | Session-persistent dev workflow instructions for Claude |

---

## Chunk 1: Foundation

### Task 1: Bump TypeScript target to ES2017

**Files:**
- Modify: `figma-markdown-sync/tsconfig.json`

- [ ] **Step 1: Change the target in tsconfig.json**

  In `figma-markdown-sync/tsconfig.json`, change:
  ```json
  "target": "es5",
  "lib": ["dom", "es5", "es6"],
  ```
  to:
  ```json
  "target": "es2017",
  "lib": ["dom", "es5", "es6"],
  ```
  The `lib` array stays the same — `"es6"` already covers the ES2015 APIs needed for Web Components.

- [ ] **Step 2: Verify existing build still passes**

  ```bash
  cd figma-markdown-sync && npm run build
  ```
  Expected: Build completes with no TypeScript errors. `dist/ui.html` and `dist/code.js` produced.

- [ ] **Step 3: Verify existing tests still pass**

  ```bash
  npm test
  ```
  Expected: All existing tests pass. (The target change does not affect Jest, which uses its own ts-jest tsconfig override.)

- [ ] **Step 4: Commit**

  ```bash
  git add figma-markdown-sync/tsconfig.json
  git commit -m "fix: bump tsconfig target to es2017 for Web Components compatibility"
  ```

---

### Task 2: Add components webpack entry and install jest-environment-jsdom

**Files:**
- Modify: `figma-markdown-sync/webpack.config.js`
- Modify: `figma-markdown-sync/package.json` (via npm install)
- Create: `figma-markdown-sync/src/components/mfw-index.ts`

- [ ] **Step 1: Install jest-environment-jsdom**

  ```bash
  cd figma-markdown-sync && npm install --save-dev jest-environment-jsdom
  ```
  Expected: Package added to `devDependencies`. `package-lock.json` updated.

- [ ] **Step 2: Create placeholder mfw-index.ts**

  Create `figma-markdown-sync/src/components/mfw-index.ts`:
  ```typescript
  // Component registry — import each component here to register it.
  // This file is the entry point for dist/components.js (dev preview)
  // and is also imported by src/ui.ts (production bundle).
  export {};
  ```

- [ ] **Step 3: Add components entry to webpack.config.js**

  In `figma-markdown-sync/webpack.config.js`, change:
  ```js
  entry: {
    ui: './src/ui.ts',
    code: './code.ts',
  },
  ```
  to:
  ```js
  entry: {
    ui: './src/ui.ts',
    code: './code.ts',
    components: './src/components/mfw-index.ts',
  },
  ```

- [ ] **Step 4: Build and verify dist/components.js is produced**

  ```bash
  npm run build
  ```
  Expected: Build succeeds.

  ```bash
  ls dist/
  ```
  Expected output includes: `code.js  components.js  ui.html`

- [ ] **Step 5: Commit**

  ```bash
  git add figma-markdown-sync/webpack.config.js figma-markdown-sync/src/components/mfw-index.ts figma-markdown-sync/package.json figma-markdown-sync/package-lock.json
  git commit -m "feat: add components webpack entry and jest-environment-jsdom"
  ```

---

### Task 3: Write CLAUDE.md

**Files:**
- Create: `figma-markdown-sync/CLAUDE.md`

- [ ] **Step 1: Create the file**

  Create `figma-markdown-sync/CLAUDE.md` with the following content:

  ```markdown
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
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add figma-markdown-sync/CLAUDE.md
  git commit -m "docs: add CLAUDE.md with UI dev harness and component conventions"
  ```

---

## Chunk 2: Components and Preview Page

### Task 4: mfw-button component

**Files:**
- Create: `figma-markdown-sync/src/components/mfw-button.ts`
- Create: `figma-markdown-sync/src/components/__tests__/mfw-button.test.ts`
- Modify: `figma-markdown-sync/src/components/mfw-index.ts`

The existing CSS has three button classes: `.btn-primary`, `.btn-secondary`, `.btn-link`. The component maps a `variant` attribute (`primary` | `secondary` | `link`) to these. A `label` attribute sets button text. A `disabled` attribute passes through to the inner button.

- [ ] **Step 1: Write the failing test**

  Create `figma-markdown-sync/src/components/__tests__/mfw-button.test.ts`:
  ```typescript
  /**
   * @jest-environment jsdom
   */
  import '../mfw-button';

  describe('mfw-button', () => {
    function make(attrs: Record<string, string> = {}): HTMLElement {
      const el = document.createElement('mfw-button');
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      document.body.appendChild(el);
      return el;
    }

    afterEach(() => { document.body.textContent = ''; });

    it('registers as a custom element', () => {
      expect(customElements.get('mfw-button')).toBeDefined();
    });

    it('renders a button with btn-primary class by default', () => {
      const el = make({ label: 'Click me' });
      const btn = el.querySelector('button');
      expect(btn).not.toBeNull();
      expect(btn!.className).toBe('btn-primary');
      expect(btn!.textContent).toBe('Click me');
    });

    it('renders btn-secondary when variant is secondary', () => {
      const el = make({ variant: 'secondary', label: 'Cancel' });
      expect(el.querySelector('button')!.className).toBe('btn-secondary');
    });

    it('renders btn-link when variant is link', () => {
      const el = make({ variant: 'link', label: 'All' });
      expect(el.querySelector('button')!.className).toBe('btn-link');
    });

    it('passes disabled attribute to inner button', () => {
      const el = make({ label: 'Go', disabled: '' });
      expect(el.querySelector('button')!.disabled).toBe(true);
    });

    it('does not double-render on reconnect', () => {
      const el = make({ label: 'X' });
      document.body.removeChild(el);
      document.body.appendChild(el);
      expect(el.querySelectorAll('button').length).toBe(1);
    });
  });
  ```

- [ ] **Step 2: Run test to confirm it fails**

  ```bash
  cd figma-markdown-sync && npx jest src/components/__tests__/mfw-button.test.ts --no-coverage
  ```
  Expected: FAIL — `Cannot find module '../mfw-button'`

- [ ] **Step 3: Implement mfw-button.ts**

  Create `figma-markdown-sync/src/components/mfw-button.ts`:
  ```typescript
  type ButtonVariant = 'primary' | 'secondary' | 'link';

  const VARIANT_CLASS: Record<ButtonVariant, string> = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    link: 'btn-link',
  };

  class MfwButton extends HTMLElement {
    connectedCallback(): void {
      this.render();
    }

    render(): void {
      while (this.firstChild) this.removeChild(this.firstChild);

      const variant = (this.getAttribute('variant') ?? 'primary') as ButtonVariant;
      const label = this.getAttribute('label') ?? '';
      const isDisabled = this.hasAttribute('disabled');

      const btn = document.createElement('button');
      btn.className = VARIANT_CLASS[variant] ?? VARIANT_CLASS.primary;
      btn.textContent = label;
      btn.disabled = isDisabled;

      this.appendChild(btn);
    }
  }

  customElements.define('mfw-button', MfwButton);
  ```

- [ ] **Step 4: Register in mfw-index.ts**

  Replace the contents of `figma-markdown-sync/src/components/mfw-index.ts`:
  ```typescript
  // Component registry — import each component here to register it.
  // This file is the entry point for dist/components.js (dev preview)
  // and is also imported by src/ui.ts (production bundle).
  import './mfw-button';
  ```

- [ ] **Step 5: Run tests to confirm they pass**

  ```bash
  npx jest src/components/__tests__/mfw-button.test.ts --no-coverage
  ```
  Expected: PASS — all 6 tests green.

- [ ] **Step 6: Verify build succeeds**

  ```bash
  npm run build
  ```
  Expected: Build succeeds, no TypeScript errors.

- [ ] **Step 7: Commit**

  ```bash
  git add figma-markdown-sync/src/components/mfw-button.ts figma-markdown-sync/src/components/__tests__/mfw-button.test.ts figma-markdown-sync/src/components/mfw-index.ts
  git commit -m "feat: add mfw-button web component"
  ```

---

### Task 5: mfw-status component

**Files:**
- Create: `figma-markdown-sync/src/components/mfw-status.ts`
- Create: `figma-markdown-sync/src/components/__tests__/mfw-status.test.ts`
- Modify: `figma-markdown-sync/src/components/mfw-index.ts`

Wraps the `#status-message` pattern: a `<p class="status-message">` that is hidden when empty. Accepts a `message` attribute and a `type` attribute (`info` | `error` | `success`) that adds a modifier class.

- [ ] **Step 1: Write the failing test**

  Create `figma-markdown-sync/src/components/__tests__/mfw-status.test.ts`:
  ```typescript
  /**
   * @jest-environment jsdom
   */
  import '../mfw-status';

  describe('mfw-status', () => {
    function make(attrs: Record<string, string> = {}): HTMLElement {
      const el = document.createElement('mfw-status');
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      document.body.appendChild(el);
      return el;
    }

    afterEach(() => { document.body.textContent = ''; });

    it('registers as a custom element', () => {
      expect(customElements.get('mfw-status')).toBeDefined();
    });

    it('renders a p.status-message element', () => {
      const el = make({ message: 'Ready' });
      const p = el.querySelector('p');
      expect(p).not.toBeNull();
      expect(p!.classList.contains('status-message')).toBe(true);
      expect(p!.textContent).toBe('Ready');
    });

    it('is hidden when no message is set', () => {
      const el = make();
      expect(el.querySelector('p')!.hidden).toBe(true);
    });

    it('is visible when message is set', () => {
      const el = make({ message: 'Importing...' });
      expect(el.querySelector('p')!.hidden).toBe(false);
    });

    it('applies type modifier class', () => {
      const el = make({ message: 'Done', type: 'success' });
      expect(el.querySelector('p')!.classList.contains('status-message--success')).toBe(true);
    });

    it('does not double-render on reconnect', () => {
      const el = make({ message: 'X' });
      document.body.removeChild(el);
      document.body.appendChild(el);
      expect(el.querySelectorAll('p').length).toBe(1);
    });
  });
  ```

- [ ] **Step 2: Run test to confirm it fails**

  ```bash
  npx jest src/components/__tests__/mfw-status.test.ts --no-coverage
  ```
  Expected: FAIL — `Cannot find module '../mfw-status'`

- [ ] **Step 3: Implement mfw-status.ts**

  Create `figma-markdown-sync/src/components/mfw-status.ts`:
  ```typescript
  type StatusType = 'info' | 'error' | 'success';

  class MfwStatus extends HTMLElement {
    connectedCallback(): void {
      this.render();
    }

    render(): void {
      while (this.firstChild) this.removeChild(this.firstChild);

      const message = this.getAttribute('message') ?? '';
      const type = (this.getAttribute('type') ?? 'info') as StatusType;

      const p = document.createElement('p');
      p.className = 'status-message';
      if (type !== 'info') p.classList.add(`status-message--${type}`);
      p.textContent = message;
      p.hidden = message === '';

      this.appendChild(p);
    }
  }

  customElements.define('mfw-status', MfwStatus);
  ```

- [ ] **Step 4: Register in mfw-index.ts**

  Update `figma-markdown-sync/src/components/mfw-index.ts`:
  ```typescript
  import './mfw-button';
  import './mfw-status';
  ```

- [ ] **Step 5: Run tests to confirm they pass**

  ```bash
  npx jest src/components/__tests__/mfw-status.test.ts --no-coverage
  ```
  Expected: PASS — all 6 tests green.

- [ ] **Step 6: Commit**

  ```bash
  git add figma-markdown-sync/src/components/mfw-status.ts figma-markdown-sync/src/components/__tests__/mfw-status.test.ts figma-markdown-sync/src/components/mfw-index.ts
  git commit -m "feat: add mfw-status web component"
  ```

---

### Task 6: mfw-drop-zone component

**Files:**
- Create: `figma-markdown-sync/src/components/mfw-drop-zone.ts`
- Create: `figma-markdown-sync/src/components/__tests__/mfw-drop-zone.test.ts`
- Modify: `figma-markdown-sync/src/components/mfw-index.ts`

Renders the file drop target: an icon span, a label, a sub-label, and a file input that covers the zone. Accepts `icon`, `label`, `sub-label`, `accept`, and `input-id` attributes. The `input-id` attribute is optional — omitting it leaves the input without an ID (safe for catalog use; set it to `file-input` when used in `ui.html`).

- [ ] **Step 1: Write the failing test**

  Create `figma-markdown-sync/src/components/__tests__/mfw-drop-zone.test.ts`:
  ```typescript
  /**
   * @jest-environment jsdom
   */
  import '../mfw-drop-zone';

  describe('mfw-drop-zone', () => {
    function make(attrs: Record<string, string> = {}): HTMLElement {
      const el = document.createElement('mfw-drop-zone');
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      document.body.appendChild(el);
      return el;
    }

    afterEach(() => { document.body.textContent = ''; });

    it('registers as a custom element', () => {
      expect(customElements.get('mfw-drop-zone')).toBeDefined();
    });

    it('renders a div.drop-zone wrapper', () => {
      const el = make();
      expect(el.querySelector('div.drop-zone')).not.toBeNull();
    });

    it('renders the label text', () => {
      const el = make({ label: 'Drop Markdown here' });
      const p = el.querySelector('p.drop-zone-label');
      expect(p!.textContent).toBe('Drop Markdown here');
    });

    it('renders the sub-label text', () => {
      const el = make({ 'sub-label': 'or click to browse' });
      const p = el.querySelector('p.drop-zone-sub');
      expect(p!.textContent).toBe('or click to browse');
    });

    it('renders a file input with the accept attribute', () => {
      const el = make({ accept: '.md,.txt' });
      const input = el.querySelector('input[type="file"]') as HTMLInputElement;
      expect(input).not.toBeNull();
      expect(input.accept).toBe('.md,.txt');
    });

    it('does not double-render on reconnect', () => {
      const el = make({ label: 'Drop' });
      document.body.removeChild(el);
      document.body.appendChild(el);
      expect(el.querySelectorAll('div.drop-zone').length).toBe(1);
    });
  });
  ```

- [ ] **Step 2: Run test to confirm it fails**

  ```bash
  npx jest src/components/__tests__/mfw-drop-zone.test.ts --no-coverage
  ```
  Expected: FAIL — `Cannot find module '../mfw-drop-zone'`

- [ ] **Step 3: Implement mfw-drop-zone.ts**

  Create `figma-markdown-sync/src/components/mfw-drop-zone.ts`:
  ```typescript
  class MfwDropZone extends HTMLElement {
    connectedCallback(): void {
      this.render();
    }

    render(): void {
      while (this.firstChild) this.removeChild(this.firstChild);

      const icon = this.getAttribute('icon') ?? '\u2193';
      const label = this.getAttribute('label') ?? 'Drop your Markdown here';
      const subLabel = this.getAttribute('sub-label') ?? 'or click to browse';
      const accept = this.getAttribute('accept') ?? '.md,.markdown,.txt';

      const wrapper = document.createElement('div');
      wrapper.className = 'drop-zone';

      const iconSpan = document.createElement('span');
      iconSpan.className = 'drop-zone-icon';
      iconSpan.textContent = icon;

      const labelP = document.createElement('p');
      labelP.className = 'drop-zone-label';
      labelP.textContent = label;

      const subP = document.createElement('p');
      subP.className = 'drop-zone-sub';
      subP.textContent = subLabel;

      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      const inputId = this.getAttribute('input-id');
      if (inputId) fileInput.id = inputId;
      fileInput.accept = accept;
      fileInput.multiple = true;
      fileInput.setAttribute('aria-label', 'Choose Markdown files');

      wrapper.appendChild(iconSpan);
      wrapper.appendChild(labelP);
      wrapper.appendChild(subP);
      wrapper.appendChild(fileInput);

      this.appendChild(wrapper);
    }
  }

  customElements.define('mfw-drop-zone', MfwDropZone);
  ```

- [ ] **Step 4: Register in mfw-index.ts**

  Update `figma-markdown-sync/src/components/mfw-index.ts`:
  ```typescript
  import './mfw-button';
  import './mfw-status';
  import './mfw-drop-zone';
  ```

- [ ] **Step 5: Run tests to confirm they pass**

  ```bash
  npx jest src/components/__tests__/mfw-drop-zone.test.ts --no-coverage
  ```
  Expected: PASS — all 6 tests green.

- [ ] **Step 6: Run the full test suite**

  ```bash
  npm test
  ```
  Expected: All tests pass (existing tests + 3 new component test files = no regressions).

- [ ] **Step 7: Commit**

  ```bash
  git add figma-markdown-sync/src/components/mfw-drop-zone.ts figma-markdown-sync/src/components/__tests__/mfw-drop-zone.test.ts figma-markdown-sync/src/components/mfw-index.ts
  git commit -m "feat: add mfw-drop-zone web component"
  ```

---

### Task 7: Wire components into ui.ts

**Files:**
- Modify: `figma-markdown-sync/src/ui.ts`

- [ ] **Step 1: Add the import at the top of ui.ts**

  Open `figma-markdown-sync/src/ui.ts`. After line 1 (`import './styles.css';`), add:
  ```typescript
  import './components/mfw-index';
  ```
  The top of the file should now read:
  ```typescript
  import './styles.css';
  import './components/mfw-index';
  import { marked } from 'marked';
  // ... rest of file unchanged
  ```

- [ ] **Step 2: Build and confirm no errors**

  ```bash
  cd figma-markdown-sync && npm run build
  ```
  Expected: Build succeeds. `dist/ui.html`, `dist/code.js`, `dist/components.js` all present.

- [ ] **Step 3: Run all tests**

  ```bash
  npm test
  ```
  Expected: All tests pass.

- [ ] **Step 4: Commit**

  ```bash
  git add figma-markdown-sync/src/ui.ts
  git commit -m "feat: import component registry into ui bundle"
  ```

---

### Task 8: ui-preview.html

**Files:**
- Create: `figma-markdown-sync/ui-preview.html`

The preview page renders a centered 320x500px plugin frame with a dark background, loads `src/styles.css` via a direct link, and loads `dist/components.js`. Below the frame is a Component Catalog showing every component variant in isolation.

The tab panel content inside the frame must be kept character-for-character identical to the corresponding panels in `ui.html`.

- [ ] **Step 1: Build to ensure dist/components.js is up to date**

  ```bash
  cd figma-markdown-sync && npm run build
  ```

- [ ] **Step 2: Create ui-preview.html**

  Create `figma-markdown-sync/ui-preview.html`:

  ```html
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>MFW UI Preview</title>
      <!-- Links source CSS directly — edit src/styles.css and refresh, no build needed -->
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

              <!-- SYNC: keep identical to ui.html nav -->
              <nav class="tab-bar">
                  <button class="tab active" data-tab="import">Import</button>
                  <button class="tab" data-tab="history">History</button>
                  <button class="tab" data-tab="settings">Settings</button>
                  <button class="tab" data-tab="export">Export</button>
              </nav>

              <!-- SYNC: keep identical to ui.html #tab-import -->
              <div id="tab-import" class="tab-panel active">
                  <div id="import-section" class="import-color-block">
                      <span class="plugin-wordmark">Markdown For What</span>
                      <div id="drop-zone" class="drop-zone">
                          <span class="drop-zone-icon">&darr;</span>
                          <p class="drop-zone-label">Drop your Markdown here</p>
                          <p class="drop-zone-sub">or click to browse &middot; .md .markdown .txt</p>
                          <input type="file" id="file-input" accept=".md,.markdown,.txt" multiple aria-label="Choose Markdown files">
                      </div>
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

              <!-- SYNC: keep identical to ui.html #tab-history -->
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

              <!-- SYNC: keep identical to ui.html #tab-settings -->
              <div id="tab-settings" class="tab-panel hidden">
                  <div class="settings-section">
                      <h3 class="settings-section-title">Theme</h3>
                      <div class="theme-selector">
                          <button class="theme-btn active" data-theme="minimal-light">Light</button>
                          <button class="theme-btn" data-theme="dark-mode">Dark</button>
                          <button class="theme-btn" data-theme="documentation">Docs</button>
                      </div>
                  </div>
                  <p class="settings-hint" style="padding:16px">Full settings panel in ui.html</p>
              </div>

              <!-- SYNC: keep identical to ui.html #tab-export -->
              <div id="tab-export" class="tab-panel hidden">
                  <div id="export-no-selection" class="export-empty">
                      <p>Select one or more frames on the canvas to export them as Markdown.</p>
                  </div>
              </div>

          </div>
      </div>

      <!-- Component Catalog -->
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
                  <div class="catalog-row">
                      <span class="catalog-row-label">no message (hidden)</span>
                      <mfw-status></mfw-status>
                  </div>
              </div>

              <div class="catalog-section">
                  <h3 class="catalog-section-title">mfw-drop-zone</h3>
                  <div class="catalog-row">
                      <span class="catalog-row-label">default</span>
                      <mfw-drop-zone style="width:100%"></mfw-drop-zone>
                  </div>
              </div>

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

- [ ] **Step 3: Open in browser and verify**

  ```bash
  open figma-markdown-sync/ui-preview.html
  ```
  Check:
  - Import tab is visible inside the 320x500 frame with correct styling
  - Tab switching (History / Settings / Export) works
  - Component Catalog below renders all three components
  - No console errors (open browser DevTools → Console)

- [ ] **Step 4: Verify the CSS iteration loop**

  In `figma-markdown-sync/src/styles.css`, temporarily change `--color-accent` to `red`, save the file, then refresh the browser (no build needed). The drop zone border and accent elements should turn red. Revert the change after verifying.

- [ ] **Step 5: Commit**

  ```bash
  git add figma-markdown-sync/ui-preview.html
  git commit -m "feat: add ui-preview.html browser dev harness with component catalog"
  ```

---

### Task 9: Final verification

- [ ] **Step 1: Run the full test suite**

  ```bash
  cd figma-markdown-sync && npm test
  ```
  Expected: All tests pass (existing tests + 3 new component test files, no regressions).

- [ ] **Step 2: Run production build**

  ```bash
  npm run build
  ```
  Expected: Build succeeds. `dist/` contains `ui.html`, `code.js`, `components.js`.

- [ ] **Step 3: Confirm preview still works after build**

  ```bash
  open figma-markdown-sync/ui-preview.html
  ```
  Expected: Renders correctly with no console errors.

- [ ] **Step 4: Confirm plugin loads in Figma**

  Open Figma → Plugins → Development → MarkDown For What. The plugin should open and function identically to before this work.

- [ ] **Step 5: Clean up if needed**

  ```bash
  cd figma-markdown-sync && git status
  ```
  If clean: done. Stage and commit any remaining files if present.
