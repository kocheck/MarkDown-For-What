/**
 * utils.ts
 *
 * Sketch-specific utilities plus re-exports of shared utilities.
 *
 * Public API:
 *   hexToSketchColor(hex)     — converts hex to Sketch-compatible hex+alpha string (local)
 *   Color constants           — shared color values in Sketch hex+alpha format (local)
 *   errorMessage, isValidHex, SUPPORTED_EXTENSIONS, hasSupportedExtension — re-exported from shared
 */

export { errorMessage, SUPPORTED_EXTENSIONS, hasSupportedExtension, stripExtension } from '../../shared/utils';
export { isValidHex } from '../../shared/settings';

// ─── Color Constants ────────────────────────────────────────────────────────────

/** Standard black text color (Sketch hex+alpha format). */
export const TEXT_COLOR = '#000000ff';
/** Error text color (dark red). */
export const ERROR_TEXT_COLOR = '#993333ff';
/** Error border color (medium red). */
export const ERROR_BORDER_COLOR = '#cc3333ff';
/** Error background color (light red tint). */
export const ERROR_BG_COLOR = '#ffe6e6ff';
/** Image placeholder background color (light gray). */
export const PLACEHOLDER_BG_COLOR = '#f2f2f2ff';
/** White with full alpha. */
export const WHITE_COLOR = '#ffffffff';
/** Table outer border / header column separator color. */
export const TABLE_BORDER_COLOR = '#ccccccff';
/** Table data row border color (lighter). */
export const TABLE_ROW_BORDER_COLOR = '#e6e6e6ff';

// ─── Color Conversion ────────────────────────────────────────────────────────────

/**
 * Ensures a hex color string has the '#' prefix and appends 'ff' alpha.
 * Sketch APIs accept hex strings in '#rrggbbaa' format.
 */
export function hexToSketchColor(hex: string): string {
    const normalized = hex.startsWith('#') ? hex : `#${hex}`;
    if (!/^#[0-9A-Fa-f]{6}$/.test(normalized)) {
        throw new Error(`Invalid hex color: ${hex}`);
    }
    return normalized.toLowerCase() + 'ff';
}
