/**
 * utils.ts
 *
 * Figma-specific utilities plus re-exports of shared utilities.
 *
 * Public API:
 *   hexToRgb(hex)                    — converts hex color string to Figma RGB (local)
 *   errorMessage, isValidHex, SUPPORTED_EXTENSIONS, hasSupportedExtension — re-exported from shared
 */

export { errorMessage, SUPPORTED_EXTENSIONS, hasSupportedExtension, stripExtension } from '../shared/utils';
export { isValidHex } from '../shared/settings';

/**
 * Converts a 6-digit hex color string (e.g. '#F2F2F7') to a Figma RGB object.
 *
 * @param hex - A validated 6-digit hex string, with or without leading '#'
 * @returns Figma RGB with r/g/b values in the 0–1 range
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
