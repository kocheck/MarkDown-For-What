/**
 * parser.ts
 *
 * Converts raw Markdown text into a structured array of Blocks.
 *
 * This module is platform-agnostic — it uses only the `marked` library.
 * Shared between the Figma and Sketch versions of the plugin.
 *
 * Public API:
 *   parseMarkdownToBlocks(markdown)  →  Block[]
 *   extractImagesFromTokens(tokens)  →  { textTokens, images }
 *   flattenTokens(tokens, context)   →  StyledSegment[]
 */

import { marked } from 'marked';
import { errorMessage } from './utils';

// ─── Interfaces ────────────────────────────────────────────────────────────────

/**
 * A single renderable unit of content extracted from Markdown.
 * Each block maps to one visual element in the Sketch artboard.
 */
export interface Block {
    type: 'heading' | 'paragraph' | 'list' | 'code' | 'quote' | 'separator' | 'table' | 'image';
    content?: string;     // Plain text content for text-based blocks
    level?: number;       // Heading depth: 1, 2, or 3
    language?: string;    // Code language hint (e.g. 'javascript')
    tokens?: marked.Token[]; // Inline tokens for rich-text rendering
    // Table-specific
    header?: marked.Tokens.TableCell[];
    align?: ('left' | 'center' | 'right' | null)[];
    rows?: marked.Tokens.TableCell[][];
    // Image-specific
    imageUrl?: string;
    imageAlt?: string;
}

/**
 * A run of text with optional inline formatting applied.
 * Multiple segments are combined to build a single Text layer with mixed styles.
 */
export interface StyledSegment {
    text: string;
    bold?: boolean;
    italic?: boolean;
    code?: boolean;
}

// ─── Helpers (exported for testability) ────────────────────────────────────────

/**
 * Separates image tokens from non-image tokens in an inline token array.
 * Used to split inline images out of paragraphs into their own Block entries.
 */
export function extractImagesFromTokens(tokens: marked.Token[]): {
    textTokens: marked.Token[];
    images: marked.Tokens.Image[];
} {
    const textTokens: marked.Token[] = [];
    const images: marked.Tokens.Image[] = [];

    for (const token of tokens) {
        if (token.type === 'image') {
            images.push(token as marked.Tokens.Image);
        } else {
            textTokens.push(token);
        }
    }

    return { textTokens, images };
}

/**
 * Recursively flattens a tree of inline marked tokens into a flat array of
 * StyledSegments. Each segment carries the accumulated formatting from its
 * ancestor tokens (bold, italic, code).
 */
export function flattenTokens(
    tokens: marked.Token[],
    context: { bold: boolean; italic: boolean; code: boolean }
): StyledSegment[] {
    let segments: StyledSegment[] = [];

    if (!tokens) return segments;

    for (const token of tokens) {
        switch (token.type) {
            case 'strong':
                segments = segments.concat(
                    flattenTokens((token as marked.Tokens.Strong).tokens, { ...context, bold: true })
                );
                break;
            case 'em':
                segments = segments.concat(
                    flattenTokens((token as marked.Tokens.Em).tokens, { ...context, italic: true })
                );
                break;
            case 'codespan':
                segments.push({ text: (token as marked.Tokens.Codespan).text, ...context, code: true });
                break;
            case 'text': {
                const tToken = token as marked.Tokens.Text;
                if (tToken.tokens) {
                    segments = segments.concat(flattenTokens(tToken.tokens, context));
                } else {
                    segments.push({ text: tToken.text, ...context });
                }
                break;
            }
            case 'link': {
                // Links render as plain text — URL is not shown in the Sketch output
                const lToken = token as marked.Tokens.Link;
                segments.push({ text: lToken.text, ...context });
                break;
            }
            default:
                if ('text' in token) {
                    segments.push({ text: (token as any).text, ...context });
                }
                break;
        }
    }
    return segments;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Converts a raw Markdown string into an ordered array of Block objects.
 *
 * YAML front matter (--- ... ---) is stripped before parsing.
 * Each token from the marked lexer is mapped to a typed Block.
 * Inline images inside paragraphs are extracted into their own image Blocks.
 */
export function parseMarkdownToBlocks(markdown: string): Block[] {
    const frontMatterRegex = /^---[\s\S]*?---\r?\n/;
    const cleanMarkdown = markdown.replace(frontMatterRegex, '');

    let tokens: marked.TokensList;
    try {
        tokens = marked.lexer(cleanMarkdown);
    } catch (err) {
        throw new Error(`Failed to parse Markdown content — ${errorMessage(err)}`);
    }
    const blocks: Block[] = [];

    for (const token of tokens) {
        switch (token.type) {
            case 'heading': {
                const hToken = token as marked.Tokens.Heading;
                blocks.push({
                    type: 'heading',
                    content: hToken.text,
                    level: hToken.depth,
                    tokens: hToken.tokens,
                });
                break;
            }
            case 'paragraph': {
                const pToken = token as marked.Tokens.Paragraph;

                if (pToken.tokens) {
                    const { textTokens, images } = extractImagesFromTokens(pToken.tokens);

                    if (textTokens.length > 0) {
                        const textContent = textTokens
                            .map(t => {
                                if ('text' in t) return (t as any).text;
                                if ('raw' in t) return (t as any).raw;
                                return '';
                            })
                            .join('');

                        if (textContent.trim()) {
                            blocks.push({ type: 'paragraph', content: textContent, tokens: textTokens });
                        }
                    }

                    for (const imgToken of images) {
                        blocks.push({
                            type: 'image',
                            imageUrl: imgToken.href,
                            imageAlt: imgToken.text || imgToken.title || 'Image',
                        });
                    }

                    if (textTokens.length === 0 && images.length === 0) {
                        blocks.push({ type: 'paragraph', content: pToken.text, tokens: pToken.tokens });
                    }
                } else {
                    blocks.push({ type: 'paragraph', content: pToken.text, tokens: pToken.tokens });
                }
                break;
            }
            case 'code': {
                const cToken = token as marked.Tokens.Code;
                blocks.push({ type: 'code', content: cToken.text, language: cToken.lang });
                break;
            }
            case 'blockquote': {
                const bToken = token as marked.Tokens.Blockquote;
                blocks.push({ type: 'quote', content: bToken.text });
                break;
            }
            case 'list': {
                const listToken = token as marked.Tokens.List;
                for (const item of listToken.items) {
                    blocks.push({ type: 'list', content: item.text, tokens: item.tokens });
                }
                break;
            }
            case 'table': {
                const tableToken = token as marked.Tokens.Table;
                blocks.push({
                    type: 'table',
                    header: tableToken.header,
                    align: tableToken.align,
                    rows: tableToken.rows,
                });
                break;
            }
            case 'hr':
                blocks.push({ type: 'separator' });
                break;
        }
    }
    return blocks;
}
