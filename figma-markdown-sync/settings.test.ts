/**
 * Unit tests for Figma-specific settings persistence.
 * Shared validation/merge tests are in ../shared/settings.test.ts.
 */

import { DEFAULT_SETTINGS, loadSettings, saveSettings, PluginSettings } from './settings';

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
        (figma.clientStorage.getAsync as jest.Mock).mockResolvedValue({ frameWidth: 1200 });
        const result = await loadSettings();
        expect(result.frameWidth).toBe(1200);
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
