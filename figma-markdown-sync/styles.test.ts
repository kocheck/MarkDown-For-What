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

    it('throws with a summary when one or more styles fail to create', async () => {
        (figma.getLocalTextStylesAsync as jest.Mock).mockResolvedValue([]);
        // Reject every font load — both primary and Inter Regular fallback — so every
        // style fails. Promise.allSettled collects all rejections and initializeStyles
        // should throw with the "Failed to initialize N text style(s)" summary.
        (figma.loadFontAsync as jest.Mock).mockRejectedValue(new Error('Font unavailable'));
        (figma.createTextStyle as jest.Mock).mockReturnValue({
            id: 'style-id', name: '', fontName: {}, fontSize: 0, lineHeight: {},
        });

        await expect(initializeStyles()).rejects.toThrow('Failed to initialize');
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

describe('applyInlineStyles — strikethrough', () => {
    let node: any;

    beforeEach(() => {
        jest.clearAllMocks();
        node = {
            characters: '',
            textStyleId: '',
            setRangeFontName: jest.fn(),
            setRangeTextDecoration: jest.fn(),
        };
        (figma.createText as jest.Mock).mockReturnValue(node);
        (figma.loadFontAsync as jest.Mock).mockResolvedValue(undefined);
        (figma.getLocalTextStylesAsync as jest.Mock).mockResolvedValue([]);
        const mockStyle: any = { id: 'style-id', name: '', fontName: {}, fontSize: 0, lineHeight: {} };
        (figma.createTextStyle as jest.Mock).mockReturnValue(mockStyle);
    });

    it('applies STRIKETHROUGH text decoration for ~~text~~', async () => {
        const tokens: any[] = [
            {
                type: 'del',
                raw: '~~struck~~',
                text: 'struck',
                tokens: [{ type: 'text', raw: 'struck', text: 'struck' }]
            }
        ];

        await applyInlineStyles(node, tokens, 'Markdown/Body');

        expect(node.characters).toBe('struck');
        expect(node.setRangeTextDecoration).toHaveBeenCalledWith(0, 6, 'STRIKETHROUGH');
    });

    it('does not apply STRIKETHROUGH for non-del tokens', async () => {
        const tokens: any[] = [
            { type: 'text', text: 'normal text' }
        ];

        await applyInlineStyles(node, tokens, 'Markdown/Body');

        expect(node.characters).toBe('normal text');
        expect(node.setRangeTextDecoration).not.toHaveBeenCalled();
    });

    it('applies STRIKETHROUGH combined with bold', async () => {
        const tokens: any[] = [
            {
                type: 'del',
                raw: '~~**bold struck**~~',
                text: 'bold struck',
                tokens: [{
                    type: 'strong',
                    tokens: [{ type: 'text', text: 'bold struck' }]
                }]
            }
        ];

        await applyInlineStyles(node, tokens, 'Markdown/Body');

        expect(node.characters).toBe('bold struck');
        expect(node.setRangeTextDecoration).toHaveBeenCalledWith(0, 11, 'STRIKETHROUGH');
        expect(node.setRangeFontName).toHaveBeenCalledWith(
            0, 11,
            expect.objectContaining({ style: 'Bold' })
        );
    });
});

describe('applyInlineStyles — links', () => {
    let node: any;

    beforeEach(() => {
        jest.clearAllMocks();
        node = {
            characters: '',
            textStyleId: '',
            setRangeFontName: jest.fn(),
            setRangeTextDecoration: jest.fn(),
            setRangeHyperlink: jest.fn(),
            setRangeFills: jest.fn(),
        };
        (figma.createText as jest.Mock).mockReturnValue(node);
        (figma.loadFontAsync as jest.Mock).mockResolvedValue(undefined);
        (figma.getLocalTextStylesAsync as jest.Mock).mockResolvedValue([]);
        const mockStyle: any = { id: 'style-id', name: '', fontName: {}, fontSize: 0, lineHeight: {} };
        (figma.createTextStyle as jest.Mock).mockReturnValue(mockStyle);
    });

    it('applies hyperlink and underline decoration for link segments', async () => {
        const tokens: any[] = [
            { type: 'text', raw: 'Click ', text: 'Click ' },
            {
                type: 'link',
                raw: '[here](https://example.com)',
                text: 'here',
                href: 'https://example.com',
                tokens: [{ type: 'text', raw: 'here', text: 'here' }]
            },
        ];

        await applyInlineStyles(node, tokens, 'Markdown/Body');

        expect(node.characters).toBe('Click here');
        // 'here' starts at index 6, length 4
        expect(node.setRangeHyperlink).toHaveBeenCalledWith(6, 10, { type: 'URL', value: 'https://example.com' });
        expect(node.setRangeTextDecoration).toHaveBeenCalledWith(6, 10, 'UNDERLINE');
        expect(node.setRangeFills).toHaveBeenCalledWith(6, 10, [{ type: 'SOLID', color: { r: 9/255, g: 105/255, b: 218/255 } }]);
    });

    it('does not apply hyperlink to non-link segments', async () => {
        const tokens: any[] = [
            { type: 'text', raw: 'plain text', text: 'plain text' },
        ];

        await applyInlineStyles(node, tokens, 'Markdown/Body');

        expect(node.setRangeHyperlink).not.toHaveBeenCalled();
    });

    it('skips hyperlink for non-http URLs', async () => {
        const tokens: any[] = [
            {
                type: 'link',
                raw: '[text](./relative)',
                text: 'text',
                href: './relative',
                tokens: [{ type: 'text', raw: 'text', text: 'text' }]
            },
        ];

        await applyInlineStyles(node, tokens, 'Markdown/Body');

        expect(node.setRangeHyperlink).not.toHaveBeenCalled();
        expect(node.setRangeFills).not.toHaveBeenCalled();
    });

    it('skips hyperlink for empty URL', async () => {
        const tokens: any[] = [
            {
                type: 'link',
                raw: '[text]()',
                text: 'text',
                href: '',
                tokens: [{ type: 'text', raw: 'text', text: 'text' }]
            },
        ];

        await applyInlineStyles(node, tokens, 'Markdown/Body');

        expect(node.setRangeHyperlink).not.toHaveBeenCalled();
    });
});

describe('applyInlineStyles — strikethrough + link combined', () => {
    let node: any;

    beforeEach(() => {
        jest.clearAllMocks();
        node = {
            characters: '',
            textStyleId: '',
            setRangeFontName: jest.fn(),
            setRangeTextDecoration: jest.fn(),
            setRangeHyperlink: jest.fn(),
            setRangeFills: jest.fn(),
        };
        (figma.createText as jest.Mock).mockReturnValue(node);
        (figma.loadFontAsync as jest.Mock).mockResolvedValue(undefined);
        (figma.getLocalTextStylesAsync as jest.Mock).mockResolvedValue([]);
        const mockStyle: any = { id: 'style-id', name: '', fontName: {}, fontSize: 0, lineHeight: {} };
        (figma.createTextStyle as jest.Mock).mockReturnValue(mockStyle);
    });

    it('applies STRIKETHROUGH but not UNDERLINE when both strikethrough and link', async () => {
        const tokens: any[] = [
            {
                type: 'del',
                raw: '~~[link](https://example.com)~~',
                text: 'link',
                tokens: [{
                    type: 'link',
                    raw: '[link](https://example.com)',
                    text: 'link',
                    href: 'https://example.com',
                    tokens: [{ type: 'text', raw: 'link', text: 'link' }]
                }]
            }
        ];

        await applyInlineStyles(node, tokens, 'Markdown/Body');

        expect(node.setRangeTextDecoration).toHaveBeenCalledWith(0, 4, 'STRIKETHROUGH');
        expect(node.setRangeTextDecoration).not.toHaveBeenCalledWith(0, 4, 'UNDERLINE');
        expect(node.setRangeHyperlink).toHaveBeenCalledWith(0, 4, { type: 'URL', value: 'https://example.com' });
        expect(node.setRangeFills).toHaveBeenCalled();
    });
});

describe('applyInlineStyles — error resilience', () => {
    let node: any;

    beforeEach(() => {
        jest.clearAllMocks();
        node = {
            characters: '',
            textStyleId: '',
            setRangeFontName: jest.fn(),
            setRangeTextDecoration: jest.fn(),
            setRangeHyperlink: jest.fn(),
            setRangeFills: jest.fn(),
        };
        (figma.createText as jest.Mock).mockReturnValue(node);
        (figma.loadFontAsync as jest.Mock).mockResolvedValue(undefined);
        (figma.getLocalTextStylesAsync as jest.Mock).mockResolvedValue([]);
        const mockStyle: any = { id: 'style-id', name: '', fontName: {}, fontSize: 0, lineHeight: {} };
        (figma.createTextStyle as jest.Mock).mockReturnValue(mockStyle);
    });

    it('continues formatting remaining segments when one segment throws', async () => {
        node.setRangeFontName
            .mockImplementationOnce(() => { throw new Error('Simulated Figma error'); })
            .mockImplementation(() => {});

        const tokens: any[] = [
            { type: 'text', raw: 'fail', text: 'fail' },
            { type: 'text', raw: 'ok', text: 'ok' },
        ];

        await applyInlineStyles(node, tokens, 'Markdown/Body');

        // Second segment should still be formatted despite first failing
        expect(node.setRangeFontName).toHaveBeenCalledTimes(2);
    });
});
