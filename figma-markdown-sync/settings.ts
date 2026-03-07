/**
 * settings.ts
 *
 * Manages plugin settings — their shape, default values, validation, and
 * persistence via Figma's clientStorage API.
 *
 * This module does NOT render anything. It only defines and manages data.
 *
 * Public API:
 *   DEFAULT_SETTINGS          — the baseline values used on first run
 *   validateSettings(obj)     — returns true if obj is a well-formed PluginSettings
 *   mergeWithDefaults(obj)    — fills missing/invalid fields with defaults
 *   loadSettings()            — async: reads from clientStorage, merges with defaults
 *   saveSettings(settings)    — async: writes to clientStorage
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

/**
 * All configurable plugin settings.
 * Numeric values are in pixels. Color values are CSS hex strings (e.g. '#F2F2F2').
 */
export interface PluginSettings {
    /** Vertical spacing between content blocks (heading, paragraph, etc.) in px */
    blockSpacing: number;
    /** Vertical spacing between consecutive list items in px (tighter than blockSpacing) */
    listSpacing: number;
    /** Inner padding on all sides of the root content frame in px */
    framePadding: number;
    /** Fixed width of the root content frame in px */
    frameWidth: number;
    /** Fill color for code block backgrounds. CSS hex string. */
    codeBackground: string;
    /** Fill color for the header row of rendered tables. CSS hex string. */
    tableHeaderBackground: string;
    /** Color of horizontal separator lines. CSS hex string. */
    separatorColor: string;
}

// ─── Defaults ──────────────────────────────────────────────────────────────────

/**
 * The baseline settings applied on first run or when stored values are missing/invalid.
 */
export const DEFAULT_SETTINGS: PluginSettings = {
    blockSpacing: 16,
    listSpacing: 6,
    framePadding: 40,
    frameWidth: 800,
    codeBackground: '#F2F2F2',
    tableHeaderBackground: '#F2F2F7',
    separatorColor: '#CCCCCC',
};

const STORAGE_KEY = 'pluginSettings';

// ─── Validation Helpers ────────────────────────────────────────────────────────

/** Returns true if value is a finite, positive number (greater than zero). */
function isValidNumber(value: unknown): boolean {
    return typeof value === 'number' && isFinite(value) && value > 0;
}

/** Returns true if value is a valid 6-digit CSS hex color string (e.g. '#AABBCC'). */
function isValidHex(value: unknown): boolean {
    return typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value);
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Validates that obj is a complete, well-formed PluginSettings object.
 * Returns false if any field is missing, the wrong type, or out of range.
 *
 * @param obj - The object to validate (typically loaded from clientStorage)
 * @returns true if all fields are present and valid
 */
export function validateSettings(obj: unknown): obj is PluginSettings {
    if (!obj || typeof obj !== 'object') return false;
    const s = obj as Record<string, unknown>;

    return (
        isValidNumber(s.blockSpacing) &&
        isValidNumber(s.listSpacing) &&
        isValidNumber(s.framePadding) &&
        isValidNumber(s.frameWidth) &&
        isValidHex(s.codeBackground) &&
        isValidHex(s.tableHeaderBackground) &&
        isValidHex(s.separatorColor)
    );
}

/**
 * Merges a (possibly partial or invalid) settings object with the defaults.
 * Individual fields that are missing or invalid are replaced with their default value.
 * Valid custom values are preserved as-is.
 *
 * Use this after loading from clientStorage to get a guaranteed-valid settings object.
 *
 * @param partial - Raw object from storage (may be null, partial, or have invalid fields)
 * @returns A complete, valid PluginSettings object
 *
 * @example
 * const raw = await figma.clientStorage.getAsync('pluginSettings');
 * const settings = mergeWithDefaults(raw);
 */
export function mergeWithDefaults(partial: unknown): PluginSettings {
    if (!partial || typeof partial !== 'object') return { ...DEFAULT_SETTINGS };

    const p = partial as Record<string, unknown>;
    return {
        blockSpacing:          isValidNumber(p.blockSpacing)          ? (p.blockSpacing as number)          : DEFAULT_SETTINGS.blockSpacing,
        listSpacing:           isValidNumber(p.listSpacing)           ? (p.listSpacing as number)           : DEFAULT_SETTINGS.listSpacing,
        framePadding:          isValidNumber(p.framePadding)          ? (p.framePadding as number)          : DEFAULT_SETTINGS.framePadding,
        frameWidth:            isValidNumber(p.frameWidth)            ? (p.frameWidth as number)            : DEFAULT_SETTINGS.frameWidth,
        codeBackground:        isValidHex(p.codeBackground)           ? (p.codeBackground as string)        : DEFAULT_SETTINGS.codeBackground,
        tableHeaderBackground: isValidHex(p.tableHeaderBackground)    ? (p.tableHeaderBackground as string) : DEFAULT_SETTINGS.tableHeaderBackground,
        separatorColor:        isValidHex(p.separatorColor)           ? (p.separatorColor as string)        : DEFAULT_SETTINGS.separatorColor,
    };
}

/**
 * Loads settings from Figma's clientStorage and merges them with defaults.
 * Always returns a complete, valid PluginSettings object — never throws.
 *
 * @returns Promise resolving to the current plugin settings
 */
export async function loadSettings(): Promise<PluginSettings> {
    try {
        const raw = await figma.clientStorage.getAsync(STORAGE_KEY);
        return mergeWithDefaults(raw);
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

/**
 * Persists the given settings to Figma's clientStorage.
 * Silently skips saving if the settings object fails validation.
 *
 * @param settings - The settings object to persist
 */
export async function saveSettings(settings: PluginSettings): Promise<void> {
    if (!validateSettings(settings)) return;
    await figma.clientStorage.setAsync(STORAGE_KEY, settings);
}
