/**
 * Unit tests for settings management.
 * Tests validation, merging, and persistence via mocked sketch/settings.
 */

import {
    DEFAULT_SETTINGS,
    validateSettings,
    mergeWithDefaults,
    loadSettings,
    saveSettings,
} from './settings';

describe('DEFAULT_SETTINGS', () => {
    test('has all required keys', () => {
        expect(DEFAULT_SETTINGS).toHaveProperty('blockSpacing');
        expect(DEFAULT_SETTINGS).toHaveProperty('listSpacing');
        expect(DEFAULT_SETTINGS).toHaveProperty('framePadding');
        expect(DEFAULT_SETTINGS).toHaveProperty('frameWidth');
        expect(DEFAULT_SETTINGS).toHaveProperty('codeBackground');
        expect(DEFAULT_SETTINGS).toHaveProperty('tableHeaderBackground');
        expect(DEFAULT_SETTINGS).toHaveProperty('separatorColor');
    });

    test('numeric values are positive', () => {
        expect(DEFAULT_SETTINGS.blockSpacing).toBeGreaterThanOrEqual(0);
        expect(DEFAULT_SETTINGS.listSpacing).toBeGreaterThanOrEqual(0);
        expect(DEFAULT_SETTINGS.framePadding).toBeGreaterThanOrEqual(0);
        expect(DEFAULT_SETTINGS.frameWidth).toBeGreaterThan(0);
    });

    test('color values are valid hex', () => {
        const hexRegex = /^#[0-9A-Fa-f]{6}$/;
        expect(DEFAULT_SETTINGS.codeBackground).toMatch(hexRegex);
        expect(DEFAULT_SETTINGS.tableHeaderBackground).toMatch(hexRegex);
        expect(DEFAULT_SETTINGS.separatorColor).toMatch(hexRegex);
    });
});

describe('validateSettings', () => {
    test('returns true for valid DEFAULT_SETTINGS', () => {
        expect(validateSettings(DEFAULT_SETTINGS)).toBe(true);
    });

    test('returns true for valid custom settings', () => {
        expect(
            validateSettings({
                blockSpacing: 20,
                listSpacing: 8,
                framePadding: 30,
                frameWidth: 600,
                codeBackground: '#FFFFFF',
                tableHeaderBackground: '#000000',
                separatorColor: '#AABBCC',
            }),
        ).toBe(true);
    });

    test('returns false for null', () => {
        expect(validateSettings(null)).toBe(false);
    });

    test('returns false for undefined', () => {
        expect(validateSettings(undefined)).toBe(false);
    });

    test('returns false for non-object', () => {
        expect(validateSettings('string')).toBe(false);
        expect(validateSettings(42)).toBe(false);
    });

    test('returns false when a required key is missing', () => {
        const { blockSpacing: _blockSpacing, ...partial } = DEFAULT_SETTINGS;
        expect(validateSettings(partial)).toBe(false);
    });

    test('returns false for negative spacing', () => {
        expect(validateSettings({ ...DEFAULT_SETTINGS, blockSpacing: -1 })).toBe(false);
    });

    test('returns false for zero frameWidth', () => {
        expect(validateSettings({ ...DEFAULT_SETTINGS, frameWidth: 0 })).toBe(false);
    });

    test('returns false for invalid hex color', () => {
        expect(validateSettings({ ...DEFAULT_SETTINGS, codeBackground: 'not-a-color' })).toBe(
            false,
        );
    });

    test('returns false for NaN values', () => {
        expect(validateSettings({ ...DEFAULT_SETTINGS, blockSpacing: NaN })).toBe(false);
    });

    test('returns false for Infinity values', () => {
        expect(validateSettings({ ...DEFAULT_SETTINGS, frameWidth: Infinity })).toBe(false);
    });
});

describe('mergeWithDefaults', () => {
    test('returns defaults for null input', () => {
        expect(mergeWithDefaults(null)).toEqual(DEFAULT_SETTINGS);
    });

    test('returns defaults for undefined input', () => {
        expect(mergeWithDefaults(undefined)).toEqual(DEFAULT_SETTINGS);
    });

    test('returns defaults for non-object input', () => {
        expect(mergeWithDefaults('string')).toEqual(DEFAULT_SETTINGS);
    });

    test('preserves valid values from partial input', () => {
        const result = mergeWithDefaults({ blockSpacing: 24, frameWidth: 600 });
        expect(result.blockSpacing).toBe(24);
        expect(result.frameWidth).toBe(600);
        // Missing keys should use defaults
        expect(result.listSpacing).toBe(DEFAULT_SETTINGS.listSpacing);
        expect(result.framePadding).toBe(DEFAULT_SETTINGS.framePadding);
    });

    test('falls back to defaults for invalid values', () => {
        const result = mergeWithDefaults({
            blockSpacing: -1,
            frameWidth: 0,
            codeBackground: 'invalid',
        });
        expect(result.blockSpacing).toBe(DEFAULT_SETTINGS.blockSpacing);
        expect(result.frameWidth).toBe(DEFAULT_SETTINGS.frameWidth);
        expect(result.codeBackground).toBe(DEFAULT_SETTINGS.codeBackground);
    });

    test('returns all keys from DEFAULT_SETTINGS shape', () => {
        const result = mergeWithDefaults({});
        const defaultKeys = Object.keys(DEFAULT_SETTINGS).sort();
        const resultKeys = Object.keys(result).sort();
        expect(resultKeys).toEqual(defaultKeys);
    });
});

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
