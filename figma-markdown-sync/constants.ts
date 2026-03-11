/**
 * constants.ts
 *
 * Centralizes rendering constants used across multiple modules.
 * Keeps renderer.ts and blockRenderers.ts focused on logic, not config.
 *
 * Public API:
 *   CALLOUT_COLORS   — border/bg/text colors per callout type
 *   CALLOUT_LABELS   — display labels per callout type
 *   BULLETS          — bullet characters per nesting depth
 *   INDENT_PER_DEPTH — pixel indent per nesting level
 *   CHECKBOX_CHECKED / CHECKBOX_UNCHECKED_FILL / CHECKBOX_UNCHECKED_STROKE
 *   ERROR_BORDER_COLOR / ERROR_TEXT_COLOR — shared error placeholder colors
 */

import type { CalloutType } from './parser';
import { hexToRgb } from './utils';

// ─── Callout Constants ──────────────────────────────────────────────────────

/** All callout types currently use a single color for border, bg, and text (bg is applied at 10% opacity by the renderer). */
function calloutColor(hex: string): { border: RGB; bg: RGB; text: RGB } {
    const c = hexToRgb(hex);
    return { border: { ...c }, bg: { ...c }, text: { ...c } };
}

export const CALLOUT_COLORS: Record<CalloutType, { border: RGB; bg: RGB; text: RGB }> = {
    note:      calloutColor('#0969DA'),
    tip:       calloutColor('#1A7F37'),
    important: calloutColor('#8250DF'),
    warning:   calloutColor('#9A6700'),
    caution:   calloutColor('#CF222E'),
};

export const CALLOUT_LABELS: Record<CalloutType, string> = {
    note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution',
};

// ─── List Constants ─────────────────────────────────────────────────────────

export const BULLETS = ['• ', '◦ ', '– ', '· '] as const;
export const INDENT_PER_DEPTH = 20;

// ─── Checkbox Paints ────────────────────────────────────────────────────────

export const CHECKBOX_CHECKED: SolidPaint = { type: 'SOLID', color: { r: 0.2, g: 0.6, b: 0.2 } };
export const CHECKBOX_UNCHECKED_FILL: SolidPaint = { type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } };
export const CHECKBOX_UNCHECKED_STROKE: SolidPaint = { type: 'SOLID', color: { r: 0.7, g: 0.7, b: 0.7 } };

// ─── Error Placeholder Colors ───────────────────────────────────────────────

export const ERROR_BORDER_COLOR: RGB = { r: 0.8, g: 0.2, b: 0.2 };
export const ERROR_TEXT_COLOR: RGB = { r: 0.6, g: 0.1, b: 0.1 };

// CommonJS export shim — allows Jest (require()) and webpack (import) to both work
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        CALLOUT_COLORS,
        CALLOUT_LABELS,
        BULLETS,
        INDENT_PER_DEPTH,
        CHECKBOX_CHECKED,
        CHECKBOX_UNCHECKED_FILL,
        CHECKBOX_UNCHECKED_STROKE,
        ERROR_BORDER_COLOR,
        ERROR_TEXT_COLOR,
    };
}
