# Frame Placement — Design

**Date:** 2026-03-07
**Branch:** kyle/polish

## Problem

When importing multiple Markdown files, all generated frames land at `(0, 0)` because `figma.createFrame()` always places a new frame at the origin and `renderBlocks` only repositions a frame when it is replacing an existing `targetNode`. New frames have no positioning logic, so a batch import produces a stack of overlapping frames.

## Goal

New frames (no `targetNode`) are placed to the right of all existing page content, with a 100px gap. A batch import of N files produces a clean left-to-right row.

## Design

### Change scope

One function added, one function modified — both in `renderer.ts`. No other files change.

### `computeNewFrameX(gap: number): number` — new private helper

Scans `figma.currentPage.children` and returns the X coordinate at which a new frame should be placed:

```
if page is empty → return 0
return max(node.x + node.width for every top-level node) + gap
```

Must be called **before** `figma.createFrame()` because `createFrame` immediately appends the new frame to the page — scanning after would include the frame being placed, inflating the result.

### `renderBlocks` modification

At the top of the function, before `figma.createFrame()`:

```typescript
const newFrameX = (!targetNode || !targetNode.parent)
    ? computeNewFrameX(100)
    : 0; // unused when replacing a targetNode
```

In the placement block at the end (currently only handles the `targetNode` branch):

```typescript
if (targetNode && targetNode.parent) {
    // existing replace-in-place logic — unchanged
} else {
    frame.x = newFrameX;
    // frame.y stays 0 — align to top of canvas
}
```

### Batch ordering

The import loop in `code.ts` is sequential (`for...of`, no concurrency). Each `renderBlocks` call completes and the frame is on the page before the next call starts. Frame 2's scan sees Frame 1, Frame 3 sees Frames 1 and 2, producing a natural left-to-right row with no extra coordination.

### Y position

Always `0`. Frames align to the top edge of the canvas regardless of where existing content sits vertically.

### Gap

Fixed at `100px`. No new setting — YAGNI.

## Files Changed

- `figma-markdown-sync/renderer.ts` — add `computeNewFrameX`, update `renderBlocks`

## Not Changed

- `code.ts` — batch loop unchanged
- `settings.ts` / `ui.ts` / `ui.html` — no new setting, no UI change
- All test infrastructure — new unit tests added for `computeNewFrameX`
