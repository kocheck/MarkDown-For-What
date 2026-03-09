/**
 * Unit tests for shared settings validation and merge logic.
 * Platform-specific load/save tests remain in each plugin's own settings.test.ts.
 */

import {
    DEFAULT_SETTINGS,
    validateSettings,
    mergeWithDefaults,
    PluginSettings,
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

    test('has sensible default values', () => {
        expect(DEFAULT_SETTINGS.blockSpacing).toBe(16);
        expect(DEFAULT_SETTINGS.listSpacing).toBe(6);
        expect(DEFAULT_SETTINGS.framePadding).toBe(40);
        expect(DEFAULT_SETTINGS.frameWidth).toBe(800);
        expect(DEFAULT_SETTINGS.codeBackground).toBe('#F2F2F2');
        expect(DEFAULT_SETTINGS.tableHeaderBackground).toBe('#F2F2F7');
        expect(DEFAULT_SETTINGS.separatorColor).toBe('#CCCCCC');
    });

    test('numeric values are non-negative', () => {
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

    test('returns false when a numeric field is not a number', () => {
        const bad = { ...DEFAULT_SETTINGS, blockSpacing: 'not-a-number' };
        expect(validateSettings(bad as any)).toBe(false);
    });

    test('returns false for negative spacing', () => {
        expect(validateSettings({ ...DEFAULT_SETTINGS, blockSpacing: -1 })).toBe(false);
    });

    test('returns false for zero frameWidth', () => {
        expect(validateSettings({ ...DEFAULT_SETTINGS, frameWidth: 0 })).toBe(false);
    });

    test('returns true when spacing fields are zero', () => {
        expect(validateSettings({ ...DEFAULT_SETTINGS, framePadding: 0 })).toBe(true);
        expect(validateSettings({ ...DEFAULT_SETTINGS, blockSpacing: 0 })).toBe(true);
        expect(validateSettings({ ...DEFAULT_SETTINGS, listSpacing: 0 })).toBe(true);
    });

    test('returns false for invalid hex color', () => {
        expect(validateSettings({ ...DEFAULT_SETTINGS, codeBackground: 'red' })).toBe(false);
    });

    test('rejects 3-digit hex (#FFF)', () => {
        expect(validateSettings({ ...DEFAULT_SETTINGS, codeBackground: '#FFF' })).toBe(false);
    });

    test('rejects 8-digit hex (#FF0000FF)', () => {
        expect(validateSettings({ ...DEFAULT_SETTINGS, codeBackground: '#FF0000FF' })).toBe(false);
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

    test('fills in missing keys from defaults', () => {
        const partial = { blockSpacing: 24 };
        const result = mergeWithDefaults(partial as any);
        expect(result.blockSpacing).toBe(24);
        expect(result.listSpacing).toBe(DEFAULT_SETTINGS.listSpacing);
        expect(result.frameWidth).toBe(DEFAULT_SETTINGS.frameWidth);
    });

    test('replaces invalid values with defaults', () => {
        const invalid = { ...DEFAULT_SETTINGS, frameWidth: -100, codeBackground: 'notahex' };
        const result = mergeWithDefaults(invalid);
        expect(result.frameWidth).toBe(DEFAULT_SETTINGS.frameWidth);
        expect(result.codeBackground).toBe(DEFAULT_SETTINGS.codeBackground);
    });

    test('preserves all valid custom values', () => {
        const custom: PluginSettings = {
            blockSpacing: 20,
            listSpacing: 8,
            framePadding: 32,
            frameWidth: 960,
            codeBackground: '#EEEEEE',
            tableHeaderBackground: '#E8F0FE',
            separatorColor: '#AAAAAA',
        };
        const result = mergeWithDefaults(custom);
        expect(result).toEqual(custom);
    });

    test('returns all keys from DEFAULT_SETTINGS shape', () => {
        const result = mergeWithDefaults({});
        const defaultKeys = Object.keys(DEFAULT_SETTINGS).sort();
        const resultKeys = Object.keys(result).sort();
        expect(resultKeys).toEqual(defaultKeys);
    });

    test('falls back to defaults for zero frameWidth', () => {
        const result = mergeWithDefaults({ ...DEFAULT_SETTINGS, frameWidth: 0 });
        expect(result.frameWidth).toBe(DEFAULT_SETTINGS.frameWidth);
    });
});
