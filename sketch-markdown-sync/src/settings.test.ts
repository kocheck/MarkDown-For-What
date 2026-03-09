/**
 * Unit tests for Sketch-specific settings persistence.
 * Shared validation/merge tests are in ../../shared/settings.test.ts.
 */

import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings';

describe('loadSettings', () => {
    test('returns defaults when no stored settings exist', () => {
        const result = loadSettings();
        expect(result).toEqual(DEFAULT_SETTINGS);
    });

    test('merges stored partial settings with defaults', () => {
        const Settings = require('sketch/settings');
        Settings.settingForKey.mockReturnValueOnce({ blockSpacing: 24 });

        const result = loadSettings();
        expect(result.blockSpacing).toBe(24);
        expect(result.frameWidth).toBe(DEFAULT_SETTINGS.frameWidth);
    });

    test('returns defaults when storage throws', () => {
        const Settings = require('sketch/settings');
        Settings.settingForKey.mockImplementationOnce(() => {
            throw new Error('Storage error');
        });

        const result = loadSettings();
        expect(result).toEqual(DEFAULT_SETTINGS);
    });
});

describe('saveSettings', () => {
    test('saves valid settings successfully', () => {
        const Settings = require('sketch/settings');
        saveSettings(DEFAULT_SETTINGS);
        expect(Settings.setSettingForKey).toHaveBeenCalled();
    });

    test('throws on invalid settings', () => {
        expect(() => saveSettings({ blockSpacing: -1 } as any)).toThrow(
            'Invalid settings object',
        );
    });

    test('rethrows storage errors', () => {
        const Settings = require('sketch/settings');
        Settings.setSettingForKey.mockImplementationOnce(() => {
            throw new Error('Disk full');
        });

        expect(() => saveSettings(DEFAULT_SETTINGS)).toThrow('Disk full');
    });
});
