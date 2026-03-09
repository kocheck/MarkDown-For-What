/**
 * utils.ts
 *
 * Shared utility functions used across multiple modules.
 * Pure functions only — no Sketch API calls, no side effects.
 *
 * Public API:
 *   hexToRgb(hex)                — converts hex color string to {r,g,b} (0-1 range)
 *   hexToSketchColor(hex)        — converts hex to Sketch-compatible hex string
 *   errorMessage(e)              — extracts a string message from any thrown value
 *   isValidHex(value)            — validates a 6-digit hex color string
 *   hasSupportedExtension(name)  — checks if filename is a supported Markdown file
 *   SUPPORTED_EXTENSIONS         — list of supported file extensions
 */

/**
 * RGB type compatible with Sketch's color model (0-1 range).
 */
export interface RGB {
    r: number;
    g: number;
    b: number;
}

/**
 * Converts a 6-digit hex color string to an RGB object with values in 0–1 range.
 *
 * @example hexToRgb('#FF0000') // → { r: 1, g: 0, b: 0 }
 */
export function hexToRgb(hex: string): RGB {
    const normalized = hex.startsWith('#') ? hex.slice(1) : hex;
    if (!/^[0-9A-Fa-f]{6}$/.test(normalized)) {
        throw new Error(`Invalid hex color: ${hex}`);
    }
    return {
        r: parseInt(normalized.slice(0, 2), 16) / 255,
        g: parseInt(normalized.slice(2, 4), 16) / 255,
        b: parseInt(normalized.slice(4, 6), 16) / 255,
    };
}

/**
 * Ensures a hex color string has the '#' prefix and is properly formatted.
 * Sketch APIs accept hex strings directly in many contexts.
 */
export function hexToSketchColor(hex: string): string {
    const normalized = hex.startsWith('#') ? hex : `#${hex}`;
    if (!/^#[0-9A-Fa-f]{6}$/.test(normalized)) {
        throw new Error(`Invalid hex color: ${hex}`);
    }
    return normalized.toLowerCase() + 'ff'; // Append alpha (fully opaque)
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
