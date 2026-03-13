/**
 * exporter.ts
 *
 * Figma → Markdown export pipeline.
 *
 * Stages:
 *   1. inferBlocksFromFrame  — walk layer tree, produce InferredBlock[]
 *   2. diffBlocks            — compare inferred vs stored source blocks
 *   3. assembleMarkdown      — merge diff result into final Markdown string
 *
 * This module only reads existing Figma nodes — no rendering occurs here.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type BlockType =
    | 'heading-1' | 'heading-2' | 'heading-3' | 'heading-other'
    | 'paragraph' | 'code' | 'quote'
    | 'list' | 'listGroup' | 'listItem'
    | 'separator' | 'image' | 'table' | 'toc' | 'callout'
    | 'definitionList' | 'footnoteSection' | 'badgeRow' | 'mermaid' | 'math';

export interface InferredBlock {
    text: string;
    blockType: BlockType;
    label: string;
    fidelityWarning?: string;
}

export type ExportBlock =
    | { state: 'unchanged'; originalText: string;  inferredText: string }
    | { state: 'modified';  originalText: string;  inferredText: string; fidelityWarning?: string }
    | { state: 'new';                              inferredText: string; fidelityWarning?: string };

export interface ExportFrameResult {
    frameId: string;
    filename: string;
    hasStoredSource: boolean;
    sourceTruncated: boolean;
    blocks: ExportBlock[];
    skippedLayers: Array<{ name: string; reason: string }>;
}

export interface BlockSelection {
    blockIndex: number;
    useOriginal: boolean;
}

// ─── Helpers (exported for testing) ──────────────────────────────────────────

/** Strips leading/trailing whitespace and collapses internal runs to one space. */
export function normalizeContent(text: string): string {
    return text.trim().replace(/\s+/g, ' ');
}

/** Produces a stable fingerprint: "type:normalizedContent" */
export function fingerprintBlock(blockType: BlockType, content: string): string {
    return `${blockType}:${normalizeContent(content)}`;
}

// ─── Style name → block type mapping ─────────────────────────────────────────

const STYLE_TO_BLOCK: Record<string, { blockType: BlockType; label: string; prefix: string }> = {
    'Markdown/H1':    { blockType: 'heading-1', label: 'Heading 1',  prefix: '# '  },
    'Markdown/H2':    { blockType: 'heading-2', label: 'Heading 2',  prefix: '## ' },
    'Markdown/H3':    { blockType: 'heading-3', label: 'Heading 3',  prefix: '### '},
    'Markdown/Body':  { blockType: 'paragraph', label: 'Paragraph',  prefix: ''    },
    'Markdown/Code':  { blockType: 'code',      label: 'Code Block', prefix: ''    },
    'Markdown/Quote': { blockType: 'quote',     label: 'Blockquote', prefix: '> '  },
    'Markdown/List':  { blockType: 'list',      label: 'List Item',  prefix: '- '  },
};

const FRAME_NAME_TO_BLOCK: Record<string, BlockType> = {
    'Table':             'table',
    'List Group':        'listGroup',
    'Table of Contents': 'toc',
    'Definition List':   'definitionList',
    'Footnotes':         'footnoteSection',
    'Badge Row':         'badgeRow',
    'Mermaid Diagram':   'mermaid',
    'Math Block':        'math',
};

// ─── Inference ────────────────────────────────────────────────────────────────

interface InferenceResult {
    blocks: InferredBlock[];
    skippedLayers: Array<{ name: string; reason: string }>;
}

export async function inferBlocksFromFrame(frame: any): Promise<InferenceResult> {
    const blocks: InferredBlock[] = [];
    const skippedLayers: Array<{ name: string; reason: string }> = [];

    for (const child of (frame.children ?? [])) {
        const skippedBefore = skippedLayers.length;
        const inferred = await inferNode(child, skippedLayers);
        if (inferred) {
            blocks.push(inferred);
        } else if (skippedLayers.length === skippedBefore) {
            // inferNode returned null without adding to skippedLayers — add generic entry
            skippedLayers.push({ name: child.name || '(unnamed)', reason: 'Unrecognized layer type or name' });
        }
    }

    return { blocks, skippedLayers };
}

async function inferNode(node: any, skippedLayers?: Array<{ name: string; reason: string }>): Promise<InferredBlock | null> {
    if (node.type === 'RECTANGLE' && node.height === 1) {
        return { text: '---', blockType: 'separator', label: 'Separator' };
    }

    if (node.type === 'RECTANGLE' && node.height > 1 &&
        Array.isArray(node.fills) && node.fills[0]?.type === 'IMAGE') {
        return {
            text: `![${node.name || 'image'}](image-not-recoverable)`,
            blockType: 'image',
            label: 'Image',
            fidelityWarning: 'Image URL not recoverable — update the URL manually after export.',
        };
    }

    if (node.type === 'TEXT') return inferTextNode(node, skippedLayers);
    if (node.type === 'FRAME') return inferFrameNode(node);

    return null;
}

async function inferTextNode(node: any, skippedLayers?: Array<{ name: string; reason: string }>): Promise<InferredBlock | null> {
    const styleId = await node.getTextStyleIdAsync();
    if (styleId === (figma as any).mixed) {
        skippedLayers?.push({ name: node.name || '(unnamed)', reason: 'Mixed text styles not supported' });
        return null;
    }
    const style = styleId ? await figma.getStyleByIdAsync(styleId) : null;
    const styleName: string = (style as any)?.name ?? '';
    const mapping = STYLE_TO_BLOCK[styleName as keyof typeof STYLE_TO_BLOCK];
    if (!mapping) {
        skippedLayers?.push({
            name: node.name || '(unnamed)',
            reason: `Text style "${styleName}" is not a Markdown/* style`,
        });
        return null;
    }

    const text = node.characters as string;
    if (mapping.blockType === 'code') {
        return { text: `\`\`\`\n${text}\n\`\`\``, blockType: 'code', label: 'Code Block' };
    }
    return { text: mapping.prefix + text, blockType: mapping.blockType, label: mapping.label };
}

async function inferFrameNode(node: any): Promise<InferredBlock | null> {
    const blockType = FRAME_NAME_TO_BLOCK[node.name];

    if (!blockType) {
        if (node.name?.startsWith('Callout: ')) return inferCalloutFrame(node);
        return null;
    }

    switch (blockType) {
        case 'table':           return inferTableFrame(node);
        case 'listGroup':       return inferListGroupFrame(node);
        case 'mermaid':         return inferMermaidFrame(node);
        case 'math':            return inferMathFrame(node);
        case 'definitionList':  return inferDefinitionListFrame(node);
        case 'footnoteSection': return inferFootnotesFrame(node);
        case 'badgeRow':        return inferBadgeRowFrame(node);
        case 'toc':
            return {
                text: '',
                blockType: 'toc',
                label: 'Table of Contents',
                fidelityWarning: 'TOC is auto-generated on re-import — skipped in export output.',
            };
        default: return null;
    }
}

function inferMermaidFrame(node: any): InferredBlock {
    const source: string = node.getPluginData('mermaidSource');
    return {
        text: `\`\`\`mermaid\n${source}\n\`\`\``,
        blockType: 'mermaid',
        label: 'Mermaid Diagram',
        fidelityWarning: source.length === 0 ? 'Mermaid source not recoverable — original source used if available.' : undefined,
    };
}

function inferMathFrame(node: any): InferredBlock {
    const source: string = node.getPluginData('mathSource');
    return {
        text: `$$\n${source}\n$$`,
        blockType: 'math',
        label: 'Math Block',
        fidelityWarning: source.length === 0 ? 'Math source not recoverable — original source used if available.' : undefined,
    };
}

function inferCalloutFrame(node: any): InferredBlock {
    const typeLabel = node.name.replace('Callout: ', '').toUpperCase();
    const bodyLines: string[] = [];
    for (const child of (node.children ?? [])) {
        if (child.type === 'TEXT' && child.characters) {
            bodyLines.push(`> ${child.characters}`);
        }
    }
    return {
        text: `> [!${typeLabel}]\n${bodyLines.join('\n')}`,
        blockType: 'callout',
        label: `Callout (${typeLabel})`,
    };
}

async function inferListGroupFrame(node: any): Promise<InferredBlock> {
    const lines: string[] = [];
    for (const child of (node.children ?? [])) {
        if (child.type === 'TEXT') {
            lines.push(`- ${child.characters}`);
        } else if (child.type === 'FRAME') {
            for (const grandchild of (child.children ?? [])) {
                if (grandchild.type === 'TEXT' && grandchild.characters) {
                    const isChecked = child.name === 'Task (done)';
                    lines.push(`- [${isChecked ? 'x' : ' '}] ${grandchild.characters}`);
                    break;
                }
            }
        }
    }
    return { text: lines.join('\n'), blockType: 'listGroup', label: 'List' };
}

function inferTableFrame(node: any): InferredBlock {
    const rows: string[][] = [];
    for (const child of (node.children ?? [])) {
        const rowCells: string[] = [];
        for (const cell of (child.children ?? [])) {
            const textNode = (cell.children ?? []).find((n: any) => n.type === 'TEXT');
            rowCells.push(textNode?.characters ?? '');
        }
        if (rowCells.length > 0) rows.push(rowCells);
    }
    if (rows.length === 0) return { text: '', blockType: 'table', label: 'Table', fidelityWarning: 'Empty table — no content to export' };
    const toRow = (cells: string[]) => `| ${cells.join(' | ')} |`;
    const sep = rows[0].map(() => '---');
    return {
        text: [toRow(rows[0]), toRow(sep), ...rows.slice(1).map(toRow)].join('\n'),
        blockType: 'table',
        label: 'Table',
    };
}

function inferDefinitionListFrame(node: any): InferredBlock {
    const lines: string[] = [];
    const texts = (node.children ?? []).filter((n: any) => n.type === 'TEXT');
    for (let i = 0; i < texts.length; i += 2) {
        if (texts[i]) lines.push(texts[i].characters);
        if (texts[i + 1]) lines.push(`: ${texts[i + 1].characters}`);
    }
    return { text: lines.join('\n'), blockType: 'definitionList', label: 'Definition List' };
}

function inferFootnotesFrame(node: any): InferredBlock {
    const lines: string[] = [];
    const texts = (node.children ?? []).filter((n: any) => n.type === 'TEXT');
    texts.forEach((t: any, i: number) => { lines.push(`[^${i + 1}]: ${t.characters}`); });
    return { text: lines.join('\n'), blockType: 'footnoteSection', label: 'Footnotes' };
}

function inferBadgeRowFrame(node: any): InferredBlock {
    const badges = (node.children ?? [])
        .filter((c: any) => c.name?.startsWith('Badge: '))
        .map((c: any) => `[badge:${c.name.replace('Badge: ', '')}]`);
    return { text: badges.join(' '), blockType: 'badgeRow', label: 'Badge Row' };
}

// ─── Diff and Merge ───────────────────────────────────────────────────────────

/**
 * Heuristic: infer block type from Markdown text prefix, for fingerprinting
 * source lines that were not produced by the inference engine.
 */
function guessBlockType(text: string): BlockType {
    if (text.startsWith('# '))   return 'heading-1';
    if (text.startsWith('## '))  return 'heading-2';
    if (text.startsWith('### ')) return 'heading-3';
    if (text.startsWith('> [!')) return 'callout';
    if (text.startsWith('> '))   return 'quote';
    if (text.startsWith('- ') || /^\d+\. /.test(text)) return 'list';
    if (text.startsWith('---'))  return 'separator';
    if (text.startsWith('```mermaid')) return 'mermaid';
    if (text.startsWith('```'))  return 'code';
    if (text.startsWith('$$'))   return 'math';
    if (text.startsWith('|'))    return 'table';
    if (/^#{4,6} /.test(text)) return 'heading-other';  // h4-h6 not rendered, but classifiable
    return 'paragraph';
}

/**
 * Diffs source Markdown strings against inferred blocks using content-hash
 * matching with position+type as fallback.
 *
 * Uses a pre-pass to reserve source indices for content-hash matches before
 * running the position fallback, preventing the fallback from consuming an
 * index needed by a later hash match.
 *
 * @param sourceLines - Markdown strings from stored pluginData, split by double-newline.
 * @param inferredBlocks - Output of inferBlocksFromFrame.
 */
export function diffBlocks(sourceLines: string[], inferredBlocks: InferredBlock[]): ExportBlock[] {
    // Build fingerprint → available source indices map
    const sourceByFingerprint = new Map<string, number[]>();
    for (let i = 0; i < sourceLines.length; i++) {
        const line = sourceLines[i];
        const type = guessBlockType(line);
        const fp = fingerprintBlock(type, line);
        const existing = sourceByFingerprint.get(fp);
        if (existing) {
            existing.push(i);
        } else {
            sourceByFingerprint.set(fp, [i]);
        }
    }

    // Pre-compute which source indices will be claimed by content-hash matches,
    // so the position fallback does not steal them. Without this, the position
    // fallback could consume a source index that a later content-hash match needs,
    // producing a spurious 'modified' instead of 'unchanged'.
    const reservedForContentHash = new Set<number>();
    {
        const tempUsed = new Set<number>();
        for (const inferred of inferredBlocks) {
            const fp = fingerprintBlock(inferred.blockType, inferred.text);
            const indices = sourceByFingerprint.get(fp);
            if (indices) {
                for (let k = 0; k < indices.length; k++) {
                    if (!tempUsed.has(indices[k])) {
                        reservedForContentHash.add(indices[k]);
                        tempUsed.add(indices[k]);
                        break;
                    }
                }
            }
        }
    }

    const usedSourceIndices = new Set<number>();
    const result: ExportBlock[] = [];

    for (let j = 0; j < inferredBlocks.length; j++) {
        const inferred = inferredBlocks[j];
        const fp = fingerprintBlock(inferred.blockType, inferred.text);
        const indices = sourceByFingerprint.get(fp);

        // Find first unused source index with matching fingerprint
        let matchedSourceIndex: number | undefined;
        if (indices) {
            for (let k = 0; k < indices.length; k++) {
                if (!usedSourceIndices.has(indices[k])) {
                    matchedSourceIndex = indices[k];
                    usedSourceIndices.add(matchedSourceIndex);
                    break;
                }
            }
        }

        if (matchedSourceIndex !== undefined) {
            // Content-hash match — unchanged
            const originalText = sourceLines[matchedSourceIndex];
            result.push({ state: 'unchanged', originalText, inferredText: inferred.text });
        } else {
            // No content match — try position fallback, but only if not reserved for a later content-hash match
            const sourceAtPosition = sourceLines[j];
            if (
                sourceAtPosition !== undefined &&
                !usedSourceIndices.has(j) &&
                !reservedForContentHash.has(j) &&
                guessBlockType(sourceAtPosition) === inferred.blockType
            ) {
                usedSourceIndices.add(j);
                result.push({
                    state: 'modified',
                    originalText: sourceAtPosition,
                    inferredText: inferred.text,
                    fidelityWarning: inferred.fidelityWarning,
                });
            } else {
                result.push({
                    state: 'new',
                    inferredText: inferred.text,
                    fidelityWarning: inferred.fidelityWarning,
                });
            }
        }
    }

    return result;
}

/**
 * Merges DiffBlocks into a final Markdown string.
 *
 * Defaults per state:
 *   unchanged → originalText (preserves inline links, footnotes, etc.)
 *   modified  → originalText (conservative; user can override in review mode)
 *   new       → inferredText (include by default)
 *
 * For 'new' blocks: useOriginal = true means "skip this block".
 * Blocks are joined with a single blank line between them.
 */
export function assembleMarkdown(blocks: ExportBlock[], selections: BlockSelection[] = []): string {
    const selMap = new Map(selections.map(s => [s.blockIndex, s.useOriginal]));
    const lines: string[] = [];

    for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        const override = selMap.get(i);
        let text: string;

        if (block.state === 'unchanged') {
            text = block.originalText;
        } else if (block.state === 'modified') {
            const useOriginal = override !== undefined ? override : true;
            text = useOriginal ? block.originalText : block.inferredText;
        } else {
            if (override === true) continue;
            text = block.inferredText;
        }

        if (text.trim().length > 0) lines.push(text);
    }

    return lines.join('\n\n');
}

/**
 * Runs the full 3-stage export pipeline for a single Figma FrameNode.
 * Returns an ExportFrameResult ready to send to the UI via postMessage.
 */
export async function exportFrame(frame: any): Promise<ExportFrameResult> {
    const frameId: string = frame.id;
    const storedSource: string = frame.getPluginData('markdownSource');
    const storedFilename: string = frame.getPluginData('markdownFilename');
    const sourceTruncated: boolean = frame.getPluginData('markdownSourceTruncated') === 'true';
    const hasStoredSource: boolean = storedSource.length > 0 || sourceTruncated;

    const rawFilename = storedFilename || frame.name || 'export';
    const filename = rawFilename.replace(/\.md$/i, '') + '.md';

    const { blocks: inferredBlocks, skippedLayers } = await inferBlocksFromFrame(frame);

    let diffResult: ExportBlock[];

    if (hasStoredSource) {
        const sourceLines = storedSource
            .split(/\n\n+/)
            .map((s: string) => s.trim())
            .filter((s: string) => s.length > 0);
        diffResult = diffBlocks(sourceLines, inferredBlocks);
    } else {
        diffResult = inferredBlocks.map(b => ({
            state: 'new' as const,
            inferredText: b.text,
            fidelityWarning: b.fidelityWarning,
        }));
    }

    return { frameId, filename, hasStoredSource, sourceTruncated, blocks: diffResult, skippedLayers };
}
