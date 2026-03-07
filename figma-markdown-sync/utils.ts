/**
 * utils.ts
 *
 * Shared utility functions used across multiple modules.
 * Pure functions only — no Figma API calls, no side effects.
 *
 * Public API:
 *   hexToRgb(hex)   — converts hex color string to Figma RGB
 *   errorMessage(e) — extracts a string message from any thrown value
 */

/**
 * Converts a 6-digit hex color string (e.g. '#F2F2F7') to a Figma RGB object.
 *
 * @param hex - A validated 6-digit hex string, with or without leading '#'
 * @returns Figma RGB with r/g/b values in the 0–1 range
 *
 * @example
 * hexToRgb('#FF0000') // → { r: 1, g: 0, b: 0 }
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
 * Extracts a human-readable error message from any thrown value.
 * Use in catch blocks instead of the repeated `e instanceof Error ? e.message : String(e)` ternary.
 */
export function errorMessage(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

/**
 * Returns true if value is a valid 6-digit CSS hex color string (e.g. '#AABBCC').
 * Single source of truth shared across plugin and UI bundles.
 */
export function isValidHex(value: unknown): boolean {
    return typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value);
}

/**
 * The supported Markdown file extensions accepted by this plugin.
 * Referenced in both the UI (file picker filter) and plugin backend (extension stripping).
 */
export const SUPPORTED_EXTENSIONS = ['.md', '.markdown', '.txt'] as const;

/**
 * Returns true if the filename ends with one of the supported Markdown extensions.
 */
export function hasSupportedExtension(filename: string): boolean {
    return SUPPORTED_EXTENSIONS.some(ext => filename.toLowerCase().endsWith(ext));
}

// CommonJS export shim — allows Jest (require()) and webpack (import) to both work
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { hexToRgb, errorMessage, isValidHex, SUPPORTED_EXTENSIONS, hasSupportedExtension };
}
