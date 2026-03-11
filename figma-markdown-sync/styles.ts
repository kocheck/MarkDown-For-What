/**
 * styles.ts
 *
 * Manages Figma text styles and inline rich-text rendering.
 *
 * Responsibilities:
 *   - Defining default typography config for each Markdown element type
 *   - Creating local Figma text styles on first import
 *   - Applying inline bold/italic/code formatting to TextNode character ranges
 *
 * IMPORTANT: Existing text styles (e.g. Markdown/H1) are NEVER overwritten.
 * Designers can customize styles in Figma and those changes survive re-imports.
 *
 * Public API:
 *   STYLE_NAMES                              — canonical style name constants
 *   DEFAULT_STYLES                           — default font config per style
 *   loadFont(family, style)                  — async: loads font with fallback
 *   getOrCreateTextStyle(name, config)       — async: gets or creates a text style
 *   initializeStyles()                       — async: ensures all styles exist
 *   applyInlineStyles(node, tokens, base)    — async: applies mixed formatting
 */

import type { marked } from 'marked';
import { flattenTokens } from './parser';
import { errorMessage, hexToRgb } from './utils';

// ─── Style Name Constants ──────────────────────────────────────────────────────

/**
 * Canonical Figma text style names used by this plugin.
 * These appear in the "Local Styles" panel under the "Markdown/" group.
 */
export const STYLE_NAMES = {
    H1:    'Markdown/H1',
    H2:    'Markdown/H2',
    H3:    'Markdown/H3',
    BODY:  'Markdown/Body',
    CODE:  'Markdown/Code',
    LIST:  'Markdown/List',
    QUOTE: 'Markdown/Quote',
} as const;

// ─── Style Configuration ───────────────────────────────────────────────────────

/** Configuration needed to create a Figma text style for the first time. */
export interface StyleConfig {
    family: string;
    style: string;
    size: number;
    /** Line height multiplier, e.g. 1.5 = 150% */
    lineHeight: number;
}

/**
 * Default typography values for each Markdown style.
 * Applied ONLY when creating a style that does not yet exist in the document.
 * If a style already exists, these values are ignored.
 */
export const DEFAULT_STYLES: Record<string, StyleConfig> = {
    [STYLE_NAMES.H1]:    { family: 'Inter', style: 'Bold',    size: 32, lineHeight: 1.2 },
    [STYLE_NAMES.H2]:    { family: 'Inter', style: 'Bold',    size: 24, lineHeight: 1.3 },
    [STYLE_NAMES.H3]:    { family: 'Inter', style: 'Bold',    size: 20, lineHeight: 1.4 },
    [STYLE_NAMES.BODY]:  { family: 'Inter', style: 'Regular', size: 16, lineHeight: 1.5 },
    [STYLE_NAMES.CODE]:  { family: 'Roboto Mono', style: 'Regular', size: 14, lineHeight: 1.4 },
    [STYLE_NAMES.LIST]:  { family: 'Inter', style: 'Regular', size: 16, lineHeight: 1.5 },
    [STYLE_NAMES.QUOTE]: { family: 'Inter', style: 'Italic',  size: 16, lineHeight: 1.5 },
};

/** Link color (#0969DA) — GitHub-style blue for inline hyperlinks */
const LINK_COLOR: RGB = hexToRgb('#0969DA');

// ─── Font Loading ──────────────────────────────────────────────────────────────

/**
 * Loads a font by family and style, falling back to Inter Regular if not found.
 * Figma requires fonts to be loaded before they can be set on text nodes.
 *
 * @param family - Font family name (e.g. 'Inter', 'Roboto Mono')
 * @param style  - Font style (e.g. 'Regular', 'Bold', 'Italic')
 * @returns The loaded FontName — may differ from input if fallback was used
 */
export async function loadFont(family: string, style: string): Promise<FontName> {
    const font: FontName = { family, style };
    try {
        await figma.loadFontAsync(font);
        return font;
    } catch (err) {
        console.warn(`[MarkDown For What] Font not found: ${family} ${style}, falling back to Inter Regular`, err);
        const fallback: FontName = { family: 'Inter', style: 'Regular' };
        try {
            await figma.loadFontAsync(fallback);
        } catch (fallbackErr) {
            console.error('[MarkDown For What] Fallback font Inter Regular also failed to load:', fallbackErr);
            throw fallbackErr;
        }
        return fallback;
    }
}

// ─── Style Management ──────────────────────────────────────────────────────────

// Module-level cache — persists for the plugin session lifetime.
// Cleared at the start of each import by initializeStyles() to prevent
// stale references if the designer deletes a style mid-session.
const styleCache = new Map<string, TextStyle>();

/**
 * Returns an existing Figma text style by name, or creates a new one with the
 * given config if it doesn't exist yet.
 *
 * IMPORTANT: If the style already exists, its properties are NOT modified.
 * This preserves any customizations the designer has made in Figma.
 *
 * @param name   - The style name to look up (e.g. 'Markdown/H1')
 * @param config - Font config used ONLY when creating a new style
 * @param existingStyles - Optional pre-fetched style list. When provided, skips the
 *                         `getLocalTextStylesAsync` IPC call. Pass from `initializeStyles`
 *                         to avoid N redundant calls during batch initialization.
 * @returns The existing or newly created TextStyle
 */
export async function getOrCreateTextStyle(name: string, config: StyleConfig, existingStyles?: TextStyle[]): Promise<TextStyle> {
    const cached = styleCache.get(name);
    if (cached) return cached;

    if (!existingStyles) {
        console.warn(`[MarkDown For What] getOrCreateTextStyle("${name}") cache miss without pre-fetched styles — expected initializeStyles() to have run first`);
    }
    const allStyles = existingStyles ?? await figma.getLocalTextStylesAsync();
    const existing = allStyles.find(s => s.name === name);

    if (existing) {
        styleCache.set(name, existing);
        return existing; // Do not modify — preserves designer customizations
    }

    await loadFont(config.family, config.style);
    const newStyle = figma.createTextStyle();
    newStyle.name = name;
    newStyle.fontName = { family: config.family, style: config.style };
    newStyle.fontSize = config.size;
    newStyle.lineHeight = { value: config.lineHeight * 100, unit: 'PERCENT' };
    styleCache.set(name, newStyle);
    return newStyle;
}

/**
 * Ensures all Markdown/* text styles exist in the document.
 * Clears the in-memory style cache before re-resolving, so deleted or
 * renamed styles are picked up fresh on each import run.
 * Creates any missing styles using DEFAULT_STYLES values.
 * Call once at the start of an import before rendering any blocks.
 */
export async function initializeStyles(): Promise<void> {
    styleCache.clear();

    let allStyles: TextStyle[];
    try {
        allStyles = await figma.getLocalTextStylesAsync();
    } catch (err) {
        throw new Error(`[MarkDown For What] Failed to retrieve local text styles: ${errorMessage(err)}`);
    }

    const styleNames = Object.keys(DEFAULT_STYLES);
    const results = await Promise.allSettled(
        styleNames.map(name => getOrCreateTextStyle(name, DEFAULT_STYLES[name], allStyles))
    );

    const failures = results
        .map((result, i) => ({ result, name: styleNames[i] }))
        .filter(({ result }) => result.status === 'rejected');

    if (failures.length > 0) {
        const summary = failures
            .map(({ name, result }) => `${name}: ${errorMessage((result as PromiseRejectedResult).reason)}`)
            .join('; ');
        throw new Error(`[MarkDown For What] Failed to initialize ${failures.length} text style(s) — ${summary}`);
    }
}

// ─── Inline Style Rendering ───────────────────────────────────────────────────

/**
 * Applies inline bold/italic/code formatting to a TextNode by setting font
 * overrides on individual character ranges.
 *
 * Call AFTER setting node.textStyleId. This function sets node.characters
 * and overrides font names at specific character ranges.
 * Note: This function sets node.characters internally — do not set it beforehand.
 *
 * @param node          - The Figma TextNode to format
 * @param tokens        - Inline marked tokens describing the rich text, or undefined to no-op.
 *                        Recognized token types: strong, em, codespan, text, link.
 * @param baseStyleName - Which STYLE_NAMES key applies (affects bold inheritance for headings)
 */
export async function applyInlineStyles(
    node: TextNode,
    tokens: marked.Token[] | undefined,
    baseStyleName: string
): Promise<void> {
    if (!tokens || tokens.length === 0) return;

    const segments = flattenTokens(tokens, { bold: false, italic: false, code: false });
    const fullText = segments.map(s => s.text).join('');
    node.characters = fullText;

    const baseConfig = DEFAULT_STYLES[baseStyleName] ?? DEFAULT_STYLES[STYLE_NAMES.BODY];
    const [regularFont, boldFont, italicFont, boldItalicFont, codeFont] = await Promise.all([
        loadFont(baseConfig.family, 'Regular'),
        loadFont(baseConfig.family, 'Bold'),
        loadFont(baseConfig.family, 'Italic'),
        loadFont(baseConfig.family, 'Bold Italic'),
        loadFont('Roboto Mono', 'Regular'),
    ]);

    const isBaseBold = baseConfig.style.includes('Bold');
    let currentIndex = 0;

    for (const segment of segments) {
        const start = currentIndex;
        const end = currentIndex + segment.text.length;

        if (end > start) {
            let font: FontName;
            if (segment.code) {
                font = codeFont;
            } else {
                const effectiveBold = segment.bold || isBaseBold;
                const effectiveItalic = segment.italic;
                if (effectiveBold && effectiveItalic) font = boldItalicFont;
                else if (effectiveBold) font = boldFont;
                else if (effectiveItalic) font = italicFont;
                else font = regularFont;
            }
            node.setRangeFontName(start, end, font);

            if (segment.strikethrough) {
                node.setRangeTextDecoration(start, end, 'STRIKETHROUGH');
            }

            if (segment.link) {
                node.setRangeHyperlink(start, end, { type: 'URL', value: segment.link });
                if (!segment.strikethrough) {
                    node.setRangeTextDecoration(start, end, 'UNDERLINE');
                }
                node.setRangeFills(start, end, [{ type: 'SOLID', color: LINK_COLOR }]);
            }
        }
        currentIndex = end;
    }
}

// CommonJS export shim — allows Jest (require()) and webpack (import) to both work
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        STYLE_NAMES,
        DEFAULT_STYLES,
        loadFont,
        getOrCreateTextStyle,
        initializeStyles,
        applyInlineStyles,
    };
}
