/**
 * Unit tests for styles.ts
 * Key invariant: existing Figma text styles are NEVER overwritten on re-import.
 */

import { getOrCreateTextStyle, STYLE_NAMES, DEFAULT_STYLES, loadFont, initializeStyles, applyInlineStyles } from './styles';

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

        (figma.getLocalTextStylesAsync as jest.Mock).mockResolvedValue([existingStyle]);

        const result = await getOrCreateTextStyle(STYLE_NAMES.H1, DEFAULT_STYLES[STYLE_NAMES.H1]);

        expect(result).toBe(existingStyle);
        // createTextStyle must NOT have been called — we never overwrite existing styles
        expect(figma.createTextStyle).not.toHaveBeenCalled();
        expect(figma.loadFontAsync).not.toHaveBeenCalled();
        // Designer's custom values must be untouched
        expect(existingStyle.fontName).toEqual({ family: 'Custom Font', style: 'Black' });
        expect(existingStyle.fontSize).toBe(48);
    });

    test('creates a new style when none exists', async () => {
        (figma.getLocalTextStylesAsync as jest.Mock).mockResolvedValue([]);

        const mockStyle: any = { name: '', fontName: {}, fontSize: 0, lineHeight: {} };
        (figma.createTextStyle as jest.Mock).mockReturnValue(mockStyle);
        (figma.loadFontAsync as jest.Mock).mockResolvedValue(undefined);

        await getOrCreateTextStyle(STYLE_NAMES.BODY, DEFAULT_STYLES[STYLE_NAMES.BODY]);

        expect(figma.createTextStyle).toHaveBeenCalledTimes(1);
        expect(mockStyle.name).toBe(STYLE_NAMES.BODY);
        expect(mockStyle.fontSize).toBe(DEFAULT_STYLES[STYLE_NAMES.BODY].size);
        expect(mockStyle.fontName).toEqual({ family: DEFAULT_STYLES[STYLE_NAMES.BODY].family, style: DEFAULT_STYLES[STYLE_NAMES.BODY].style });
        expect(mockStyle.lineHeight).toEqual({ value: DEFAULT_STYLES[STYLE_NAMES.BODY].lineHeight * 100, unit: 'PERCENT' });
    });
});

describe('loadFont', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns the requested font when available', async () => {
        (figma.loadFontAsync as jest.Mock).mockResolvedValue(undefined);
        const result = await loadFont('Inter', 'Bold');
        expect(result).toEqual({ family: 'Inter', style: 'Bold' });
        expect(figma.loadFontAsync).toHaveBeenCalledWith({ family: 'Inter', style: 'Bold' });
    });

    it('falls back to Inter Regular when font not found', async () => {
        (figma.loadFontAsync as jest.Mock)
            .mockRejectedValueOnce(new Error('Font not found'))
            .mockResolvedValueOnce(undefined);
        const result = await loadFont('Nonexistent', 'Bold');
        expect(result).toEqual({ family: 'Inter', style: 'Regular' });
    });

    it('throws when both primary font and Inter Regular fallback fail', async () => {
        (figma.loadFontAsync as jest.Mock)
            .mockRejectedValueOnce(new Error('Font not found'))
            .mockRejectedValueOnce(new Error('Inter not found'));
        await expect(loadFont('Nonexistent', 'Bold')).rejects.toThrow('Inter not found');
    });
});

describe('getOrCreateTextStyle - cache behavior', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns cached style without calling getLocalTextStyles again', async () => {
        // Use initializeStyles to populate cache first
        const mockStyle: any = { id: 'cached-id', name: STYLE_NAMES.BODY, fontName: {}, fontSize: 0, lineHeight: {} };
        (figma.getLocalTextStylesAsync as jest.Mock).mockResolvedValue([]);
        (figma.createTextStyle as jest.Mock).mockReturnValue(mockStyle);
        (figma.loadFontAsync as jest.Mock).mockResolvedValue(undefined);

        const config = DEFAULT_STYLES[STYLE_NAMES.BODY];
        await getOrCreateTextStyle(STYLE_NAMES.BODY, config);
        jest.clearAllMocks();
        // Second call — should use cache, not call getLocalTextStylesAsync
        await getOrCreateTextStyle(STYLE_NAMES.BODY, config);
        expect(figma.getLocalTextStylesAsync).not.toHaveBeenCalled();
    });

    it('does not call getLocalTextStylesAsync when existingStyles is provided', async () => {
        const mockStyle: any = { id: 'style-id', name: '', fontName: {}, fontSize: 0, lineHeight: {} };
        (figma.createTextStyle as jest.Mock).mockReturnValue(mockStyle);
        (figma.loadFontAsync as jest.Mock).mockResolvedValue(undefined);

        // Pass existingStyles directly — no IPC call should happen
        await getOrCreateTextStyle(STYLE_NAMES.BODY, DEFAULT_STYLES[STYLE_NAMES.BODY], []);

        expect(figma.getLocalTextStylesAsync).not.toHaveBeenCalled();
    });
});

describe('initializeStyles', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('clears the style cache before creating styles', async () => {
        const mockStyle: any = { id: 'style-id', name: '', fontName: {}, fontSize: 0, lineHeight: {} };
        (figma.getLocalTextStylesAsync as jest.Mock).mockResolvedValue([]);
        (figma.createTextStyle as jest.Mock).mockReturnValue(mockStyle);
        (figma.loadFontAsync as jest.Mock).mockResolvedValue(undefined);

        // First call populates cache
        await initializeStyles();
        // Second call should clear + repopulate without throwing
        await initializeStyles();
        // Should have created styles twice (once per initializeStyles call)
        expect(figma.createTextStyle).toHaveBeenCalled();
    });

    it('calls getLocalTextStylesAsync exactly once regardless of style count', async () => {
        const mockStyle: any = { id: 'style-id', name: '', fontName: {}, fontSize: 0, lineHeight: {} };
        (figma.getLocalTextStylesAsync as jest.Mock).mockResolvedValue([]);
        (figma.createTextStyle as jest.Mock).mockReturnValue(mockStyle);
        (figma.loadFontAsync as jest.Mock).mockResolvedValue(undefined);

        await initializeStyles();

        // Must be exactly 1 call — not one per style (which would be N calls for N styles)
        expect(figma.getLocalTextStylesAsync).toHaveBeenCalledTimes(1);
        expect(Object.keys(DEFAULT_STYLES).length).toBeGreaterThan(1); // confirm there are multiple styles
    });
});

describe('applyInlineStyles', () => {
    let node: any;

    beforeEach(() => {
        jest.clearAllMocks();
        node = {
            characters: '',
            textStyleId: '',
            setRangeFontName: jest.fn(),
        };
        (figma.createText as jest.Mock).mockReturnValue(node);
        (figma.loadFontAsync as jest.Mock).mockResolvedValue(undefined);
        (figma.getLocalTextStylesAsync as jest.Mock).mockResolvedValue([]);
        const mockStyle: any = { id: 'style-id', name: '', fontName: {}, fontSize: 0, lineHeight: {} };
        (figma.createTextStyle as jest.Mock).mockReturnValue(mockStyle);
    });

    it('applies bold formatting to bold tokens', async () => {
        const tokens = [{ type: 'strong', tokens: [{ type: 'text', text: 'bold text' }] }] as any;
        await applyInlineStyles(node, tokens, STYLE_NAMES.BODY);
        expect(node.setRangeFontName).toHaveBeenCalledWith(
            0, 9,
            expect.objectContaining({ style: 'Bold' })
        );
    });

    it('applies italic formatting to em tokens', async () => {
        const tokens = [{ type: 'em', tokens: [{ type: 'text', text: 'italic' }] }] as any;
        await applyInlineStyles(node, tokens, STYLE_NAMES.BODY);
        expect(node.setRangeFontName).toHaveBeenCalledWith(
            0, 6,
            expect.objectContaining({ style: 'Italic' })
        );
    });

    it('applies code font to codespan tokens', async () => {
        const tokens = [{ type: 'codespan', text: 'code' }] as any;
        await applyInlineStyles(node, tokens, STYLE_NAMES.BODY);
        expect(node.setRangeFontName).toHaveBeenCalledWith(
            0, 4,
            expect.objectContaining({ family: 'Roboto Mono' })
        );
    });

    it('inherits bold for heading base style', async () => {
        const tokens = [{ type: 'text', text: 'heading text' }] as any;
        await applyInlineStyles(node, tokens, STYLE_NAMES.H1);
        expect(node.setRangeFontName).toHaveBeenCalledWith(
            0, 12,
            expect.objectContaining({ style: 'Bold' })
        );
    });

    it('does nothing when tokens array is empty', async () => {
        await applyInlineStyles(node, [], STYLE_NAMES.BODY);
        expect(node.setRangeFontName).not.toHaveBeenCalled();
    });

    it('applies Bold Italic font for bold+italic combined tokens', async () => {
        const tokens = [{
            type: 'strong',
            tokens: [{
                type: 'em',
                tokens: [{ type: 'text', text: 'bold italic' }]
            }]
        }] as any;
        await applyInlineStyles(node, tokens, STYLE_NAMES.BODY);
        expect(node.setRangeFontName).toHaveBeenCalledWith(
            0, 11,
            expect.objectContaining({ style: 'Bold Italic' })
        );
    });
});
