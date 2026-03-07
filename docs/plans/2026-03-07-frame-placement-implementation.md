# Frame Placement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix batch import so new frames are placed to the right of existing page content instead of stacking at (0, 0).

**Architecture:** Add a `computeNewFrameX(gap)` helper that scans `figma.currentPage.children` for the rightmost edge, then call it in `renderBlocks` *before* `figma.createFrame()` (since `createFrame` immediately adds the frame to the page). The sequential import loop in `code.ts` means each subsequent file's scan naturally sees all previously placed frames — no extra coordination needed.

**Tech Stack:** TypeScript, Figma Plugin API, Jest (existing test infrastructure in `test-setup.ts`)

---

### Task 1: `computeNewFrameX` — add helper and tests

**Files:**
- Modify: `figma-markdown-sync/renderer.ts` (around line 31, after the `BULLET` constant)
- Modify: `figma-markdown-sync/renderer.test.ts` (add new `describe` block)

**Context:** `figma.currentPage.children` is available in tests via `(figma.currentPage as any).children`, which is initialized to `[]` in `test-setup.ts`. You can push mock node objects `{ x: number, width: number }` into it to simulate existing page content.

---

**Step 1: Write the failing tests**

Add this `describe` block to `figma-markdown-sync/renderer.test.ts`, before the existing `describe('renderBlocks', ...)`:

```typescript
import { renderBlocks, computeNewFrameX } from './renderer';
```

(Update the existing import line at the top.)

Then add:

```typescript
describe('computeNewFrameX', () => {
    beforeEach(() => {
        // Reset page children before each test
        (figma.currentPage as any).children = [];
    });

    it('returns 0 when the page is empty', () => {
        expect(computeNewFrameX(100)).toBe(0);
    });

    it('returns rightEdge + gap for a single frame', () => {
        (figma.currentPage as any).children = [{ x: 200, width: 400 }];
        // right edge = 200 + 400 = 600; + gap 100 = 700
        expect(computeNewFrameX(100)).toBe(700);
    });

    it('uses the maximum right edge across multiple frames', () => {
        (figma.currentPage as any).children = [
            { x: 0,   width: 300 }, // right = 300
            { x: 100, width: 400 }, // right = 500 ← max
            { x: 50,  width: 200 }, // right = 250
        ];
        expect(computeNewFrameX(100)).toBe(600); // 500 + 100
    });

    it('respects the gap parameter', () => {
        (figma.currentPage as any).children = [{ x: 0, width: 800 }];
        expect(computeNewFrameX(50)).toBe(850);  // 800 + 50
        expect(computeNewFrameX(200)).toBe(1000); // 800 + 200
    });
});
```

**Step 2: Run the tests to verify they fail**

```bash
cd figma-markdown-sync && npm test -- --testPathPattern renderer 2>&1 | grep -E "FAIL|PASS|computeNewFrameX"
```

Expected: FAIL — `computeNewFrameX` is not exported from `./renderer`

**Step 3: Implement `computeNewFrameX`**

In `figma-markdown-sync/renderer.ts`, after the `BULLET` constant (line 29), add:

```typescript
/**
 * Returns the X coordinate at which a new frame should be placed so it does not
 * overlap existing page content. Finds the rightmost edge of all top-level page nodes
 * and adds a gap.
 *
 * IMPORTANT: Call this BEFORE figma.createFrame() — createFrame immediately appends
 * the new frame to figma.currentPage.children, which would inflate the result.
 *
 * Returns 0 if the page is empty (blank canvas case).
 *
 * @internal Exported for testability.
 */
export function computeNewFrameX(gap: number): number {
    const children = figma.currentPage.children;
    if (children.length === 0) return 0;
    const rightEdge = children.reduce((max, node) => {
        const right = node.x + node.width;
        return right > max ? right : max;
    }, 0);
    return rightEdge + gap;
}
```

**Step 4: Run the tests to verify they pass**

```bash
npm test -- --testPathPattern renderer 2>&1 | tail -8
```

Expected: all `computeNewFrameX` tests PASS

**Step 5: Commit**

```bash
git add figma-markdown-sync/renderer.ts figma-markdown-sync/renderer.test.ts
git commit -m "feat: add computeNewFrameX helper for smart frame placement"
```

---

### Task 2: Wire placement into `renderBlocks` and test

**Files:**
- Modify: `figma-markdown-sync/renderer.ts` (lines ~142–223 — the `renderBlocks` function)
- Modify: `figma-markdown-sync/renderer.test.ts` (add to existing `frame setup` describe block)

**Context:** `renderBlocks` currently has no positioning logic for the new-frame path (no `targetNode`). The fix: compute the X coordinate *before* `figma.createFrame()`, then apply it in a new `else` branch at the end of the function. The `targetNode` replacement path is unchanged.

---

**Step 1: Write the failing test**

In `figma-markdown-sync/renderer.test.ts`, inside the existing `describe('frame setup', ...)` block, add:

```typescript
it('places a new frame to the right of existing page content', async () => {
    // Simulate an existing frame on the page at x=0, width=800
    (figma.currentPage as any).children = [{ x: 0, width: 800 }];

    const result = await renderBlocks('Test', [], DEFAULT_SETTINGS);

    // New frame should be placed at 800 + 100 gap = 900
    expect(result.frame.x).toBe(900);
});

it('places a new frame at x=0 when the page is empty', async () => {
    (figma.currentPage as any).children = [];

    const result = await renderBlocks('Test', [], DEFAULT_SETTINGS);

    expect(result.frame.x).toBe(0);
});
```

**Step 2: Run the tests to verify they fail**

```bash
npm test -- --testPathPattern renderer 2>&1 | grep -E "places a new frame"
```

Expected: FAIL — `frame.x` is `0` in both cases (no placement logic yet)

**Step 3: Update `renderBlocks` to use `computeNewFrameX`**

In `figma-markdown-sync/renderer.ts`, make two changes inside `renderBlocks`:

**Change 1** — Add placement computation immediately after `await initializeStyles()` (before `figma.createFrame()`):

```typescript
    // Ensure all Markdown/* text styles exist
    await initializeStyles();

    // Compute placement before createFrame — createFrame immediately adds the frame
    // to figma.currentPage.children, which would inflate computeNewFrameX's result.
    const newFrameX = (!targetNode || !targetNode.parent) ? computeNewFrameX(100) : 0;

    // ── Create outer frame ─────────────────────────────────────────────────────
    const frame = figma.createFrame();
```

**Change 2** — Replace the placement block at the end of the function (the `if (targetNode && targetNode.parent)` block):

```typescript
    // ── Place frame ───────────────────────────────────────────────────────────
    if (targetNode && targetNode.parent) {
        // Re-import: replace existing node at the same position in the layer stack
        const parent = targetNode.parent;
        const index = parent.children.indexOf(targetNode);
        frame.x = targetNode.x;
        frame.y = targetNode.y;
        parent.insertChild(index, frame);
        targetNode.remove();
    } else {
        // New import: place to the right of existing page content (computed above)
        frame.x = newFrameX;
    }

    return { frame, imageFailures };
```

**Step 4: Run the full test suite to verify everything passes**

```bash
npm test 2>&1 | tail -8
```

Expected output:
```
Test Suites: 5 passed, 5 total
Tests:       101 passed, 0 failed
```

**Step 5: Build to confirm webpack compiles**

```bash
npm run build 2>&1 | tail -3
```

Expected: `webpack compiled successfully`

**Step 6: Commit**

```bash
git add figma-markdown-sync/renderer.ts figma-markdown-sync/renderer.test.ts
git commit -m "fix: place new frames to the right of existing page content

Batch imports of multiple files previously stacked all frames at (0,0).
computeNewFrameX scans figma.currentPage.children for the rightmost edge
and offsets by 100px. Called before figma.createFrame() to avoid including
the new frame itself in the scan."
```

---

### Task 3: Push and verify

**Step 1: Push the branch**

```bash
git push origin kyle/polish
```

**Step 2: Manual verification in Figma**

1. Load the plugin in Figma (Plugins → Development → MarkDown For What)
2. Drop **two or three** `.md` files onto the import zone
3. Click Import
4. Verify: frames appear in a left-to-right row with ~100px gaps between them, not stacked
5. Re-import the same files (so `targetNode` exists): verify each frame updates in-place at its original position

Expected: no frames overlap; re-import preserves position.
