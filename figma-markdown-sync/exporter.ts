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

export interface InferredBlock {
    text: string;
    blockType: string;
    label: string;
    fidelityWarning?: string;
}

export interface DiffBlock {
    state: 'unchanged' | 'modified' | 'new';
    originalText?: string;
    inferredText: string;
    label: string;
    fidelityWarning?: string;
}

export interface ExportFrameResult {
    frameId: string;
    filename: string;
    hasStoredSource: boolean;
    sourceTruncated: boolean;
    blocks: DiffBlock[];
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
export function fingerprintBlock(blockType: string, content: string): string {
    return `${blockType}:${normalizeContent(content)}`;
}

// ─── Style name → block type mapping ─────────────────────────────────────────

const STYLE_TO_BLOCK: Record<string, { blockType: string; label: string; prefix: string }> = {
    'Markdown/H1':    { blockType: 'heading-1', label: 'Heading 1',  prefix: '# '  },
    'Markdown/H2':    { blockType: 'heading-2', label: 'Heading 2',  prefix: '## ' },
    'Markdown/H3':    { blockType: 'heading-3', label: 'Heading 3',  prefix: '### '},
    'Markdown/Body':  { blockType: 'paragraph', label: 'Paragraph',  prefix: ''    },
    'Markdown/Code':  { blockType: 'code',      label: 'Code Block', prefix: ''    },
    'Markdown/Quote': { blockType: 'quote',     label: 'Blockquote', prefix: '> '  },
    'Markdown/List':  { blockType: 'list',      label: 'List Item',  prefix: '- '  },
};

const FRAME_NAME_TO_BLOCK: Record<string, string> = {
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
        const inferred = await inferNode(child);
        if (inferred) {
            blocks.push(inferred);
        } else {
            skippedLayers.push({ name: child.name || '(unnamed)', reason: 'Unrecognized layer type or name' });
        }
    }

    return { blocks, skippedLayers };
}

async function inferNode(node: any): Promise<InferredBlock | null> {
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

    if (node.type === 'TEXT') return inferTextNode(node);
    if (node.type === 'FRAME') return inferFrameNode(node);

    return null;
}

async function inferTextNode(node: any): Promise<InferredBlock | null> {
    const styleId = await node.getTextStyleIdAsync();
    const style = styleId ? await figma.getStyleByIdAsync(styleId) : null;
    const styleName: string = (style as any)?.name ?? '';
    const mapping = STYLE_TO_BLOCK[styleName];
    if (!mapping) return null;

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
    if (rows.length === 0) return { text: '', blockType: 'table', label: 'Table' };
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

// ─── Placeholder stubs (implemented in later tasks) ──────────────────────────

export function diffBlocks(_sourceLines: string[], _inferredBlocks: InferredBlock[]): DiffBlock[] {
    throw new Error('diffBlocks not yet implemented');
}

export function assembleMarkdown(_blocks: DiffBlock[], _selections: BlockSelection[]): string {
    throw new Error('assembleMarkdown not yet implemented');
}
