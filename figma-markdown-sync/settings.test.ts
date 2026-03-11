/**
 * Unit tests for settings.ts
 * Tests default values, validation, and mergeWithDefaults behavior.
 */

import {
    DEFAULT_SETTINGS,
    validateSettings,
    mergeWithDefaults,
    resolvedFrameWidth,
    loadSettings,
    saveSettings,
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

    test('returns false when frameWidth is zero', () => {
        expect(validateSettings({ ...DEFAULT_SETTINGS, frameWidth: 0 })).toBe(false);
    });

    test('returns true when spacing fields are zero (zero is valid for spacing)', () => {
        expect(validateSettings({ ...DEFAULT_SETTINGS, framePadding: 0 })).toBe(true);
        expect(validateSettings({ ...DEFAULT_SETTINGS, blockSpacing: 0 })).toBe(true);
        expect(validateSettings({ ...DEFAULT_SETTINGS, listSpacing: 0 })).toBe(true);
    });

    it('rejects 3-digit hex (#FFF)', () => {
        expect(validateSettings({ ...DEFAULT_SETTINGS, codeBackground: '#FFF' })).toBe(false);
    });

    it('rejects 8-digit hex (#FF0000FF)', () => {
        expect(validateSettings({ ...DEFAULT_SETTINGS, codeBackground: '#FF0000FF' })).toBe(false);
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
            widthMode: 'wide',
            customWidth: 960,
            codeBackground: '#EEEEEE',
            tableHeaderBackground: '#E8F0FE',
            separatorColor: '#AAAAAA',
            generateToc: false,
        };
        const result = mergeWithDefaults(custom);
        expect(result).toEqual(custom);
    });
});

describe('loadSettings', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('returns DEFAULT_SETTINGS when storage is empty (undefined)', async () => {
        (figma.clientStorage.getAsync as jest.Mock).mockResolvedValue(undefined);
        const result = await loadSettings();
        expect(result).toEqual(DEFAULT_SETTINGS);
    });

    test('returns merged settings when storage has valid partial data', async () => {
        (figma.clientStorage.getAsync as jest.Mock).mockResolvedValue({ widthMode: 'wide', customWidth: 960 });
        const result = await loadSettings();
        expect(result.frameWidth).toBe(960);
        expect(result.widthMode).toBe('wide');
        expect(result.blockSpacing).toBe(DEFAULT_SETTINGS.blockSpacing);
    });

    test('returns DEFAULT_SETTINGS when storage throws', async () => {
        (figma.clientStorage.getAsync as jest.Mock).mockRejectedValue(new Error('storage error'));
        const result = await loadSettings();
        expect(result).toEqual(DEFAULT_SETTINGS);
    });
});

describe('saveSettings', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('calls clientStorage.setAsync with valid settings', async () => {
        await saveSettings(DEFAULT_SETTINGS);
        expect(figma.clientStorage.setAsync).toHaveBeenCalledWith('pluginSettings', DEFAULT_SETTINGS);
    });

    test('throws and does NOT call clientStorage.setAsync when settings are invalid', async () => {
        const invalid = { ...DEFAULT_SETTINGS, frameWidth: 0 };
        await expect(saveSettings(invalid as PluginSettings)).rejects.toThrow('Invalid settings object — save aborted');
        expect(figma.clientStorage.setAsync).not.toHaveBeenCalled();
    });

    test('throws when clientStorage.setAsync rejects', async () => {
        (figma.clientStorage.setAsync as jest.Mock).mockRejectedValue(new Error('storage full'));
        await expect(saveSettings(DEFAULT_SETTINGS)).rejects.toThrow('storage full');
    });
});

describe('width mode settings', () => {
    test('has default widthMode of medium', () => {
        expect(DEFAULT_SETTINGS.widthMode).toBe('medium');
    });

    test('has default customWidth of 800', () => {
        expect(DEFAULT_SETTINGS.customWidth).toBe(800);
    });

    test('validates widthMode enum values', () => {
        expect(validateSettings({ ...DEFAULT_SETTINGS, widthMode: 'narrow' })).toBe(true);
        expect(validateSettings({ ...DEFAULT_SETTINGS, widthMode: 'medium' })).toBe(true);
        expect(validateSettings({ ...DEFAULT_SETTINGS, widthMode: 'wide' })).toBe(true);
        expect(validateSettings({ ...DEFAULT_SETTINGS, widthMode: 'custom' })).toBe(true);
        expect(validateSettings({ ...DEFAULT_SETTINGS, widthMode: 'invalid' })).toBe(false);
    });

    test('validates customWidth is positive', () => {
        expect(validateSettings({ ...DEFAULT_SETTINGS, customWidth: 1200 })).toBe(true);
        expect(validateSettings({ ...DEFAULT_SETTINGS, customWidth: 0 })).toBe(false);
        expect(validateSettings({ ...DEFAULT_SETTINGS, customWidth: -100 })).toBe(false);
    });

    test('validates generateToc is boolean', () => {
        expect(validateSettings({ ...DEFAULT_SETTINGS, generateToc: true })).toBe(true);
        expect(validateSettings({ ...DEFAULT_SETTINGS, generateToc: false })).toBe(true);
        expect(validateSettings({ ...DEFAULT_SETTINGS, generateToc: 'yes' })).toBe(false);
    });
});

describe('resolvedFrameWidth', () => {
    test('returns 480 for narrow mode', () => {
        expect(resolvedFrameWidth({ ...DEFAULT_SETTINGS, widthMode: 'narrow' })).toBe(480);
    });

    test('returns 800 for medium mode', () => {
        expect(resolvedFrameWidth({ ...DEFAULT_SETTINGS, widthMode: 'medium' })).toBe(800);
    });

    test('returns 960 for wide mode', () => {
        expect(resolvedFrameWidth({ ...DEFAULT_SETTINGS, widthMode: 'wide' })).toBe(960);
    });

    test('returns customWidth for custom mode', () => {
        expect(resolvedFrameWidth({ ...DEFAULT_SETTINGS, widthMode: 'custom', customWidth: 1200 })).toBe(1200);
    });
});

describe('mergeWithDefaults migration', () => {
    test('migrates frameWidth 480 to widthMode narrow', () => {
        const result = mergeWithDefaults({ frameWidth: 480 });
        expect(result.widthMode).toBe('narrow');
        expect(result.frameWidth).toBe(480);
    });

    test('migrates frameWidth 800 to widthMode medium', () => {
        const result = mergeWithDefaults({ frameWidth: 800 });
        expect(result.widthMode).toBe('medium');
        expect(result.frameWidth).toBe(800);
    });

    test('migrates frameWidth 960 to widthMode wide', () => {
        const result = mergeWithDefaults({ frameWidth: 960 });
        expect(result.widthMode).toBe('wide');
        expect(result.frameWidth).toBe(960);
    });

    test('migrates custom frameWidth to widthMode custom', () => {
        const result = mergeWithDefaults({ frameWidth: 1100 });
        expect(result.widthMode).toBe('custom');
        expect(result.customWidth).toBe(1100);
        expect(result.frameWidth).toBe(1100);
    });

    test('preserves widthMode when already present', () => {
        const result = mergeWithDefaults({ widthMode: 'wide', customWidth: 500 });
        expect(result.widthMode).toBe('wide');
        expect(result.customWidth).toBe(500);
    });
});
