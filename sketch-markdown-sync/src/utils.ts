/**
 * utils.ts
 *
 * Shared utility functions used across multiple modules.
 * Pure functions only — no Sketch API calls, no side effects.
 *
 * Public API:
 *   hexToSketchColor(hex)        — converts hex to Sketch-compatible hex string with alpha
 *   errorMessage(e)              — extracts a string message from any thrown value
 *   isValidHex(value)            — validates a 6-digit hex color string
 *   hasSupportedExtension(name)  — checks if filename is a supported Markdown file
 *   SUPPORTED_EXTENSIONS         — list of supported file extensions
 *   TEXT_COLOR / ERROR_TEXT_COLOR / ERROR_BORDER_COLOR / etc. — shared color constants
 */

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

/**
 * Extracts a human-readable error message from any thrown value.
 */
export function errorMessage(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

/**
 * Returns true if value is a valid 6-digit CSS hex color string (e.g. '#AABBCC').
 */
export function isValidHex(value: unknown): boolean {
    return typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value);
}

/**
 * The supported Markdown file extensions accepted by this plugin.
 */
export const SUPPORTED_EXTENSIONS = ['.md', '.markdown', '.txt'] as const;

/**
 * Returns true if the filename ends with one of the supported Markdown extensions.
 */
export function hasSupportedExtension(filename: string): boolean {
    return SUPPORTED_EXTENSIONS.some(ext => filename.toLowerCase().endsWith(ext));
}
