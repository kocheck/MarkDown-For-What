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

// ─── Badge Constants ─────────────────────────────────────────────────────────

/** Named color palette for badge pills */
export const BADGE_NAMED_COLORS: Record<string, string> = {
    red: '#CF222E',
    orange: '#BC4C00',
    yellow: '#9A6700',
    green: '#1A7F37',
    blue: '#0969DA',
    purple: '#8250DF',
    gray: '#656D76',
};

/** Curated default palette for deterministic hash-based badge coloring */
export const BADGE_DEFAULT_PALETTE = [
    '#0969DA', '#1A7F37', '#8250DF', '#CF222E',
    '#BC4C00', '#9A6700', '#656D76', '#0550AE',
] as const;

/**
 * Simple deterministic hash function for badge label → palette index.
 * Returns a consistent color for the same label text.
 */
export function badgeColorForLabel(label: string): string {
    let hash = 0;
    for (let i = 0; i < label.length; i++) {
        hash = ((hash << 5) - hash + label.charCodeAt(i)) | 0;
    }
    return BADGE_DEFAULT_PALETTE[Math.abs(hash) % BADGE_DEFAULT_PALETTE.length];
}

// ─── Mermaid Placeholder Colors ──────────────────────────────────────────────

export const MERMAID_BG: RGB = { r: 0.96, g: 0.97, b: 1 };
export const MERMAID_BORDER: RGB = { r: 0.6, g: 0.7, b: 0.9 };
export const MERMAID_TEXT: RGB = { r: 0.3, g: 0.4, b: 0.6 };

// ─── Math Block Colors ──────────────────────────────────────────────────────

export const MATH_BG: RGB = { r: 1, g: 0.98, b: 0.95 };
export const MATH_BORDER: RGB = { r: 0.85, g: 0.75, b: 0.55 };

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
        BADGE_NAMED_COLORS,
        BADGE_DEFAULT_PALETTE,
        badgeColorForLabel,
        MERMAID_BG,
        MERMAID_BORDER,
        MERMAID_TEXT,
        MATH_BG,
        MATH_BORDER,
        ERROR_BORDER_COLOR,
        ERROR_TEXT_COLOR,
    };
}
