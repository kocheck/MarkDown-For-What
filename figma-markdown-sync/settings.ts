/**
 * settings.ts
 *
 * Figma-specific settings persistence. Types, defaults, and validation
 * are shared with the Sketch plugin via ../shared/settings.ts.
 *
 * Public API:
 *   PluginSettings, DEFAULT_SETTINGS, validateSettings, mergeWithDefaults — re-exported from shared
 *   loadSettings()            — async: reads from clientStorage, merges with defaults
 *   saveSettings(settings)    — async: writes to clientStorage
 */

export {
    PluginSettings,
    DEFAULT_SETTINGS,
    validateSettings,
    mergeWithDefaults,
} from '../shared/settings';

import { PluginSettings, DEFAULT_SETTINGS, validateSettings, mergeWithDefaults } from '../shared/settings';

const STORAGE_KEY = 'pluginSettings';

/**
 * Loads settings from Figma's clientStorage and merges them with defaults.
 * Always returns a complete, valid PluginSettings object — never throws.
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
