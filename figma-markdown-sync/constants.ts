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
 */

import type { CalloutType } from './parser';
import { hexToRgb } from './utils';

// ─── Callout Constants ──────────────────────────────────────────────────────

function calloutColor(hex: string): { border: RGB; bg: RGB; text: RGB } {
    const c = hexToRgb(hex);
    return { border: c, bg: c, text: c };
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
    };
}
