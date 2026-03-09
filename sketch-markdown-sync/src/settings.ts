/**
 * settings.ts
 *
 * Manages plugin settings — their shape, default values, validation, and
 * persistence via Sketch's Settings API.
 *
 * Sketch equivalent of Figma's clientStorage — uses sketch/settings module
 * for synchronous key-value persistence scoped to this plugin.
 *
 * Public API:
 *   DEFAULT_SETTINGS          — the baseline values used on first run
 *   validateSettings(obj)     — returns true if obj is a well-formed PluginSettings
 *   mergeWithDefaults(obj)    — fills missing/invalid fields with defaults
 *   loadSettings()            — reads from Sketch settings storage
 *   saveSettings(settings)    — writes to Sketch settings storage
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
    /** Inner padding on all sides of the root content artboard in px */
    framePadding: number;
    /** Fixed width of the root content artboard in px */
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

const STORAGE_KEY = 'markdownForWhat.pluginSettings';

// ─── Validation Helpers ────────────────────────────────────────────────────────

/** Returns true if value is a finite, non-negative number (zero or greater). */
function isNonNegativeNumber(value: unknown): boolean {
    return typeof value === 'number' && isFinite(value) && value >= 0;
}

/** Returns true if value is a finite, positive number (greater than zero). */
function isPositiveNumber(value: unknown): boolean {
    return typeof value === 'number' && isFinite(value) && value > 0;
}

/** Returns true if value is a valid 6-digit CSS hex color string. */
function isValidHex(value: unknown): boolean {
    return typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value);
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Validates that obj is a complete, well-formed PluginSettings object.
 */
export function validateSettings(obj: unknown): obj is PluginSettings {
    if (!obj || typeof obj !== 'object') return false;
    const s = obj as Record<string, unknown>;

    return (
        isNonNegativeNumber(s.blockSpacing) &&
        isNonNegativeNumber(s.listSpacing) &&
        isNonNegativeNumber(s.framePadding) &&
        isPositiveNumber(s.frameWidth) &&
        isValidHex(s.codeBackground) &&
        isValidHex(s.tableHeaderBackground) &&
        isValidHex(s.separatorColor)
    );
}

/**
 * Merges a (possibly partial or invalid) settings object with the defaults.
 */
export function mergeWithDefaults(partial: unknown): PluginSettings {
    if (!partial || typeof partial !== 'object') return { ...DEFAULT_SETTINGS };

    const p = partial as Record<string, unknown>;
    return {
        blockSpacing:          isNonNegativeNumber(p.blockSpacing)    ? (p.blockSpacing as number)          : DEFAULT_SETTINGS.blockSpacing,
        listSpacing:           isNonNegativeNumber(p.listSpacing)     ? (p.listSpacing as number)           : DEFAULT_SETTINGS.listSpacing,
        framePadding:          isNonNegativeNumber(p.framePadding)    ? (p.framePadding as number)          : DEFAULT_SETTINGS.framePadding,
        frameWidth:            isPositiveNumber(p.frameWidth)         ? (p.frameWidth as number)            : DEFAULT_SETTINGS.frameWidth,
        codeBackground:        isValidHex(p.codeBackground)           ? (p.codeBackground as string)        : DEFAULT_SETTINGS.codeBackground,
        tableHeaderBackground: isValidHex(p.tableHeaderBackground)    ? (p.tableHeaderBackground as string) : DEFAULT_SETTINGS.tableHeaderBackground,
        separatorColor:        isValidHex(p.separatorColor)           ? (p.separatorColor as string)        : DEFAULT_SETTINGS.separatorColor,
    };
}

/**
 * Loads settings from Sketch's per-plugin persistent storage.
 *
 * Sketch's Settings API is synchronous, unlike Figma's async clientStorage.
 * Uses sketch/settings module: Settings.settingForKey(key).
 */
export function loadSettings(): PluginSettings {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Settings = require('sketch/settings');
        const raw = Settings.settingForKey(STORAGE_KEY);
        return mergeWithDefaults(raw);
    } catch (err) {
        console.error('[MarkDown For What] Failed to load settings:', err);
        return { ...DEFAULT_SETTINGS };
    }
}

/**
 * Persists the given settings to Sketch's per-plugin persistent storage.
 *
 * @throws {Error} If settings fail validation
 */
export function saveSettings(settings: PluginSettings): void {
    if (!validateSettings(settings)) {
        throw new Error('Invalid settings object — save aborted');
    }
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Settings = require('sketch/settings');
        Settings.setSettingForKey(STORAGE_KEY, settings);
    } catch (err) {
        console.error('[MarkDown For What] Failed to save settings:', err);
        throw err;
    }
}
