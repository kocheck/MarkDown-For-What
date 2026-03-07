/**
 * Unit tests for settings.ts
 * Tests default values, validation, and mergeWithDefaults behavior.
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
});

describe('validateSettings', () => {
    test('returns true for valid settings', () => {
        expect(validateSettings(DEFAULT_SETTINGS)).toBe(true);
    });

    test('returns false when a numeric field is not a number', () => {
        const bad = { ...DEFAULT_SETTINGS, blockSpacing: 'not-a-number' };
        expect(validateSettings(bad as any)).toBe(false);
    });

    test('returns false when a numeric field is negative', () => {
        const bad = { ...DEFAULT_SETTINGS, frameWidth: -1 };
        expect(validateSettings(bad)).toBe(false);
    });

    test('returns false when a color field is not a valid hex string', () => {
        const bad = { ...DEFAULT_SETTINGS, codeBackground: 'red' };
        expect(validateSettings(bad)).toBe(false);
    });

    test('returns false when settings object is null', () => {
        expect(validateSettings(null as any)).toBe(false);
    });

    test('returns false when a required key is missing', () => {
        const { blockSpacing, ...partial } = DEFAULT_SETTINGS;
        expect(validateSettings(partial as any)).toBe(false);
    });
});

describe('mergeWithDefaults', () => {
    test('returns defaults when given null', () => {
        const result = mergeWithDefaults(null);
        expect(result).toEqual(DEFAULT_SETTINGS);
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
});
