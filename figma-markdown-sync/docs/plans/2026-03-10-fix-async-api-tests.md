# Fix Async API Tests Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 22 broken tests caused by migrating from sync Figma API (`textStyleId =`, `getLocalTextStyles`) to async (`setTextStyleIdAsync`, `getLocalTextStylesAsync`), then add regression tests for the specific behaviors introduced.

**Architecture:** The Figma mock in `test-setup.ts` is the single source of truth for the global `figma` object. Per-test `beforeEach` blocks in `styles.test.ts` and `tables.test.ts` also mock individual Figma methods and need updating. After mocks are fixed, new tests are added inline in existing files next to related behaviors.

**Tech Stack:** Jest 30, ts-jest, TypeScript 5

---

### Task 1: Add `getLocalTextStylesAsync` and `setTextStyleIdAsync` to the global Figma mock

**Files:**
- Modify: `test-setup.ts`

**Step 1: Add the two missing methods to the global figma mock**

In `test-setup.ts`, find the `(global as any).figma = { ... }` block (line 95). Add two entries:

```typescript
getLocalTextStylesAsync: jest.fn().mockResolvedValue([]),
```

And in `makeMockText()` (line 54), add:

```typescript
setTextStyleIdAsync: jest.fn().mockResolvedValue(undefined),
```

Full updated `makeMockText`:
```typescript
function makeMockText(): any {
    return {
        name: '',
        characters: '',
        textStyleId: '',
        fontName: { family: 'Inter', style: 'Regular' },
        fontSize: 16,
        fills: [],
        layoutAlign: 'MIN',
        layoutGrow: 0,
        textAlignHorizontal: 'LEFT',
        type: 'TEXT',
        parent: null,
        setRangeFontName: jest.fn(),
        setTextStyleIdAsync: jest.fn().mockResolvedValue(undefined),
        insertCharacters: jest.fn(),
        remove: jest.fn(),
    };
}
```

Full updated global figma mock (add after `getLocalTextStyles` line ~118):
```typescript
getLocalTextStyles: jest.fn(() => []),
getLocalTextStylesAsync: jest.fn().mockResolvedValue([]),
```

**Step 2: Run tests to see progress**

```bash
npm test 2>&1 | grep -E "Tests:|FAIL|PASS"
```

Expected: fewer failures (renderer.test.ts should pass now, styles and tables still failing)

---

### Task 2: Fix `styles.test.ts` — update all sync mock calls to async

**Files:**
- Modify: `styles.test.ts`

**Context:** Every `beforeEach` in `styles.test.ts` calls `(figma.getLocalTextStyles as jest.Mock).mockReturnValue(...)`. These need to become `(figma.getLocalTextStylesAsync as jest.Mock).mockResolvedValue(...)`. The cache behavior test also asserts `getLocalTextStyles` was not called — update that assertion too.

**Step 1: Replace all 4 occurrences of the sync mock**

Find every instance of:
```typescript
(figma.getLocalTextStyles as jest.Mock).mockReturnValue([existingStyle]);
```
or
```typescript
(figma.getLocalTextStyles as jest.Mock).mockReturnValue([]);
```

Replace with the async equivalent:
```typescript
(figma.getLocalTextStylesAsync as jest.Mock).mockResolvedValue([existingStyle]);
```
or
```typescript
(figma.getLocalTextStylesAsync as jest.Mock).mockResolvedValue([]);
```

Specific locations:
- `getOrCreateTextStyle > returns existing style without modifying it` (line ~21): change `mockReturnValue([existingStyle])` → `mockResolvedValue([existingStyle])`
- `getOrCreateTextStyle > creates a new style when none exists` (line ~35): change `mockReturnValue([])` → `mockResolvedValue([])`
- `getOrCreateTextStyle - cache behavior` (line ~87): change `mockReturnValue([])` → `mockResolvedValue([])`
- `initializeStyles` (line ~107): change `mockReturnValue([])` → `mockResolvedValue([])`
- `applyInlineStyles` beforeEach (line ~132): change `mockReturnValue([])` → `mockResolvedValue([])`

**Step 2: Fix the cache assertion**

In the `getOrCreateTextStyle - cache behavior` test (line ~96), change:
```typescript
expect(figma.getLocalTextStyles).not.toHaveBeenCalled();
```
to:
```typescript
expect(figma.getLocalTextStylesAsync).not.toHaveBeenCalled();
```

**Step 3: Run styles tests**

```bash
npm test styles.test.ts 2>&1 | grep -E "Tests:|✓|✗|●"
```

Expected: all styles tests pass

---

### Task 3: Fix `tables.test.ts` — update sync mock calls to async

**Files:**
- Modify: `tables.test.ts`

**Context:** The `createTableFrame > happy path` `beforeEach` mocks `getLocalTextStyles`. Same fix as Task 2.

**Step 1: Replace the sync mock**

In the `beforeEach` of `createTableFrame > happy path` (line ~19), change:
```typescript
(figma.getLocalTextStyles as jest.Mock).mockReturnValue([]);
```
to:
```typescript
(figma.getLocalTextStylesAsync as jest.Mock).mockResolvedValue([]);
```

**Step 2: Run tables tests**

```bash
npm test tables.test.ts 2>&1 | grep -E "Tests:|✓|✗|●"
```

Expected: all tables tests pass

**Step 3: Run full suite**

```bash
npm test 2>&1 | grep -E "Tests:|FAIL|PASS"
```

Expected: `Tests: 0 failed, 104 passed, 104 total`

**Step 4: Commit**

```bash
git add figma-markdown-sync/test-setup.ts figma-markdown-sync/styles.test.ts figma-markdown-sync/tables.test.ts
git commit -m "fix: update test mocks for async Figma API migration"
```

---

### Task 4: Add regression test — `getLocalTextStylesAsync` called once during `initializeStyles`

**Files:**
- Modify: `styles.test.ts` — add inside the existing `describe('initializeStyles', ...)` block

**Goal:** Guard against the N-concurrent-IPC-calls bug we fixed. If someone removes the `existingStyles` parameter optimization from `initializeStyles`, this test catches it.

**Step 1: Add the test**

Inside `describe('initializeStyles', () => { ... })` in `styles.test.ts`, add after the existing test:

```typescript
it('calls getLocalTextStylesAsync exactly once regardless of style count', async () => {
    const mockStyle: any = { id: 'style-id', name: '', fontName: {}, fontSize: 0, lineHeight: {} };
    (figma.getLocalTextStylesAsync as jest.Mock).mockResolvedValue([]);
    (figma.createTextStyle as jest.Mock).mockReturnValue(mockStyle);
    (figma.loadFontAsync as jest.Mock).mockResolvedValue(undefined);

    await initializeStyles();

    // Must be exactly 1 call — not one per style (which would be N calls for N styles)
    expect(figma.getLocalTextStylesAsync).toHaveBeenCalledTimes(1);
    expect(Object.keys(DEFAULT_STYLES).length).toBeGreaterThan(1); // confirm there are multiple styles
});
```

**Step 2: Run to verify it passes**

```bash
npm test styles.test.ts 2>&1 | grep -E "✓|✗|●|getLocalTextStylesAsync"
```

Expected: new test passes

---

### Task 5: Add regression test — `getOrCreateTextStyle` skips IPC when `existingStyles` is provided

**Files:**
- Modify: `styles.test.ts` — add inside the existing `describe('getOrCreateTextStyle - cache behavior', ...)` block (or as a new describe if it reads more clearly)

**Goal:** Verify the `existingStyles` parameter optimization works — when a pre-fetched list is passed in, `getLocalTextStylesAsync` should not be called.

**Step 1: Add the test**

After the cache behavior tests in `styles.test.ts`, inside `describe('getOrCreateTextStyle - cache behavior', ...)`:

```typescript
it('does not call getLocalTextStylesAsync when existingStyles is provided', async () => {
    const mockStyle: any = { id: 'style-id', name: '', fontName: {}, fontSize: 0, lineHeight: {} };
    (figma.createTextStyle as jest.Mock).mockReturnValue(mockStyle);
    (figma.loadFontAsync as jest.Mock).mockResolvedValue(undefined);

    // Pass existingStyles directly — no IPC call should happen
    await getOrCreateTextStyle(STYLE_NAMES.BODY, DEFAULT_STYLES[STYLE_NAMES.BODY], []);

    expect(figma.getLocalTextStylesAsync).not.toHaveBeenCalled();
});
```

**Step 2: Run to verify it passes**

```bash
npm test styles.test.ts 2>&1 | grep -E "✓|✗|●"
```

Expected: new test passes

---

### Task 6: Add regression test — `setTextStyleIdAsync` is called (not sync assignment) in renderer

**Files:**
- Modify: `renderer.test.ts` — add inside `describe('renderBlocks', ...)` as a new `describe('async API usage', ...)`

**Goal:** If someone reverts `setTextStyleIdAsync` back to `node.textStyleId =`, this test catches it immediately.

**Step 1: Add the test**

At the end of `renderer.test.ts`, inside `describe('renderBlocks', ...)`:

```typescript
describe('async API usage', () => {
    it('calls setTextStyleIdAsync on text nodes (not sync textStyleId setter)', async () => {
        const blocks: Block[] = [
            { type: 'paragraph', content: 'Hello', tokens: [] },
        ];

        await renderBlocks('Test', blocks, DEFAULT_SETTINGS);

        // At least one text node must have had setTextStyleIdAsync called on it
        const allTextNodes = (figma.createText as jest.Mock).mock.results.map(r => r.value);
        const asyncCallCount = allTextNodes.reduce(
            (sum: number, node: any) => sum + (node.setTextStyleIdAsync as jest.Mock).mock.calls.length,
            0
        );
        expect(asyncCallCount).toBeGreaterThan(0);
    });

    it('calls setTextStyleIdAsync for list blocks', async () => {
        const blocks: Block[] = [
            { type: 'list', content: 'Item 1', tokens: [] },
            { type: 'list', content: 'Item 2', tokens: [] },
        ];

        await renderBlocks('Test', blocks, DEFAULT_SETTINGS);

        const allTextNodes = (figma.createText as jest.Mock).mock.results.map(r => r.value);
        const asyncCallCount = allTextNodes.reduce(
            (sum: number, node: any) => sum + (node.setTextStyleIdAsync as jest.Mock).mock.calls.length,
            0
        );
        // One call per list item
        expect(asyncCallCount).toBe(2);
    });
});
```

**Step 2: Run to verify both new tests pass**

```bash
npm test renderer.test.ts 2>&1 | grep -E "✓|✗|●|async API"
```

Expected: both new tests pass

---

### Task 7: Add regression test — `setTextStyleIdAsync` called in table cells

**Files:**
- Modify: `tables.test.ts` — add inside `describe('createTableFrame', ...)` as a new describe block

**Step 1: Add the test**

Inside `describe('createTableFrame', ...)` after the existing `happy path` and `guard clauses` describes:

```typescript
describe('async API usage', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (figma.loadFontAsync as jest.Mock).mockResolvedValue(undefined);
        const mockStyle: any = { id: 'style-id', name: '', fontName: {}, fontSize: 0, lineHeight: {} };
        (figma.getLocalTextStylesAsync as jest.Mock).mockResolvedValue([]);
        (figma.createTextStyle as jest.Mock).mockReturnValue(mockStyle);
    });

    it('calls setTextStyleIdAsync on every table cell text node', async () => {
        const block: Block = {
            type: 'table',
            header: [{ text: 'A', tokens: [] }, { text: 'B', tokens: [] }],
            align: [null, null],
            rows: [[{ text: '1', tokens: [] }, { text: '2', tokens: [] }]],
        };

        await createTableFrame(block, DEFAULT_SETTINGS);

        // 2 header cells + 2 data cells = 4 text nodes, each must use setTextStyleIdAsync
        const allTextNodes = (figma.createText as jest.Mock).mock.results.map(r => r.value);
        const asyncCallCount = allTextNodes.reduce(
            (sum: number, node: any) => sum + (node.setTextStyleIdAsync as jest.Mock).mock.calls.length,
            0
        );
        expect(asyncCallCount).toBe(4);
    });
});
```

**Step 2: Run tables tests**

```bash
npm test tables.test.ts 2>&1 | grep -E "✓|✗|●"
```

Expected: new test passes

---

### Task 8: Final verification and commit

**Step 1: Run full suite**

```bash
npm test 2>&1 | grep -E "Tests:|FAIL|PASS"
```

Expected: `Tests: 0 failed, 111 passed, 111 total` (104 existing + 7 new)

**Step 2: Commit**

```bash
git add figma-markdown-sync/styles.test.ts figma-markdown-sync/renderer.test.ts figma-markdown-sync/tables.test.ts
git commit -m "test: add regression tests for async Figma API migration"
```
