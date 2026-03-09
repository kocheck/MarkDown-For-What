/**
 * utils.ts
 *
 * Shared utility functions used by both Figma and Sketch plugins.
 * Pure functions only — no platform API calls, no side effects.
 *
 * Public API:
 *   errorMessage(e)              — extracts a string message from any thrown value
 *   SUPPORTED_EXTENSIONS         — list of supported Markdown file extensions
 *   hasSupportedExtension(name)  — checks if filename is a supported Markdown file
 */

/**
 * Extracts a human-readable error message from any thrown value.
 * Use in catch blocks instead of the repeated ternary pattern.
 */
export function errorMessage(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

/**
 * The supported Markdown file extensions accepted by this plugin.
 */
export const SUPPORTED_EXTENSIONS = ['.md', '.markdown', '.txt'] as const;

/**
 * Returns true if the filename ends with one of the supported Markdown extensions.
 */
export function hasSupportedExtension(filename: string): boolean {
    const lower = filename.toLowerCase();
    return SUPPORTED_EXTENSIONS.some(ext => lower.endsWith(ext));
}

/**
 * Strips the supported Markdown extension from a filename, if present.
 */
export function stripExtension(filename: string): string {
    const lower = filename.toLowerCase();
    for (const ext of SUPPORTED_EXTENSIONS) {
        if (lower.endsWith(ext)) {
            return filename.slice(0, -ext.length);
        }
    }
    return filename;
}
