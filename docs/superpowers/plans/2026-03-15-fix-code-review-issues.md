# Fix Code Review Issues Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three bugs identified in the PR #21 code review: a null-crashing ID mismatch in `ui.ts`, an unpopulated `widthMode` select, and two missing component catalog entries in the preview shell.

**Architecture:** All three fixes are targeted changes — one string rename in `ui.ts`, one `setOptions` call added to `ui.ts` init, and two HTML blocks added to `ui-preview-shell.html`. No new files, no architectural changes.

**Tech Stack:** TypeScript, vanilla Web Components, HTML, webpack (`npm run build:html` regenerates `ui.html` and `ui-preview.html` from shells + panels).

---

## Chunk 1: Bug Fixes in ui.ts

### Task 1: Fix `getElementById('import-section')` null crash

**Files:**
- Modify: `figma-markdown-sync/src/ui.ts:138`

The panel HTML uses `id="import-normal-state"` but `ui.ts` queries `id="import-section"` and casts the result as non-null. `showPreview()` and `hidePreview()` then unconditionally write to `.style.display`, crashing on first file drop.

- [ ] **Step 1: Confirm the mismatch**

  ```bash
  grep -n "import-section\|import-normal-state" \
    figma-markdown-sync/src/ui.ts \
    figma-markdown-sync/src/panels/panel-import.html
  ```

  Expected: `ui.ts:138` shows `import-section`, `panel-import.html:3` shows `import-normal-state`.

- [ ] **Step 2: Fix the ID in ui.ts**

  In `figma-markdown-sync/src/ui.ts`, change line 138:

  ```typescript
  // Before:
  const importSection = document.getElementById('import-section') as HTMLElement;

  // After:
  const importSection = document.getElementById('import-normal-state') as HTMLElement;
  ```

- [ ] **Step 3: Run tests to confirm no regressions**

  ```bash
  cd figma-markdown-sync && npm test
  ```

  Expected: All tests pass.

- [ ] **Step 4: Commit**

  ```bash
  git add figma-markdown-sync/src/ui.ts
  git commit -m "fix: correct getElementById id from import-section to import-normal-state"
  ```

---

### Task 2: Populate `widthMode` select options at init

**Files:**
- Modify: `figma-markdown-sync/src/ui.ts` (after the DOM refs block, ~line 200)

The settings panel uses `<mfw-settings-row type="select" input-id="widthMode">` which renders a bare `<select>` with no options. `mfw-settings-row` exposes a `setOptions()` method that must be called explicitly. Without options, `widthMode.value` is always `""` and width always falls back to the hardcoded 800px default.

The options must match the existing `widthPresets` map (`narrow/medium/wide`) plus `custom` (used by `updateCustomWidthVisibility`).

- [ ] **Step 1: Find the right insertion point**

  ```bash
  grep -n "DOM references\|const tabBar\|const loader\|initBottomBar\|window.addEventListener" \
    figma-markdown-sync/src/ui.ts | head -20
  ```

  Look for the end of the DOM refs block (after all `const` element queries, before event wiring). This is the correct place to add the `setOptions` call.

- [ ] **Step 2: Add `setOptions` call for `widthMode`**

  After the existing DOM refs block in `figma-markdown-sync/src/ui.ts`, add:

  ```typescript
  // Populate static width options — mfw-settings-row renders an empty <select> by default
  const widthModeRow = document.querySelector<HTMLElement & {
      setOptions(items: Array<{ value: string; label: string }>): void;
  }>('mfw-settings-row[input-id="widthMode"]');
  widthModeRow?.setOptions([
      { value: 'narrow', label: 'Narrow (480px)' },
      { value: 'medium', label: 'Medium (800px)' },
      { value: 'wide',   label: 'Wide (960px)' },
      { value: 'custom', label: 'Custom' },
  ]);
  ```

  Place this immediately after the last `const` DOM ref (before `initBottomBar()` or the first event listener), so it runs after custom elements have upgraded.

- [ ] **Step 3: Run tests**

  ```bash
  cd figma-markdown-sync && npm test
  ```

  Expected: All tests pass. (The `mfw-settings-row` `setOptions` test already covers this method.)

- [ ] **Step 4: Commit**

  ```bash
  git add figma-markdown-sync/src/ui.ts
  git commit -m "fix: populate widthMode select options at init via setOptions"
  ```

---

## Chunk 2: Missing Catalog Entries

### Task 3: Add `mfw-bottom-bar` and `mfw-file-list` to catalog

**Files:**
- Modify: `figma-markdown-sync/src/shells/ui-preview-shell.html`
- Regenerate: `figma-markdown-sync/ui-preview.html` (via `npm run build:html`)

CLAUDE.md requires every new component to have a catalog row in the Component Catalog section of `ui-preview-shell.html`. Both `mfw-bottom-bar` and `mfw-file-list` are missing.

`mfw-bottom-bar` renders a `bottom-bar` div with `data-slot="status"` and `data-slot="actions"` child divs — content is appended programmatically after `connectedCallback`. For the catalog, show it with a populated status slot and an action button populated via the existing inline catalog script.

`mfw-file-list` exposes a `setFiles(files: FileItem[])` method. The catalog script must call it after the element connects.

- [ ] **Step 1: Find the insertion point**

  ```bash
  grep -n "mfw-section-header\|</div>.*catalog" \
    figma-markdown-sync/src/shells/ui-preview-shell.html | tail -10
  ```

  Insert the two new catalog sections immediately after the closing `</div>` of the `mfw-section-header` section (before the `</div>` that closes the catalog grid).

- [ ] **Step 2: Add catalog entries**

  In `figma-markdown-sync/src/shells/ui-preview-shell.html`, after the `mfw-section-header` catalog section, add:

  ```html
          <div class="catalog-section">
              <h3 class="catalog-section-title">mfw-bottom-bar</h3>
              <div class="catalog-row">
                  <mfw-bottom-bar id="catalog-bottom-bar" style="flex:1"></mfw-bottom-bar>
              </div>
          </div>

          <div class="catalog-section">
              <h3 class="catalog-section-title">mfw-file-list</h3>
              <div class="catalog-row">
                  <mfw-file-list id="catalog-file-list"></mfw-file-list>
              </div>
          </div>
  ```

- [ ] **Step 3: Populate catalog demos via the existing inline script**

  In the existing `<script>` block at the bottom of `ui-preview-shell.html` (after `dist/components.js` loads), add demo population for the two new components:

  ```js
  // mfw-bottom-bar demo
  customElements.whenDefined('mfw-bottom-bar').then(function() {
      var bar = document.getElementById('catalog-bottom-bar');
      if (bar) {
          var slot = bar.querySelector('[data-slot="status"]');
          if (slot) slot.textContent = 'Ready';
          var actions = bar.querySelector('[data-slot="actions"]');
          if (actions) {
              var btn = document.createElement('button');
              btn.className = 'btn-primary';
              btn.textContent = 'Import';
              actions.appendChild(btn);
          }
      }
  });

  // mfw-file-list demo
  customElements.whenDefined('mfw-file-list').then(function() {
      var list = document.getElementById('catalog-file-list');
      if (list && list.setFiles) {
          list.setFiles([
              { name: 'getting-started.md', meta: '3 blocks' },
              { name: 'api-reference.md',   meta: '12 blocks' },
          ]);
      }
  });
  ```

- [ ] **Step 4: Rebuild HTML**

  ```bash
  cd figma-markdown-sync && npm run build:html
  ```

  Expected: Exits 0. `ui-preview.html` is regenerated.

- [ ] **Step 5: Verify catalog visually**

  ```bash
  open figma-markdown-sync/ui-preview.html
  ```

  In the browser, scroll to the Component Catalog. Confirm:
  - `mfw-bottom-bar` section appears with a bar showing "Ready" and an "Import" button
  - `mfw-file-list` section appears with two file rows

- [ ] **Step 6: Run tests**

  ```bash
  cd figma-markdown-sync && npm test
  ```

  Expected: All tests pass.

- [ ] **Step 7: Commit**

  ```bash
  git add figma-markdown-sync/src/shells/ui-preview-shell.html figma-markdown-sync/ui-preview.html
  git commit -m "fix: add mfw-bottom-bar and mfw-file-list catalog entries per CLAUDE.md"
  ```
