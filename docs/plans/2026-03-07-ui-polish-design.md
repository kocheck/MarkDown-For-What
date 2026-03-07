# UI Polish — Design

**Date:** 2026-03-07
**Branch:** kyle/polish

## Goal

Refine the plugin UI from functional-but-bare to branded and opinionated — a "playful editorial" feel with a cool color-block header and subtle grain texture.

## Visual Language

### Color Palette

| Token | Value | Usage |
|---|---|---|
| Header block | `#1B3543` | Import tab upper block background |
| Accent mint | `#52C7A0` | Drop zone border, import button, section title rules, active tab |
| Accent mint hover | `#3FB38A` | Button hover state |
| Text on dark (primary) | `#FFFFFF` | Drop zone headline, wordmark |
| Text on dark (secondary) | `#C8E8DF` | Drop zone sub-label |
| White | `#FFFFFF` | Lower section, settings background |
| Body text | `#333333` | Unchanged |

### Grain Texture

SVG `feTurbulence` noise applied as a `::before` pseudo-element over the color block:
- `baseFrequency: 0.65`
- `opacity: 0.04`
- `mix-blend-mode: overlay`
- `pointer-events: none`
- Inline SVG data URI — no external assets

### Typography

- Font: Inter (unchanged — already loaded by Figma)
- Drop zone headline: `13px / 600 weight / letter-spacing: 0.01em`
- Drop zone sub-label: `11px / italic / color: #C8E8DF`
- Wordmark: `9px / 600 weight / uppercase / letter-spacing: 0.1em / color: #52C7A0`

---

## Import Tab

### Structure

```
┌─────────────────────────────────────┐
│  [tab bar — sits on top of block]   │  ← tabs are overlaid on the color block
│  ┌───────────────────────────────┐  │
│  │  MARKDOWN FOR WHAT  (mint)    │  │  ← wordmark, 9px tracked caps
│  │                               │  │
│  │  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐  │  │
│  │       ↓                       │  │  ← mint ↓ icon
│  │  │  Drop your Markdown here│  │  │  ← 13px 600 white
│  │     or click to browse        │  │  ← 11px italic muted mint
│  │  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘  │  │  ← dashed mint border
│  └───────────────────────────────┘  │
├─────────────────────────────────────┤  ← clean break to white
│  file-list (scrollable)             │  ← mint dot prefix, no emoji
│                                     │
├─────────────────────────────────────┤
│  [status]          [Import button]  │  ← mint button
└─────────────────────────────────────┘
```

### Tab Bar

- Both tabs rendered inside / above the color block area
- Active tab: `color: #FFFFFF`, `border-bottom-color: #52C7A0`
- Inactive tab: `color: rgba(255,255,255,0.5)`, no bottom border
- Tab bar background: `transparent` (color block shows through)

### Drop Zone

- Container: `16px` margin all sides from the color block edges
- Background: `rgba(255,255,255,0.05)`
- Border: `1.5px dashed rgba(82,199,160,0.5)` at rest → `rgba(82,199,160,1.0)` on hover/drag
- Border-radius: `8px`
- Padding: `28px 16px`
- Icon: `↓` character, `20px`, `color: #52C7A0`
- Headline: `"Drop your Markdown here"` — white, `13px`, `600`
- Sub-label: `"or click to browse · .md .markdown .txt"` — `#C8E8DF`, `11px`, italic

### File List

- Items: mint `6px` circle dot (`::before` with `background: #52C7A0; border-radius: 50%`) instead of 📄 emoji
- No other changes to list layout

### Import Button

- Background: `#52C7A0`
- Text: `#FFFFFF`
- Hover: `#3FB38A`
- Disabled: `#C8E8DF` (muted mint)

---

## Settings Tab

White background throughout — color block does not bleed into settings.

### Section Titles

- Add `border-left: 2px solid #52C7A0`
- Add `padding-left: 8px`
- Otherwise unchanged (10px, uppercase, tracked, `#999`)

### Color Swatches

- Shape: `24px` circle (`border-radius: 50%`)
- Border: `1px solid #E0E0E0`
- Remove padding — swatch fills the circle
- Still `<input type="color">` under the hood

### Reset Button

- Border: `1px solid #52C7A0`
- Text color: `#52C7A0`
- Background: `none`
- Hover: `background: rgba(82,199,160,0.08)`

### Active Tab Indicator (global)

- `.tab.active` → `border-bottom-color: #52C7A0` (was `#000`)
- When on Settings tab, tab bar sits on white — active tab text stays `#000`

---

## Files to Modify

- `figma-markdown-sync/ui.html` — add wordmark element, update drop zone copy
- `figma-markdown-sync/src/styles.css` — all visual changes live here

## No Changes To

- `ui.ts` — no behavioral changes
- All backend `.ts` files — pure visual update
- Plugin size (`figma.showUI` remains 400×500)
