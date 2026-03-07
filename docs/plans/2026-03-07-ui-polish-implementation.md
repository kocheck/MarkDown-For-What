# UI Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give the plugin UI a "playful editorial" feel — deep teal color block on the Import tab, subtle grain texture, mint accent color throughout.

**Architecture:** Pure visual update. Two files change: `ui.html` gets a new wrapper div (`.import-color-block`) and wordmark element; `src/styles.css` gets all color/texture/layout changes. No TypeScript changes, no new behavior, no new tests (CSS is not unit-testable — verification is `npm run build` + visual check in Figma).

**Tech Stack:** Vanilla HTML, CSS (no preprocessor), Inter font (already loaded by Figma), inline SVG data URI for grain texture.

---

## Key color values (reference throughout)

```
--block:       #1B3543   ← deep ocean teal (color block bg)
--mint:        #52C7A0   ← accent (borders, button, indicators)
--mint-hover:  #3FB38A   ← button hover
--mint-muted:  #C8E8DF   ← text on dark, disabled button
--mint-subtle: rgba(82,199,160,0.5)  ← drop zone border at rest
--on-dark:     #FFFFFF   ← primary text on color block
```

---

### Task 1: HTML — Wrap import header, add wordmark, update drop zone copy

**Files:**
- Modify: `figma-markdown-sync/ui.html`

**Step 1: Wrap the drop zone in a color block container and add wordmark**

In `ui.html`, find the Import tab panel (lines 17–33). Replace its contents with:

```html
<!-- Import tab -->
<div id="tab-import" class="tab-panel active">

    <div class="import-color-block">
        <p class="plugin-wordmark">Markdown For What</p>

        <div id="drop-zone" class="drop-zone">
            <div class="drop-zone-icon">↓</div>
            <p class="drop-zone-label">Drop your Markdown here</p>
            <p class="drop-zone-sub">or click to browse · .md .markdown .txt</p>
            <input type="file" id="file-input" accept=".md,.markdown,.txt" multiple>
        </div>
    </div>

    <ul id="file-list" class="file-list"></ul>

    <div class="bottom-bar">
        <p id="status-message" class="status-message"></p>
        <button id="import-btn" disabled>Import</button>
    </div>

</div>
```

**Step 2: Verify the HTML is valid**

Open `figma-markdown-sync/ui.html` in a browser (`open ui.html` or drag into Chrome).
Expected: page renders without broken layout. The structure is visible but unstyled at this point — that's fine.

**Step 3: Build to confirm webpack still compiles**

```bash
cd figma-markdown-sync && npm run build
```
Expected: `webpack compiled successfully`

**Step 4: Commit**

```bash
git add figma-markdown-sync/ui.html
git commit -m "feat: add import-color-block wrapper and wordmark to ui.html"
```

---

### Task 2: CSS — Color block background + grain texture + wordmark

**Files:**
- Modify: `figma-markdown-sync/src/styles.css`

**Step 1: Add the color block and wordmark styles**

In `styles.css`, after the `.tab-panel.hidden` rule (around line 50), add:

```css
/* ── Import color block ───────────────────────────────── */
.import-color-block {
    background: #1B3543;
    flex-shrink: 0;
    padding: 12px 16px 16px;
    position: relative;
    overflow: hidden;
}

/* Grain texture overlay — SVG feTurbulence noise at 4% opacity */
.import-color-block::before {
    content: '';
    position: absolute;
    inset: 0;
    opacity: 0.04;
    mix-blend-mode: overlay;
    pointer-events: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E");
    background-size: 200px 200px;
}

.plugin-wordmark {
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #52C7A0;
    margin-bottom: 10px;
    position: relative; /* above grain pseudo-element */
    z-index: 1;
}
```

**Step 2: Build and visually check**

```bash
npm run build
```

Load the plugin in Figma (or open `dist/ui.html` in a browser).
Expected: Import tab has a dark teal upper block with the wordmark in mint text. The block has a very subtle grain texture visible up close. The drop zone sits inside the block (unstyled yet).

**Step 3: Commit**

```bash
git add figma-markdown-sync/src/styles.css
git commit -m "feat: add teal color block with grain texture and wordmark styling"
```

---

### Task 3: CSS — Drop zone, tab bar, file list, import button

**Files:**
- Modify: `figma-markdown-sync/src/styles.css`

**Step 1: Restyle the drop zone for the dark background**

Find the `.drop-zone` block (around line 53) and replace it entirely with:

```css
/* ── Drop zone ────────────────────────────────────────── */
.drop-zone {
    margin: 0;               /* margin is now on .import-color-block padding */
    border: 1.5px dashed rgba(82, 199, 160, 0.5);
    border-radius: 8px;
    padding: 28px 16px;
    text-align: center;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
    flex-shrink: 0;
    position: relative;
    z-index: 1;
    background: rgba(255, 255, 255, 0.05);
}

.drop-zone:hover,
.drop-zone.drag-over {
    border-color: #52C7A0;
    background: rgba(255, 255, 255, 0.10);
}

.drop-zone input[type="file"] {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
}

.drop-zone-icon {
    font-size: 20px;
    margin-bottom: 8px;
    color: #52C7A0;
}

.drop-zone-label {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.01em;
    color: #FFFFFF;
    margin-bottom: 4px;
}

.drop-zone-sub {
    font-size: 11px;
    font-style: italic;
    color: #C8E8DF;
}
```

**Step 2: Update tab bar active state to use mint**

Find `.tab.active` (around line 37) and change `border-bottom-color`:

```css
.tab.active {
    color: #000;
    border-bottom-color: #52C7A0;   /* was #000 */
}
```

**Step 3: Update file list — mint dot instead of emoji**

Find `.file-list li::before` (around line 114) and replace:

```css
.file-list li::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #52C7A0;
    flex-shrink: 0;
}
```

**Step 4: Update import button to mint**

Find `#import-btn` (around line 150) and update:

```css
#import-btn {
    background: #52C7A0;
    color: #fff;
    flex-shrink: 0;
}

#import-btn:hover:not(:disabled) { background: #3FB38A; }
#import-btn:disabled { background: #C8E8DF; cursor: default; }
```

**Step 5: Build and visually check**

```bash
npm run build
```

Expected in Import tab:
- Drop zone: dark semi-transparent area inside the teal block, with mint dashed border, white headline, mint ↓ icon, muted-mint sub-label
- Drop zone hover: border brightens to solid mint
- Tab bar: active tab has mint underline instead of black
- File list items: mint dot prefix (visible after dropping a file)
- Import button: mint green instead of black

**Step 6: Commit**

```bash
git add figma-markdown-sync/src/styles.css
git commit -m "feat: restyle drop zone, tab bar active state, file list dot, import button to mint"
```

---

### Task 4: CSS — Settings tab refinements

**Files:**
- Modify: `figma-markdown-sync/src/styles.css`

**Step 1: Add mint left-border to settings section titles**

Find `.settings-section-title` (around line 181) and add:

```css
.settings-section-title {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #999;
    margin-bottom: 10px;
    border-left: 2px solid #52C7A0;   /* new */
    padding-left: 8px;                /* new */
}
```

**Step 2: Make color swatches circular**

Find `.color-swatch` (around line 235) and replace:

```css
.color-swatch {
    width: 24px;
    height: 24px;
    padding: 0;
    border: 1px solid #E0E0E0;
    border-radius: 50%;
    cursor: pointer;
    background: none;
    overflow: hidden;
    flex-shrink: 0;
}
```

Note: `<input type="color">` renders its native picker — styling it circular hides the browser's default square chrome and shows just the color circle. This works in Chrome (Figma's renderer). Test visually.

**Step 3: Update reset button to mint outline style**

Find `#reset-btn` — it currently inherits `.btn-secondary`. Add a specific rule after `.btn-secondary`:

```css
#reset-btn {
    border-color: #52C7A0;
    color: #52C7A0;
}

#reset-btn:hover { background: rgba(82, 199, 160, 0.08); }
```

**Step 4: Build and visually check**

```bash
npm run build
```

Switch to Settings tab. Expected:
- Each section title (SPACING, FRAME, COLORS) has a mint left-border rule
- Color swatches are circular (not square)
- "Reset to defaults" button has a mint outline and mint text

**Step 5: Commit**

```bash
git add figma-markdown-sync/src/styles.css
git commit -m "feat: settings tab — mint section title borders, circular swatches, mint reset button"
```

---

### Task 5: Final check — run tests, build, push

**Step 1: Run the full test suite (backend logic is unchanged, should all pass)**

```bash
cd figma-markdown-sync && npm test
```
Expected: `88 tests passed, 0 failed`

**Step 2: Final build**

```bash
npm run build
```
Expected: `webpack compiled successfully`

**Step 3: Load in Figma and do a full visual walkthrough**

- Import tab: teal block, grain texture, wordmark, mint drop zone, mint button
- Drop a .md file: file list with mint dots, status message, mint Import button enabled
- Click Import: spinner overlay, then status message
- Settings tab: white, mint-accented section titles, circular swatches, mint reset button
- Switch tabs: active tab shows mint underline

**Step 4: Push and update PR**

```bash
git push origin kyle/polish
```
