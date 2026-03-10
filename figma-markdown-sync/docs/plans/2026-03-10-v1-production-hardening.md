# V1 Production Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Harden the plugin for v1 release by fixing all issues found in the PR review: stack trace loss, missing test coverage, unprotected async calls, error context propagation, and `initializeStyles` partial-failure corruption.

**Architecture:** Changes span three layers — (1) test coverage gaps filled in `renderer.test.ts`, (2) error context added at each async failure surface in `renderer.ts`, `tables.ts`, and `styles.ts`, and (3) `createErrorPlaceholder` made resilient by accepting a reason string and guarding its own failure. All changes are backwards-compatible with existing tests.

**Tech Stack:** TypeScript 5, Figma Plugin API, Jest 30

---

### Task 1: Docs + dead mock cleanup

**Files:**
- Modify: `figma-markdown-sync/styles.ts` (around line 111)
- Modify: `figma-markdown-sync/test-setup.ts` (around line 119)

**Step 1: Add `@param existingStyles` to the JSDoc in `styles.ts`**

Find the JSDoc block for `getOrCreateTextStyle` (lines 103–112). After the `@param config` line, add:

```typescript
 * @param existingStyles - Optional pre-fetched style list. When provided, skips the
 *                         `getLocalTextStylesAsync` IPC call. Pass from `initializeStyles`
 *                         to avoid N redundant calls during batch initialization.
```

**Step 2: Remove the dead sync mock from the global figma object in `test-setup.ts`**

Find line ~119:
```typescript
    getLocalTextStyles: jest.fn(() => []),
    getLocalTextStylesAsync: jest.fn().mockResolvedValue([]),
```

Remove the `getLocalTextStyles` line — the sync API is no longer called anywhere in production code:
```typescript
    getLocalTextStylesAsync: jest.fn().mockResolvedValue([]),
```

**Step 3: Run tests to confirm nothing breaks**

```bash
cd figma-markdown-sync && npm test 2>&1 | grep -E "Tests:|FAIL|PASS"
```
Expected: `Tests: 109 passed, 109 total`

**Step 4: Commit**

```bash
git add figma-markdown-sync/styles.ts figma-markdown-sync/test-setup.ts
git commit -m "docs: add @param existingStyles JSDoc; remove dead sync mock"
```

---

### Task 2: Fix console.error stack trace loss in renderer.ts

**Files:**
- Modify: `figma-markdown-sync/renderer.ts` (lines 213 and 235)

**Context:** `console.error(string)` drops the stack trace. `console.error(string, err)` preserves it in the Figma developer console. The current code uses `${errorMessage(err)}` in a template string and does NOT pass `err` as a second argument.

**Step 1: Fix line 213 (list block error)**

Find:
```typescript
console.error(`[MarkDown For What] Failed to render list block: ${errorMessage(err)}`);
```
Replace with:
```typescript
console.error(`[MarkDown For What] Failed to render list block: ${errorMessage(err)}`, err);
```

**Step 2: Fix line 235 (general block error)**

Find:
```typescript
console.error(`[MarkDown For What] Failed to render block type "${block.type}": ${errorMessage(err)}`);
```
Replace with:
```typescript
console.error(`[MarkDown For What] Failed to render block type "${block.type}": ${errorMessage(err)}`, err);
```

**Step 3: Run tests**

```bash
npm test 2>&1 | grep -E "Tests:|FAIL|PASS"
```
Expected: `Tests: 109 passed, 109 total`

**Step 4: Commit**

```bash
git add figma-markdown-sync/renderer.ts
git commit -m "fix: preserve error stack traces in console.error calls"
```

---

### Task 3: Add missing async API regression tests for paragraph and code blocks

**Files:**
- Modify: `figma-markdown-sync/renderer.test.ts` (inside `describe('async API usage', ...)`)

**Context:** The `async API usage` describe block currently tests heading (1 call) and list (2 calls). It is missing tests for `paragraph` and `code` blocks — two distinct code paths in `renderer.ts` that call `setTextStyleIdAsync`. A regression in either would go undetected.

**Step 1: Add paragraph and code tests to the `async API usage` describe block**

In `renderer.test.ts`, inside the existing `describe('async API usage', () => { ... })` block, after the list test, add:

```typescript
it('calls setTextStyleIdAsync on paragraph blocks', async () => {
    const blocks: Block[] = [
        { type: 'paragraph', content: 'Hello world', tokens: [] },
    ];

    await renderBlocks('Test', blocks, DEFAULT_SETTINGS);

    expect(countAsyncStyleCalls()).toBe(1);
});

it('calls setTextStyleIdAsync on code blocks', async () => {
    const blocks: Block[] = [
        { type: 'code', content: 'const x = 1;' },
    ];

    await renderBlocks('Test', blocks, DEFAULT_SETTINGS);

    expect(countAsyncStyleCalls()).toBe(1);
});
```

**Step 2: Run tests to verify they pass**

```bash
npm test renderer.test.ts 2>&1 | grep -E "Tests:|PASS|FAIL|async API"
```
Expected: all pass, count is now 111 total.

**Step 3: Commit**

```bash
git add figma-markdown-sync/renderer.test.ts
git commit -m "test: add async API regression tests for paragraph and code blocks"
```

---

### Task 4: Update createErrorPlaceholder to surface error reason

**Files:**
- Modify: `figma-markdown-sync/renderer.ts` — `createErrorPlaceholder` function (line ~381) and its 2 call sites (lines ~214 and ~236)

**Context:** The current placeholder text just says `Failed to render block: heading`. With the error reason included, it becomes `Failed to render block: heading — Cannot call setTextStyleIdAsync in current context`. This makes debugging from the Figma canvas much faster.

**Step 1: Update `createErrorPlaceholder` signature and text**

Find:
```typescript
async function createErrorPlaceholder(block: Block): Promise<FrameNode> {
```
Replace with:
```typescript
async function createErrorPlaceholder(block: Block, reason?: string): Promise<FrameNode> {
```

Find:
```typescript
    errText.characters = `Failed to render block: ${block.type}`;
```
Replace with:
```typescript
    errText.characters = reason
        ? `Failed to render block: ${block.type} — ${reason}`
        : `Failed to render block: ${block.type}`;
```

**Step 2: Update the list block call site (~line 214) to pass the reason**

Find:
```typescript
                } catch (err) {
                    console.error(`[MarkDown For What] Failed to render list block: ${errorMessage(err)}`, err);
                    const errFrame = await createErrorPlaceholder(listBlock);
```
Replace with:
```typescript
                } catch (err) {
                    console.error(`[MarkDown For What] Failed to render list block: ${errorMessage(err)}`, err);
                    const errFrame = await createErrorPlaceholder(listBlock, errorMessage(err));
```

**Step 3: Update the general block call site (~line 236) to pass the reason**

Find:
```typescript
        } catch (err) {
            console.error(`[MarkDown For What] Failed to render block type "${block.type}": ${errorMessage(err)}`, err);
            const errFrame = await createErrorPlaceholder(block);
```
Replace with:
```typescript
        } catch (err) {
            console.error(`[MarkDown For What] Failed to render block type "${block.type}": ${errorMessage(err)}`, err);
            const errFrame = await createErrorPlaceholder(block, errorMessage(err));
```

**Step 4: Guard `createErrorPlaceholder` calls against their own failure**

`createErrorPlaceholder` loads a font internally. If that font load fails, the whole `renderBlocks` call crashes. Wrap both call sites in a nested try/catch.

Replace the list block catch body:
```typescript
                } catch (err) {
                    console.error(`[MarkDown For What] Failed to render list block: ${errorMessage(err)}`, err);
                    try {
                        const errFrame = await createErrorPlaceholder(listBlock, errorMessage(err));
                        listGroupFrame.appendChild(errFrame);
                    } catch (placeholderErr) {
                        console.error(`[MarkDown For What] Could not create error placeholder for list block`, placeholderErr);
                    }
                }
```

Replace the general block catch body:
```typescript
        } catch (err) {
            console.error(`[MarkDown For What] Failed to render block type "${block.type}": ${errorMessage(err)}`, err);
            try {
                const errFrame = await createErrorPlaceholder(block, errorMessage(err));
                frame.appendChild(errFrame);
            } catch (placeholderErr) {
                console.error(`[MarkDown For What] Could not create error placeholder for "${block.type}" block`, placeholderErr);
            }
        }
```

**Step 5: Run tests**

```bash
npm test 2>&1 | grep -E "Tests:|FAIL|PASS"
```
Expected: all pass (existing error placeholder tests use `figma.createFrame` / `loadFont` mocks that already work).

**Step 6: Commit**

```bash
git add figma-markdown-sync/renderer.ts
git commit -m "fix: surface error reason in placeholders; guard placeholder creation"
```

---

### Task 5: Harden initializeStyles with allSettled and error annotation

**Files:**
- Modify: `figma-markdown-sync/styles.ts` — `initializeStyles` function (lines 143–149)

**Context:** `Promise.all` fails fast and leaves the style cache partially populated if any one style fails to create. `Promise.allSettled` collects all results, then we throw with a summary only if there were failures. Also wrap `figma.getLocalTextStylesAsync()` so it throws with context instead of a raw Figma error.

**Step 1: Replace `initializeStyles` implementation**

Find the entire function body:
```typescript
export async function initializeStyles(): Promise<void> {
    styleCache.clear();
    const allStyles = await figma.getLocalTextStylesAsync();
    await Promise.all(
        Object.keys(DEFAULT_STYLES).map(name => getOrCreateTextStyle(name, DEFAULT_STYLES[name], allStyles))
    );
}
```

Replace with:
```typescript
export async function initializeStyles(): Promise<void> {
    styleCache.clear();

    let allStyles: TextStyle[];
    try {
        allStyles = await figma.getLocalTextStylesAsync();
    } catch (err) {
        throw new Error(`[MarkDown For What] Failed to retrieve local text styles: ${errorMessage(err)}`);
    }

    const styleNames = Object.keys(DEFAULT_STYLES);
    const results = await Promise.allSettled(
        styleNames.map(name => getOrCreateTextStyle(name, DEFAULT_STYLES[name], allStyles))
    );

    const failures = results
        .map((result, i) => ({ result, name: styleNames[i] }))
        .filter(({ result }) => result.status === 'rejected');

    if (failures.length > 0) {
        const summary = failures
            .map(({ name, result }) => `${name}: ${errorMessage((result as PromiseRejectedResult).reason)}`)
            .join('; ');
        throw new Error(`[MarkDown For What] Failed to initialize ${failures.length} text style(s) — ${summary}`);
    }
}
```

Note: you need to import `errorMessage` in `styles.ts`. Check the top of the file. If it's not imported, add it:
```typescript
import { errorMessage } from './utils';
```

**Step 2: Run tests**

```bash
npm test styles.test.ts 2>&1 | grep -E "Tests:|FAIL|PASS"
```
Expected: all 15 styles tests pass.

**Step 3: Add a test for initializeStyles partial failure**

In `styles.test.ts`, inside `describe('initializeStyles', ...)`, add after the existing tests:

```typescript
it('throws with a summary when one or more styles fail to create', async () => {
    (figma.getLocalTextStylesAsync as jest.Mock).mockResolvedValue([]);
    (figma.loadFontAsync as jest.Mock)
        .mockRejectedValueOnce(new Error('Font unavailable'))  // first style fails
        .mockRejectedValueOnce(new Error('Inter not found'))   // fallback also fails
        .mockResolvedValue(undefined);                         // rest succeed
    (figma.createTextStyle as jest.Mock).mockReturnValue({
        id: 'style-id', name: '', fontName: {}, fontSize: 0, lineHeight: {},
    });

    await expect(initializeStyles()).rejects.toThrow('Failed to initialize');
});
```

**Step 4: Run all tests**

```bash
npm test 2>&1 | grep -E "Tests:|FAIL|PASS"
```
Expected: all pass, count is now 112 total.

**Step 5: Commit**

```bash
git add figma-markdown-sync/styles.ts figma-markdown-sync/styles.test.ts
git commit -m "fix: use Promise.allSettled in initializeStyles; add error context on failure"
```

---

### Task 6: Annotate initializeStyles failure in renderBlocks

**Files:**
- Modify: `figma-markdown-sync/renderer.ts` (line ~169)

**Context:** If `initializeStyles()` throws, the raw error propagates to `code.ts` which shows `Error importing file.md: <Figma internal message>`. Wrapping it here makes the error message clearly say the problem was during style initialization, before rendering even started.

**Step 1: Wrap `initializeStyles()` call in renderBlocks**

Find:
```typescript
    // Ensure all Markdown/* text styles exist
    await initializeStyles();
```

Replace with:
```typescript
    // Ensure all Markdown/* text styles exist
    try {
        await initializeStyles();
    } catch (err) {
        throw new Error(`Style initialization failed — ${errorMessage(err)}`);
    }
```

**Step 2: Run tests**

```bash
npm test 2>&1 | grep -E "Tests:|FAIL|PASS"
```
Expected: all pass.

**Step 3: Commit**

```bash
git add figma-markdown-sync/renderer.ts
git commit -m "fix: annotate initializeStyles failure context in renderBlocks"
```

---

### Task 7: Add warning log to getOrCreateTextStyle lazy fallback

**Files:**
- Modify: `figma-markdown-sync/styles.ts` — `getOrCreateTextStyle` function (line ~118)

**Context:** When `existingStyles` is not passed and the cache is cold, the function silently makes an IPC call. After `initializeStyles()` runs, this should never happen for any style in `DEFAULT_STYLES`. A warning log makes unexpected cache misses visible in the developer console.

**Step 1: Add warning log to the lazy fallback**

Find:
```typescript
    const allStyles = existingStyles ?? await figma.getLocalTextStylesAsync();
```

Replace with:
```typescript
    if (!existingStyles) {
        console.warn(`[MarkDown For What] getOrCreateTextStyle("${name}") cache miss without pre-fetched styles — expected initializeStyles() to have run first`);
    }
    const allStyles = existingStyles ?? await figma.getLocalTextStylesAsync();
```

**Step 2: Run tests**

```bash
npm test 2>&1 | grep -E "Tests:|FAIL|PASS"
```
Expected: all pass. (The warning log appears in test output for tests that intentionally call `getOrCreateTextStyle` without `existingStyles` — that is expected and acceptable.)

**Step 3: Commit**

```bash
git add figma-markdown-sync/styles.ts
git commit -m "fix: log warning on unexpected cache miss in getOrCreateTextStyle"
```

---

### Task 8: Add try/catch to reset-settings handler in code.ts

**Files:**
- Modify: `figma-markdown-sync/code.ts` (lines ~44–49)

**Context:** The `save-settings` message type has a try/catch. `reset-settings` does not — inconsistent, and means a `clientStorage.setAsync` failure surfaces as a confusing generic error.

**Step 1: Wrap reset-settings in a try/catch**

Find:
```typescript
        if (msg.type === 'reset-settings') {
            await saveSettings(DEFAULT_SETTINGS);
            figma.ui.postMessage({ type: 'settings', settings: DEFAULT_SETTINGS });
            figma.ui.postMessage({ type: 'status', message: 'Settings reset to defaults.', error: false });
            return;
        }
```

Replace with:
```typescript
        if (msg.type === 'reset-settings') {
            try {
                await saveSettings(DEFAULT_SETTINGS);
                figma.ui.postMessage({ type: 'settings', settings: DEFAULT_SETTINGS });
                figma.ui.postMessage({ type: 'status', message: 'Settings reset to defaults.', error: false });
            } catch (err) {
                figma.ui.postMessage({
                    type: 'status',
                    message: `Failed to reset settings: ${errorMessage(err)}`,
                    error: true,
                });
            }
            return;
        }
```

**Step 2: Run tests**

```bash
npm test 2>&1 | grep -E "Tests:|FAIL|PASS"
```
Expected: all pass.

**Step 3: Commit**

```bash
git add figma-markdown-sync/code.ts
git commit -m "fix: add try/catch to reset-settings handler, consistent with save-settings"
```

---

### Task 9: Wrap setTextStyleIdAsync calls with error context in tables.ts

**Files:**
- Modify: `figma-markdown-sync/tables.ts` (lines ~137 and ~179)

**Context:** If `setTextStyleIdAsync` throws (stale style ID, Figma permission error), the error bubbles up to `renderer.ts`'s outer catch as a generic "Failed to render block: table" placeholder. Wrapping it with context produces a message like "Failed to apply text style to header cell 1: <reason>", which is actionable.

**Step 1: Wrap the header cell call (~line 137)**

Find:
```typescript
        const textNode = figma.createText();
        await textNode.setTextStyleIdAsync(bodyStyle.id);  // link to Markdown/Body style
        textNode.fontName = headerFont;       // override to bold after linking
```

Replace with:
```typescript
        const textNode = figma.createText();
        try {
            await textNode.setTextStyleIdAsync(bodyStyle.id);
        } catch (err) {
            throw new Error(`Failed to apply text style to header cell ${i + 1}: ${errorMessage(err)}`);
        }
        textNode.fontName = headerFont;       // override to bold after linking
```

Note: `i` is already the loop variable for the header column index.

**Step 2: Wrap the data cell call (~line 179)**

Find:
```typescript
            const textNode = figma.createText();
            await textNode.setTextStyleIdAsync(bodyStyle.id);
            textNode.layoutAlign = 'STRETCH';
```

Replace with:
```typescript
            const textNode = figma.createText();
            try {
                await textNode.setTextStyleIdAsync(bodyStyle.id);
            } catch (err) {
                throw new Error(`Failed to apply text style to row ${rowIndex + 1}, cell ${colIndex + 1}: ${errorMessage(err)}`);
            }
            textNode.layoutAlign = 'STRETCH';
```

**Step 3: Run tests**

```bash
npm test tables.test.ts 2>&1 | grep -E "Tests:|FAIL|PASS"
```
Expected: all pass.

**Step 4: Commit**

```bash
git add figma-markdown-sync/tables.ts
git commit -m "fix: add error context to setTextStyleIdAsync calls in table cells"
```

---

### Task 10: Final verification

**Step 1: Run full test suite**

```bash
npm test 2>&1 | grep -E "Tests:|FAIL|PASS"
```
Expected: `Tests: 112 passed, 112 total` (109 original + 2 paragraph/code async tests + 1 initializeStyles partial failure test)

**Step 2: Push branch and update PR**

```bash
git push
```

**Step 3: Confirm PR is up to date**

```bash
gh pr view 12 --json state,title
```
