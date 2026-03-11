/**
 * parser.ts
 *
 * Converts raw Markdown text into a structured array of Blocks.
 *
 * This is the primary module that imports and uses `marked` directly.
 * (styles.ts also imports `marked` types for inline token handling.)
 * All other modules receive pre-parsed Block objects — they should never
 * need to understand Markdown syntax themselves.
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
 * Each block maps to one visual element in the Figma frame.
 */
export interface Block {
    type: 'heading' | 'paragraph' | 'list' | 'code' | 'quote' | 'separator' | 'table' | 'image' | 'orderedListItem' | 'taskListItem' | 'callout' | 'toc' | 'definitionList' | 'footnoteSection' | 'badgeRow';
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
    // List-specific
    depth?: number;
    // Ordered list-specific
    index?: number;
    // Task list-specific
    checked?: boolean;
    // Callout-specific
    calloutType?: CalloutType;
    // TOC-specific
    tocEntries?: Array<{ text: string; level: number }>;
    // Definition list-specific
    definitions?: Array<{ term: string; definitions: string[] }>;
    // Footnote section-specific
    footnotes?: Array<{ id: string; index: number; text: string }>;
    // Badge row-specific
    badges?: Array<{ label: string; color?: string }>;
}

/**
 * A run of text with optional inline formatting applied.
 * Multiple segments are combined to build a single TextNode with mixed styles.
 */
export interface StyledSegment {
    text: string;
    bold?: boolean;
    italic?: boolean;
    code?: boolean;
    strikethrough?: boolean;
    link?: string;
    footnoteRef?: { id: string; index: number };
    badge?: { label: string; color?: string };
}

// ─── Helpers (exported for testability) ────────────────────────────────────────

/**
 * Separates image tokens from non-image tokens in an inline token array.
 * Used to split inline images out of paragraphs into their own Block entries.
 *
 * @internal Exported for testability; this is an implementation detail of parseMarkdownToBlocks.
 * @param tokens - Array of inline marked tokens from a paragraph
 * @returns Object with `textTokens` (non-image) and `images` (image tokens)
 *
 * @example
 * const { textTokens, images } = extractImagesFromTokens(paragraph.tokens);
 * // images → [{ type: 'image', href: 'https://...', text: 'alt' }]
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
 * Inherited formatting state passed through recursive token flattening.
 * All fields are explicit — string fields use `undefined` to indicate absence.
 */
export interface FlattenContext {
    bold: boolean;
    italic: boolean;
    code: boolean;
    strikethrough: boolean;
    link: string | undefined;
    footnoteRef: { id: string; index: number } | undefined;
    badge: { label: string; color?: string } | undefined;
}

/** Default FlattenContext with no formatting applied. */
export const DEFAULT_FLATTEN_CONTEXT: FlattenContext = {
    bold: false,
    italic: false,
    code: false,
    strikethrough: false,
    link: undefined,
    footnoteRef: undefined,
    badge: undefined,
};

/**
 * Recursively flattens a tree of inline marked tokens into a flat array of
 * StyledSegments. Each segment carries the accumulated formatting from its
 * ancestor tokens (bold, italic, code, strikethrough, link).
 *
 * @param tokens  - Inline token array (from a paragraph, heading, list item, etc.)
 * @param context - Inherited formatting state from parent tokens
 * @returns Flat array of styled text segments
 *
 * @example
 * const segments = flattenTokens(heading.tokens, {
 *     bold: false, italic: false, code: false, strikethrough: false, link: undefined,
 * });
 * // → [{ text: 'Hello ', bold: false }, { text: 'World', bold: true }]
 */
export function flattenTokens(
    tokens: marked.Token[],
    context: FlattenContext
): StyledSegment[] {
    const segments: StyledSegment[] = [];

    if (!tokens) return segments;

    for (const token of tokens) {
        switch (token.type) {
            case 'strong':
                segments.push(
                    ...flattenTokens((token as marked.Tokens.Strong).tokens, { ...context, bold: true })
                );
                break;
            case 'em':
                segments.push(
                    ...flattenTokens((token as marked.Tokens.Em).tokens, { ...context, italic: true })
                );
                break;
            case 'del':
                segments.push(
                    ...flattenTokens((token as marked.Tokens.Del).tokens, { ...context, strikethrough: true })
                );
                break;
            case 'codespan':
                segments.push({ text: (token as marked.Tokens.Codespan).text, ...context, code: true });
                break;
            case 'text':
                const tToken = token as marked.Tokens.Text;
                if (tToken.tokens) {
                    segments.push(...flattenTokens(tToken.tokens, context));
                } else {
                    segments.push({ text: tToken.text, ...context });
                }
                break;
            case 'link':
                const lToken = token as marked.Tokens.Link;
                if (lToken.tokens) {
                    segments.push(
                        ...flattenTokens(lToken.tokens, { ...context, link: lToken.href })
                    );
                } else {
                    segments.push({ text: lToken.text, ...context, link: lToken.href });
                }
                break;
            default: {
                const customToken = token as any;
                if (customToken.type === 'footnoteRef') {
                    // Footnote reference — rendered as superscript-style text
                    // The actual index is resolved later in parseMarkdownToBlocks
                    segments.push({
                        text: `[${customToken.id}]`,
                        ...context,
                        footnoteRef: { id: customToken.id, index: 0 },
                    });
                } else if (customToken.type === 'badge') {
                    segments.push({
                        text: customToken.label,
                        ...context,
                        badge: { label: customToken.label, color: customToken.color },
                    });
                } else if ('text' in token) {
                    segments.push({ text: (token as any).text, ...context });
                }
                break;
            }
        }
    }
    return segments;
}

// ─── List Helpers ──────────────────────────────────────────────────────────────

/** Maximum recursion depth for nested lists to prevent stack overflow from pathological input. */
const MAX_LIST_DEPTH = 10;

/**
 * Recursively flattens nested list items into a flat array of Blocks with depth annotations.
 * marked represents nesting via child list tokens inside ListItem.tokens arrays.
 *
 * @param items    - Array of ListItem tokens from a marked List
 * @param depth    - Current nesting depth (0 for top-level)
 * @param ordered  - Whether this list level is ordered
 * @param startNum - Starting number for ordered lists at this level
 * @returns Flat array of Block objects with depth annotations
 */
function flattenListItems(
    items: marked.Tokens.ListItem[],
    depth: number,
    ordered: boolean,
    startNum: number
): Block[] {
    if (depth > MAX_LIST_DEPTH) {
        console.warn(`[MarkDown For What] List nesting depth ${depth} exceeds maximum (${MAX_LIST_DEPTH}) — flattening remaining items`);
        return items.map((item, idx) => ({
            type: (ordered ? 'orderedListItem' : 'list') as Block['type'],
            content: item.text?.trim() ?? '',
            tokens: (item.tokens ?? []).filter(t => t.type !== 'list'),
            depth: 3,
            ...(ordered ? { index: startNum + idx } : {}),
        }));
    }

    const clampedDepth = Math.min(depth, 3);
    const result: Block[] = [];

    items.forEach((item, idx) => {
        // Extract only the non-list tokens for this item's content.
        // IMPORTANT: item.text includes text from nested children, so we
        // cannot use it directly. Instead, filter item.tokens to exclude
        // nested list tokens, then reconstruct content from those.
        const ownTokens = (item.tokens ?? []).filter(t => t.type !== 'list');
        const ownText = ownTokens.map(t => 'text' in t ? (t as any).text : t.raw).join('').trim();

        // Emit the item itself
        if (item.task) {
            result.push({
                type: 'taskListItem',
                content: ownText,
                tokens: ownTokens,
                depth: 0, // Plugin renders task lists flat (nesting not yet supported)
                checked: item.checked ?? false,
            });
        } else if (ordered) {
            result.push({
                type: 'orderedListItem',
                content: ownText,
                tokens: ownTokens,
                depth: clampedDepth,
                index: startNum + idx,
            });
        } else {
            result.push({
                type: 'list',
                content: ownText,
                tokens: ownTokens,
                depth: clampedDepth,
            });
        }

        // Recurse into any nested lists inside this item's tokens
        if (item.tokens) {
            for (const subToken of item.tokens) {
                if (subToken.type === 'list') {
                    const subList = subToken as marked.Tokens.List;
                    result.push(
                        ...flattenListItems(
                            subList.items,
                            depth + 1,
                            subList.ordered,
                            typeof subList.start === 'number' ? subList.start : 1
                        )
                    );
                }
            }
        }
    });

    return result;
}

// ─── Callout Detection ──────────────────────────────────────────────────────────

const CALLOUT_REGEX = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i;
const VALID_CALLOUT_TYPES = ['note', 'tip', 'important', 'warning', 'caution'] as const;
export type CalloutType = typeof VALID_CALLOUT_TYPES[number];

function parseCallout(text: string): { calloutType: CalloutType; body: string } | null {
    const match = text.match(CALLOUT_REGEX);
    if (!match) return null;
    const type = match[1].toLowerCase();
    if (!(VALID_CALLOUT_TYPES as readonly string[]).includes(type)) return null;
    const body = text.slice(match[0].length).replace(/^\n+/, '').trim();
    return { calloutType: type as CalloutType, body };
}

// ─── Footnote Extensions ────────────────────────────────────────────────────────

/**
 * Custom marked block extension for footnote definitions.
 * Matches patterns like: [^id]: Footnote text
 */
const footnoteDefExtension = {
    name: 'footnoteDef',
    level: 'block' as const,
    start(src: string) {
        return src.match(/^\[\^[^\]]+\]:/)?.index;
    },
    tokenizer(src: string) {
        const rule = /^\[\^([^\]]+)\]: (.+)/;
        const match = rule.exec(src);
        if (!match) return undefined;

        // Consume consecutive footnote definitions
        let consumed = '';
        let remaining = src;
        const defs: Array<{ id: string; text: string }> = [];

        while (remaining.length > 0) {
            const m = rule.exec(remaining);
            if (!m) break;
            defs.push({ id: m[1], text: m[2].trim() });
            consumed += m[0];
            remaining = remaining.slice(m[0].length);
            // Skip newlines between defs
            const nlMatch = remaining.match(/^\n+/);
            if (nlMatch) {
                consumed += nlMatch[0];
                remaining = remaining.slice(nlMatch[0].length);
            }
        }

        if (defs.length === 0) return undefined;

        return {
            type: 'footnoteDef',
            raw: consumed,
            defs,
        };
    },
    renderer() { return ''; },
};

/**
 * Custom marked inline extension for footnote references.
 * Matches [^id] within text.
 */
const footnoteRefExtension = {
    name: 'footnoteRef',
    level: 'inline' as const,
    start(src: string) {
        return src.match(/\[\^/)?.index;
    },
    tokenizer(src: string) {
        const rule = /^\[\^([^\]]+)\]/;
        const match = rule.exec(src);
        if (!match) return undefined;
        return {
            type: 'footnoteRef',
            raw: match[0],
            id: match[1],
        };
    },
    renderer() { return ''; },
};

// ─── Badge Inline Extension ─────────────────────────────────────────────────────

/**
 * Custom marked inline extension for badge pills.
 * Matches [badge:Label] or [badge:Label:color] within text.
 */
const badgeInlineExtension = {
    name: 'badge',
    level: 'inline' as const,
    start(src: string) {
        return src.match(/\[badge:/)?.index;
    },
    tokenizer(src: string) {
        const rule = /^\[badge:([^\]:\n]+?)(?::([^\]:\n]+?))?\]/;
        const match = rule.exec(src);
        if (!match) return undefined;
        return {
            type: 'badge',
            raw: match[0],
            label: match[1].trim(),
            color: match[2]?.trim(),
        };
    },
    renderer() { return ''; },
};

// ─── Definition List Extension ──────────────────────────────────────────────────

/**
 * Custom marked block extension for definition lists.
 * Matches patterns like:
 *   Term
 *   : Definition text
 *   : Another definition
 */
const definitionListExtension = {
    name: 'definitionList',
    level: 'block' as const,
    start(src: string) {
        return src.match(/^[^\n]+\n(?=: )/)?.index;
    },
    tokenizer(src: string) {
        // Match one or more term+definitions groups
        const rule = /^([^\n]+)\n((?:: [^\n]+\n?)+)/;
        const match = rule.exec(src);
        if (!match) return undefined;

        // Consume as many consecutive term+defs as possible
        let consumed = '';
        let remaining = src;
        const items: Array<{ term: string; definitions: string[] }> = [];

        while (remaining.length > 0) {
            const m = rule.exec(remaining);
            if (!m) break;
            const term = m[1].trim();
            const defsRaw = m[2];
            const defs = defsRaw
                .split('\n')
                .filter(line => line.startsWith(': '))
                .map(line => line.slice(2).trim());
            items.push({ term, definitions: defs });
            consumed += m[0];
            remaining = remaining.slice(m[0].length);
            // Skip blank lines between term-def groups
            const blankMatch = remaining.match(/^\n+/);
            if (blankMatch) {
                consumed += blankMatch[0];
                remaining = remaining.slice(blankMatch[0].length);
            }
        }

        if (items.length === 0) return undefined;

        return {
            type: 'definitionList',
            raw: consumed,
            items,
        };
    },
    renderer() { return ''; }, // Not used — we parse to Block[], not HTML
};

// Register all custom extensions
marked.use({ extensions: [definitionListExtension, footnoteDefExtension, footnoteRefExtension, badgeInlineExtension] });

// ─── Parse Options ──────────────────────────────────────────────────────────────

export interface ParseOptions {
    generateToc?: boolean;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Converts a raw Markdown string into an ordered array of Block objects.
 *
 * YAML front matter (--- ... ---) is stripped before parsing.
 * Each token from the marked lexer is mapped to a typed Block.
 * Inline images inside paragraphs are extracted into their own image Blocks.
 *
 * @param markdown - Raw Markdown string, may include YAML front matter
 * @returns Ordered array of Blocks ready to pass to renderer.ts
 *
 * @example
 * const blocks = parseMarkdownToBlocks('# Hello\n\nSome paragraph');
 * // → [{ type: 'heading', level: 1, content: 'Hello' }, { type: 'paragraph', ... }]
 */
export function parseMarkdownToBlocks(markdown: string, options?: ParseOptions): Block[] {
    const frontMatterRegex = /^---[\s\S]*?---\r?\n/;
    const frontMatterMatch = markdown.match(frontMatterRegex);

    // Check frontmatter for toc: true and tags
    let tocFromFrontmatter = false;
    let frontmatterTags: string[] = [];
    if (frontMatterMatch) {
        tocFromFrontmatter = /^toc:\s*true\s*$/m.test(frontMatterMatch[0]);
        // Extract tags from frontmatter: tags: [tag1, tag2, tag3]
        const tagsMatch = frontMatterMatch[0].match(/^tags:\s*\[([^\]]*)\]\s*$/m);
        if (tagsMatch) {
            frontmatterTags = tagsMatch[1].split(',').map(t => t.trim()).filter(t => t.length > 0);
        }
    }

    const cleanMarkdown = frontMatterMatch
        ? markdown.slice(frontMatterMatch[0].length)
        : markdown;

    let tokens: marked.TokensList;
    try {
        tokens = marked.lexer(cleanMarkdown);
    } catch (err) {
        throw new Error(`Failed to parse Markdown content — ${errorMessage(err)}`);
    }
    const blocks: Block[] = [];
    const footnoteDefinitions = new Map<string, string>();

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
                const calloutResult = parseCallout(bToken.text);
                if (calloutResult) {
                    blocks.push({
                        type: 'callout',
                        calloutType: calloutResult.calloutType,
                        content: calloutResult.body,
                        tokens: bToken.tokens,
                    });
                } else {
                    blocks.push({ type: 'quote', content: bToken.text });
                }
                break;
            }
            case 'list': {
                const listToken = token as marked.Tokens.List;
                blocks.push(
                    ...flattenListItems(
                        listToken.items,
                        0,
                        listToken.ordered,
                        typeof listToken.start === 'number' ? listToken.start : 1
                    )
                );
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
            default: {
                // Handle custom extension tokens (not in marked's token type union)
                const customToken = token as any;
                if (customToken.type === 'definitionList' && customToken.items) {
                    blocks.push({
                        type: 'definitionList',
                        definitions: customToken.items,
                    });
                } else if (customToken.type === 'footnoteDef' && customToken.defs) {
                    // Footnote definitions are collected; the footnoteSection is appended at the end
                    for (const def of customToken.defs) {
                        footnoteDefinitions.set(def.id, def.text);
                    }
                }
                // footnoteRef and badge inline tokens are handled by flattenTokens
                break;
            }
        }
    }

    // Generate frontmatter badge row at the top
    if (frontmatterTags.length > 0) {
        blocks.unshift({
            type: 'badgeRow',
            badges: frontmatterTags.map(tag => ({ label: tag })),
        });
    }

    // Collect inline badge tokens from blocks and create standalone badge rows
    // Inline badges within text are rendered by the inline style system;
    // this handles badge-only paragraphs as a badge row block.

    // Generate footnote section at the end if there are footnote definitions
    if (footnoteDefinitions.size > 0) {
        // Scan blocks for footnote references to determine ordering
        const referencedIds: string[] = [];
        for (const block of blocks) {
            if (block.tokens) {
                const segments = flattenTokens(block.tokens, DEFAULT_FLATTEN_CONTEXT);
                for (const seg of segments) {
                    if (seg.footnoteRef && !referencedIds.includes(seg.footnoteRef.id)) {
                        referencedIds.push(seg.footnoteRef.id);
                    }
                }
            }
        }
        // Add any unreferenced definitions at the end
        for (const id of Array.from(footnoteDefinitions.keys())) {
            if (!referencedIds.includes(id)) {
                referencedIds.push(id);
            }
        }

        const footnotes = referencedIds
            .filter(id => footnoteDefinitions.has(id))
            .map((id, idx) => ({
                id,
                index: idx + 1,
                text: footnoteDefinitions.get(id)!,
            }));

        if (footnotes.length > 0) {
            // Update footnoteRef indices in blocks' segments to match actual ordering
            // (This is resolved at render time via the footnotes array)
            blocks.push({ type: 'separator' });
            blocks.push({
                type: 'footnoteSection',
                footnotes,
            });
        }
    }

    // Generate TOC if requested via option or frontmatter
    const shouldGenerateToc = options?.generateToc || tocFromFrontmatter;
    if (shouldGenerateToc) {
        const headings = blocks.filter(b => b.type === 'heading');
        if (headings.length > 0) {
            const tocBlock: Block = {
                type: 'toc',
                tocEntries: headings.map(h => ({ text: h.content ?? '', level: h.level ?? 1 })),
            };
            blocks.unshift(tocBlock);
        }
    }

    return blocks;
}

// CommonJS export shim — allows Jest (require()) and webpack (import) to both work
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseMarkdownToBlocks, extractImagesFromTokens, flattenTokens, DEFAULT_FLATTEN_CONTEXT };
}

