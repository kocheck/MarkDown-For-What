/**
 * styles.ts
 *
 * Manages Sketch shared text styles and inline rich-text rendering.
 *
 * Sketch equivalent of Figma's text style system. Key differences:
 *   - Figma: figma.getLocalTextStyles() / figma.createTextStyle()
 *   - Sketch: document.sharedTextStyles / SharedStyle.fromStyle()
 *   - Figma: async font loading via figma.loadFontAsync()
 *   - Sketch: system fonts available synchronously (no pre-loading needed)
 *   - Figma: node.setRangeFontName(start, end, fontName)
 *   - Sketch: text attributes set via NSAttributedString or fragment manipulation
 *
 * IMPORTANT: Existing text styles are NEVER overwritten.
 * Designers can customize styles in Sketch and those changes survive re-imports.
 *
 * Public API:
 *   STYLE_NAMES                              — canonical style name constants
 *   DEFAULT_STYLES                           — default font config per style
 *   getOrCreateSharedStyle(document, name, config) — gets or creates a shared text style
 *   initializeStyles(document)               — ensures all styles exist
 *   applyInlineStyles(textLayer, tokens, baseStyleName) — applies mixed formatting
 *   getTextHeight(text, width, fontSize, lineHeight)     — estimates text height
 */

import type { marked } from 'marked';
import { flattenTokens } from './parser';
import { TEXT_COLOR } from './utils';


const sketch = require('sketch');

// ─── Style Name Constants ──────────────────────────────────────────────────────

/**
 * Canonical Sketch shared text style names used by this plugin.
 * These appear in the Shared Styles panel under the "Markdown/" group.
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

/** Configuration needed to create a text style for the first time. */
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

// ─── Style Management ──────────────────────────────────────────────────────────

// Module-level cache — cleared at the start of each import
const styleCache = new Map<string, any>();

/**
 * Returns an existing Sketch shared text style by name, or creates a new one.
 *
 * IMPORTANT: If the style already exists, its properties are NOT modified.
 * This preserves any customizations the designer has made in Sketch.
 *
 * @param document - The Sketch Document object
 * @param name     - The style name to look up (e.g. 'Markdown/H1')
 * @param config   - Font config used ONLY when creating a new style
 * @returns The existing or newly created SharedStyle
 */
export function getOrCreateSharedStyle(document: any, name: string, config: StyleConfig): any {
    const cached = styleCache.get(name);
    if (cached) return cached;

    // Search existing shared text styles
    const existing = document.sharedTextStyles.find((s: any) => s.name === name);
    if (existing) {
        styleCache.set(name, existing);
        return existing;
    }

    // Create a new shared text style
    const lineHeightPx = Math.round(config.size * config.lineHeight);

    const newStyle = sketch.SharedStyle.fromStyle({
        name: name,
        style: {
            textColor: TEXT_COLOR,
            fontSize: config.size,
            fontFamily: config.family,
            fontWeight: config.style.includes('Bold') ? 9 : 5, // Sketch: 5=Regular, 9=Bold
            fontStyle: config.style.includes('Italic') ? 'italic' : undefined,
            lineHeight: lineHeightPx,
            kerning: null,
            alignment: sketch.Text.Alignment.left,
        },
        document: document,
    });

    styleCache.set(name, newStyle);
    return newStyle;
}

/**
 * Ensures all Markdown/* shared text styles exist in the document.
 * Clears the in-memory cache before re-resolving.
 */
export function initializeStyles(document: any): void {
    styleCache.clear();
    for (const name of Object.keys(DEFAULT_STYLES)) {
        getOrCreateSharedStyle(document, name, DEFAULT_STYLES[name]);
    }
}

// ─── Inline Style Rendering ─────────────────────────────────────────────────

/**
 * Applies inline bold/italic/code formatting to a Sketch Text layer.
 *
 * In Sketch, rich text is handled via NSAttributedString.
 * We build the full text string, create the text layer, then apply
 * font attribute overrides on individual character ranges.
 *
 * @param textLayer     - The Sketch Text layer to format
 * @param tokens        - Inline marked tokens describing the rich text
 * @param baseStyleName - Which STYLE_NAMES key applies
 */
export function applyInlineStyles(
    textLayer: any,
    tokens: marked.Token[] | undefined,
    baseStyleName: string
): void {
    if (!tokens || tokens.length === 0) return;
    const segments = flattenTokens(tokens, { bold: false, italic: false, code: false });
    const fullText = segments.map(s => s.text).join('');

    // Set the text content
    textLayer.text = fullText;

    // If there are no formatting variations, we're done
    const hasFormatting = segments.some(s => s.bold || s.italic || s.code);
    if (!hasFormatting) return;

    const baseConfig = DEFAULT_STYLES[baseStyleName] ?? DEFAULT_STYLES[STYLE_NAMES.BODY];
    const isBaseBold = baseConfig.style.includes('Bold');

    // Build attributed string attributes for each segment
    // Use Sketch's native text fragment API to apply per-range formatting
    try {
        const nsText = textLayer.sketchObject.attributedStringValue
            ? textLayer.sketchObject.attributedStringValue().mutableCopy()
            : NSMutableAttributedString.alloc().initWithString(fullText);

        let currentIndex = 0;
        for (const segment of segments) {
            const start = currentIndex;
            const length = segment.text.length;

            if (length > 0) {
                const range = NSMakeRange(start, length);
                let fontFamily = baseConfig.family;
                let fontStyle = baseConfig.style;

                if (segment.code) {
                    fontFamily = 'Roboto Mono';
                    fontStyle = 'Regular';
                } else {
                    const effectiveBold = segment.bold || isBaseBold;
                    const effectiveItalic = segment.italic;

                    if (effectiveBold && effectiveItalic) fontStyle = 'BoldItalic';
                    else if (effectiveBold) fontStyle = 'Bold';
                    else if (effectiveItalic) fontStyle = 'Italic';
                    else fontStyle = 'Regular';
                }

                const fontName = `${fontFamily}-${fontStyle}`;
                const fontSize = segment.code ? DEFAULT_STYLES[STYLE_NAMES.CODE].size : baseConfig.size;
                const nsFont = NSFont.fontWithName_size_(fontName, fontSize);

                if (nsFont) {
                    nsText.addAttribute_value_range_(NSFontAttributeName, nsFont, range);
                }
            }
            currentIndex += length;
        }

        // Apply the attributed string back to the text layer
        textLayer.sketchObject.setAttributedStringValue_(nsText);
    } catch (err) {
        // If native text manipulation fails, the plain text is already set
        console.warn('[MarkDown For What] Failed to apply inline styles:', err);
    }
}

// ─── Text Measurement ──────────────────────────────────────────────────────────

/**
 * Estimates the rendered height of a text block given its content and constraints.
 * Used for manual layout positioning since Sketch doesn't have auto-layout.
 *
 * @param text       - The text content
 * @param width      - Available width in px
 * @param fontSize   - Font size in px
 * @param lineHeight - Line height multiplier
 * @returns Estimated height in pixels
 */
export function estimateTextHeight(text: string, width: number, fontSize: number, lineHeight: number): number {
    if (!text) return fontSize * lineHeight;

    const avgCharWidth = fontSize * 0.55; // Approximate average character width
    const charsPerLine = Math.max(1, Math.floor(width / avgCharWidth));
    const lineCount = text.split('\n').reduce((total, line) => {
        const wrappedLines = Math.max(1, Math.ceil(line.length / charsPerLine));
        return total + wrappedLines;
    }, 0);

    return Math.max(lineCount * fontSize * lineHeight, fontSize * lineHeight);
}
