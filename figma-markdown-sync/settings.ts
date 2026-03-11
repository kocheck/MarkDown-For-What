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

import { isValidHex } from './utils';

// ─── Types ─────────────────────────────────────────────────────────────────────

/** Width mode preset for the root content frame. */
export type WidthMode = 'narrow' | 'medium' | 'wide' | 'custom';

/** Visual theme preset. */
export type Theme = 'minimal-light' | 'dark-mode' | 'documentation' | 'custom';

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
    /** Resolved width of the root content frame in px. Kept for backwards compat. */
    frameWidth: number;
    /** Width mode preset */
    widthMode: WidthMode;
    /** Custom width in px (used when widthMode === 'custom') */
    customWidth: number;
    /** Fill color for code block backgrounds. CSS hex string. */
    codeBackground: string;
    /** Fill color for the header row of rendered tables. CSS hex string. */
    tableHeaderBackground: string;
    /** Color of horizontal separator lines. CSS hex string. */
    separatorColor: string;
    /** Whether to auto-generate a table of contents from headings */
    generateToc: boolean;
    /** Visual theme preset */
    theme: Theme;
    /** Fill color for the root content frame. CSS hex string. */
    frameFillColor: string;
    /** Mappings from block element types to existing Figma text/paint style IDs. */
    styleBindings: StyleBindings;
}

/** Maps block element types to Figma style IDs. 'auto' or absent = use default Markdown/* styles. */
export interface StyleBindings {
    h1?: string;
    h2?: string;
    h3?: string;
    body?: string;
    code?: string;
    list?: string;
    quote?: string;
    codeBg?: string;
    tableBg?: string;
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
    widthMode: 'medium',
    customWidth: 800,
    codeBackground: '#F2F2F2',
    tableHeaderBackground: '#F2F2F7',
    separatorColor: '#CCCCCC',
    generateToc: false,
    theme: 'minimal-light',
    frameFillColor: '#FFFFFF',
    styleBindings: {},
};

const STORAGE_KEY = 'pluginSettings';

// ─── Theme Presets ──────────────────────────────────────────────────────────────

/** Partial settings overrides for each built-in theme. */
export const THEME_PRESETS: Record<Exclude<Theme, 'custom'>, Partial<PluginSettings>> = {
    'minimal-light': {
        frameFillColor: '#FFFFFF',
        codeBackground: '#F2F2F2',
        tableHeaderBackground: '#F2F2F7',
        separatorColor: '#CCCCCC',
        blockSpacing: 16,
        listSpacing: 6,
        framePadding: 40,
    },
    'dark-mode': {
        frameFillColor: '#1E1E1E',
        codeBackground: '#2D2D2D',
        tableHeaderBackground: '#2D2D2D',
        separatorColor: '#404040',
        blockSpacing: 16,
        listSpacing: 6,
        framePadding: 40,
    },
    'documentation': {
        frameFillColor: '#FFFFFF',
        codeBackground: '#F6F8FA',
        tableHeaderBackground: '#F6F8FA',
        separatorColor: '#D0D7DE',
        blockSpacing: 8,
        listSpacing: 4,
        framePadding: 24,
    },
};

const VALID_THEMES: readonly string[] = ['minimal-light', 'dark-mode', 'documentation', 'custom'];

function isValidTheme(value: unknown): value is Theme {
    return typeof value === 'string' && VALID_THEMES.includes(value);
}

/**
 * Returns the settings overrides for the given theme.
 * Returns an empty object for 'custom' theme (user keeps their own settings).
 */
export function resolveThemeSettings(theme: Theme): Partial<PluginSettings> {
    if (theme === 'custom') return {};
    return { ...THEME_PRESETS[theme] };
}

// ─── Width Mode ────────────────────────────────────────────────────────────────

export const WIDTH_PRESETS: Record<WidthMode, number | null> = {
    narrow: 480,
    medium: 800,
    wide: 960,
    custom: null,
};

const VALID_WIDTH_MODES: readonly string[] = Object.keys(WIDTH_PRESETS);

function isValidWidthMode(value: unknown): value is WidthMode {
    return typeof value === 'string' && VALID_WIDTH_MODES.includes(value);
}

/**
 * Returns the effective frame width for the given settings.
 * Resolves width mode presets to pixel values.
 */
export function resolvedFrameWidth(settings: PluginSettings): number {
    return WIDTH_PRESETS[settings.widthMode] ?? settings.customWidth;
}

// ─── Validation Helpers ────────────────────────────────────────────────────────

/** Returns true if value is a finite, non-negative number (zero or greater). */
function isNonNegativeNumber(value: unknown): boolean {
    return typeof value === 'number' && isFinite(value) && value >= 0;
}

/** Returns true if value is a finite, positive number (greater than zero). */
function isPositiveNumber(value: unknown): boolean {
    return typeof value === 'number' && isFinite(value) && value > 0;
}

const VALID_BINDING_KEYS = ['h1', 'h2', 'h3', 'body', 'code', 'list', 'quote', 'codeBg', 'tableBg'];

/** Returns true if value is a valid StyleBindings object (plain object with string values). */
function isValidStyleBindings(value: unknown): boolean {
    if (value === undefined || value === null) return false;
    if (typeof value !== 'object' || Array.isArray(value)) return false;
    const obj = value as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
        if (!VALID_BINDING_KEYS.includes(key)) return false;
        if (typeof obj[key] !== 'string') return false;
    }
    return true;
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
        isNonNegativeNumber(s.blockSpacing) &&
        isNonNegativeNumber(s.listSpacing) &&
        isNonNegativeNumber(s.framePadding) &&
        isPositiveNumber(s.frameWidth) &&
        isValidWidthMode(s.widthMode) &&
        isPositiveNumber(s.customWidth) &&
        isValidHex(s.codeBackground) &&
        isValidHex(s.tableHeaderBackground) &&
        isValidHex(s.separatorColor) &&
        typeof s.generateToc === 'boolean' &&
        isValidTheme(s.theme) &&
        isValidHex(s.frameFillColor) &&
        isValidStyleBindings(s.styleBindings)
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

    // Migration: convert legacy frameWidth-only settings to widthMode + customWidth
    let widthMode: WidthMode = DEFAULT_SETTINGS.widthMode;
    let customWidth: number = DEFAULT_SETTINGS.customWidth;

    if (isValidWidthMode(p.widthMode)) {
        widthMode = p.widthMode;
        customWidth = isPositiveNumber(p.customWidth) ? (p.customWidth as number) : DEFAULT_SETTINGS.customWidth;
    } else if (isPositiveNumber(p.frameWidth)) {
        const fw = p.frameWidth as number;
        if (fw === 480) widthMode = 'narrow';
        else if (fw === 800) widthMode = 'medium';
        else if (fw === 960) widthMode = 'wide';
        else { widthMode = 'custom'; customWidth = fw; }
    }

    const merged: PluginSettings = {
        blockSpacing:          isNonNegativeNumber(p.blockSpacing)    ? (p.blockSpacing as number)          : DEFAULT_SETTINGS.blockSpacing,
        listSpacing:           isNonNegativeNumber(p.listSpacing)     ? (p.listSpacing as number)           : DEFAULT_SETTINGS.listSpacing,
        framePadding:          isNonNegativeNumber(p.framePadding)    ? (p.framePadding as number)          : DEFAULT_SETTINGS.framePadding,
        frameWidth:            800, // placeholder, resolved below
        widthMode,
        customWidth,
        codeBackground:        isValidHex(p.codeBackground)           ? (p.codeBackground as string)        : DEFAULT_SETTINGS.codeBackground,
        tableHeaderBackground: isValidHex(p.tableHeaderBackground)    ? (p.tableHeaderBackground as string) : DEFAULT_SETTINGS.tableHeaderBackground,
        separatorColor:        isValidHex(p.separatorColor)           ? (p.separatorColor as string)        : DEFAULT_SETTINGS.separatorColor,
        generateToc:           typeof p.generateToc === 'boolean'     ? p.generateToc                       : DEFAULT_SETTINGS.generateToc,
        theme:                 isValidTheme(p.theme)                  ? p.theme                              : DEFAULT_SETTINGS.theme,
        frameFillColor:        isValidHex(p.frameFillColor)           ? (p.frameFillColor as string)        : DEFAULT_SETTINGS.frameFillColor,
        styleBindings:         isValidStyleBindings(p.styleBindings)  ? (p.styleBindings as StyleBindings)  : { ...DEFAULT_SETTINGS.styleBindings },
    };
    // Keep frameWidth in sync with resolved width for backwards compat
    merged.frameWidth = resolvedFrameWidth(merged);
    return merged;
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
    } catch (err) {
        console.error('[MarkDown For What] Failed to load settings:', err);
        return { ...DEFAULT_SETTINGS };
    }
}

/**
 * Persists the given settings to Figma's clientStorage.
 *
 * @param settings - The settings object to persist
 * @throws {Error} If settings fail validation ('Invalid settings object — save aborted')
 * @throws {Error} If Figma's clientStorage.setAsync rejects (storage errors are re-thrown)
 */
export async function saveSettings(settings: PluginSettings): Promise<void> {
    if (!validateSettings(settings)) {
        throw new Error('Invalid settings object — save aborted');
    }
    try {
        await figma.clientStorage.setAsync(STORAGE_KEY, settings);
    } catch (err) {
        console.error('[MarkDown For What] Failed to save settings:', err);
        throw err;
    }
}
