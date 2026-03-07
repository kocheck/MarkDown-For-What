/**
 * Unit tests for styles.ts
 * Key invariant: existing Figma text styles are NEVER overwritten on re-import.
 */

import { getOrCreateTextStyle, STYLE_NAMES, DEFAULT_STYLES } from './styles';

describe('getOrCreateTextStyle', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('returns existing style without modifying it', async () => {
        const existingStyle = {
            id: 'existing-id',
            name: STYLE_NAMES.H1,
            fontName: { family: 'Custom Font', style: 'Black' },
            fontSize: 48,
        };

        (figma.getLocalTextStyles as jest.Mock).mockReturnValue([existingStyle]);

        const result = await getOrCreateTextStyle(STYLE_NAMES.H1, DEFAULT_STYLES[STYLE_NAMES.H1]);

        expect(result).toBe(existingStyle);
        // createTextStyle must NOT have been called — we never overwrite existing styles
        expect(figma.createTextStyle).not.toHaveBeenCalled();
        // Designer's custom values must be untouched
        expect(existingStyle.fontName).toEqual({ family: 'Custom Font', style: 'Black' });
        expect(existingStyle.fontSize).toBe(48);
    });

    test('creates a new style when none exists', async () => {
        (figma.getLocalTextStyles as jest.Mock).mockReturnValue([]);

        const mockStyle: any = { name: '', fontName: {}, fontSize: 0, lineHeight: {} };
        (figma.createTextStyle as jest.Mock).mockReturnValue(mockStyle);
        (figma.loadFontAsync as jest.Mock).mockResolvedValue(undefined);

        await getOrCreateTextStyle(STYLE_NAMES.BODY, DEFAULT_STYLES[STYLE_NAMES.BODY]);

        expect(figma.createTextStyle).toHaveBeenCalledTimes(1);
        expect(mockStyle.name).toBe(STYLE_NAMES.BODY);
        expect(mockStyle.fontSize).toBe(DEFAULT_STYLES[STYLE_NAMES.BODY].size);
    });
});
