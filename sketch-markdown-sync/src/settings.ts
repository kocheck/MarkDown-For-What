/**
 * settings.ts
 *
 * Sketch-specific settings persistence. Types, defaults, and validation
 * are shared with the Figma plugin via ../../shared/settings.ts.
 *
 * Public API:
 *   PluginSettings, DEFAULT_SETTINGS, validateSettings, mergeWithDefaults — re-exported from shared
 *   loadSettings()            — reads from Sketch settings storage
 *   saveSettings(settings)    — writes to Sketch settings storage
 */

export {
    PluginSettings,
    DEFAULT_SETTINGS,
    validateSettings,
    mergeWithDefaults,
} from '../../shared/settings';

import { PluginSettings, DEFAULT_SETTINGS, validateSettings, mergeWithDefaults } from '../../shared/settings';

const STORAGE_KEY = 'markdownForWhat.pluginSettings';

/**
 * Loads settings from Sketch's per-plugin persistent storage.
 * Sketch's Settings API is synchronous, unlike Figma's async clientStorage.
 */
export function loadSettings(): PluginSettings {
    try {
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
        const Settings = require('sketch/settings');
        Settings.setSettingForKey(STORAGE_KEY, settings);
    } catch (err) {
        console.error('[MarkDown For What] Failed to save settings:', err);
        throw err;
    }
}
