import './styles.css';
import './components/mfw-index';

// Bottom-bar slot elements — assigned by initBottomBar() once the custom element is defined and connected
let statusEl: HTMLElement;
let previewCancelBtn: HTMLButtonElement;
let importBtn: HTMLButtonElement;

function initBottomBar(): void {
    const bar = document.querySelector('mfw-bottom-bar') as HTMLElement | null;
    if (!bar) return;

    const statusSlot = bar.querySelector('[data-slot="status"]') as HTMLElement | null;
    const actionsSlot = bar.querySelector('[data-slot="actions"]') as HTMLElement | null;
    if (!statusSlot || !actionsSlot) return;

    statusEl = document.createElement('mfw-status');
    statusSlot.appendChild(statusEl);

    previewCancelBtn = document.createElement('button');
    previewCancelBtn.className = 'btn-secondary hidden';
    previewCancelBtn.textContent = 'Cancel';
    actionsSlot.appendChild(previewCancelBtn);

    importBtn = document.createElement('button');
    importBtn.className = 'btn-primary';
    importBtn.disabled = true;
    importBtn.textContent = 'Import';
    actionsSlot.appendChild(importBtn);

    // Wire event listeners that depend on bottom-bar elements
    importBtn.addEventListener('click', () => {
        if (currentFiles.length === 0) return;
        loader.setAttribute('visible', '');
        importBtn.disabled = true;

        // Collect unchecked block indices per file
        const excludedBlocks: Record<number, number[]> = {};
        const checkboxes = previewContent.querySelectorAll<HTMLInputElement>('.preview-block-checkbox');
        checkboxes.forEach(cb => {
            if (!cb.checked) {
                const fi = Number(cb.dataset.fileIndex ?? 0);
                const bi = Number(cb.dataset.blockIndex ?? 0);
                if (!excludedBlocks[fi]) excludedBlocks[fi] = [];
                excludedBlocks[fi].push(bi);
            }
        });

        parent.postMessage({
            pluginMessage: {
                type: MSG_IMPORT_BATCH,
                files: currentFiles,
                excludedBlocks,
            }
        }, '*');
    });

    previewCancelBtn.addEventListener('click', () => {
        hidePreview();
        currentFiles = [];
        renderFileList([]);
        showStatus('', 'success');
        importBtn.disabled = true;
    });
}

initBottomBar();

function initErrorIconContainer(): void {
  const container = document.getElementById('error-icon-container');
  if (!container) return;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '24');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'currentColor');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z');
  svg.appendChild(path);
  container.appendChild(svg);
}
initErrorIconContainer();

function showImportError(invalidFiles: { name: string; ext: string }[]): void {
  document.getElementById('import-normal-state')?.classList.add('hidden');
  document.getElementById('import-error-state')?.classList.remove('hidden');

  const errorFileList = document.getElementById('error-file-list') as HTMLElement & { setFiles(f: any[]): void } | null;
  errorFileList?.setFiles(invalidFiles.map(f => ({
    name: f.name,
    meta: `unsupported format — ${f.ext}`,
  })));
}

function hideImportError(): void {
  document.getElementById('import-normal-state')?.classList.remove('hidden');
  document.getElementById('import-error-state')?.classList.add('hidden');
}

document.querySelector('#import-error-state mfw-button')
  ?.addEventListener('click', hideImportError);

import { marked } from 'marked';
import { isValidHex, hasSupportedExtension } from '../utils';
import {
    MSG_GET_SETTINGS, MSG_SAVE_SETTINGS, MSG_RESET_SETTINGS,
    MSG_GET_LOCAL_STYLES, MSG_GET_LOCAL_COMPONENTS,
    MSG_GET_HISTORY, MSG_CLEAR_HISTORY, MSG_IMPORT_BATCH,
    MSG_STATUS, MSG_SETTINGS, MSG_LOCAL_STYLES, MSG_LOCAL_COMPONENTS, MSG_HISTORY,
    MSG_EXPORT_REQUEST, MSG_EXPORT_DOWNLOAD, MSG_GET_SELECTION,
    MSG_EXPORT_RESULT, MSG_EXPORT_MARKDOWN, MSG_SELECTION_CHANGED,
    STATUS_DOMAIN_EXPORT,
} from '../messages';
import type { ExportBlock, BlockSelection, ExportFrameResult } from '../exporter';

function escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const FRONT_MATTER_REGEX = /^---[\s\S]*?---\r?\n/;

// Sanitize marked output: escape raw HTML blocks and inline HTML to prevent XSS
marked.use({
    renderer: {
        html(text: string): string {
            return escapeHtml(text);
        },
    },
});

// ── DOM references ──────────────────────────────────────────────────────────

const tabBar = document.querySelector('mfw-tab-bar') as HTMLElement;
const loader = document.querySelector('mfw-loader') as HTMLElement;

const importSection = document.getElementById('import-section') as HTMLElement;
const dropZone = document.getElementById('drop-zone') as HTMLElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const fileListEl = document.querySelector('mfw-file-list') as HTMLElement & {
    setFiles(files: Array<{ name: string }>): void;
};

// Preview elements
const previewPane = document.getElementById('preview-pane') as HTMLElement;
const previewContent = document.getElementById('preview-content') as HTMLElement;
const previewSummary = document.getElementById('preview-summary') as HTMLElement;
const selectAllBtn = document.getElementById('select-all-btn') as HTMLButtonElement;
const deselectAllBtn = document.getElementById('deselect-all-btn') as HTMLButtonElement;

// Paste section
const pasteSectionEl = document.querySelector('mfw-paste-section') as HTMLElement & { reset(): void };

// Settings inputs
const settingInputIds = [
    'blockSpacing', 'listSpacing', 'framePadding', 'widthMode', 'customWidth',
    'codeBackground', 'tableHeaderBackground', 'separatorColor', 'frameFillColor',
] as const;

const checkboxSettingIds = ['generateToc', 'componentNames'] as const;

// Theme selector
const themeSelectorEl = document.querySelector('mfw-theme-selector') as HTMLElement;

// Style binding selects
const styleBindingSelects = document.querySelectorAll<HTMLSelectElement>('.style-binding-select');

// Component binding selects
const componentBindingSelects = document.querySelectorAll<HTMLSelectElement>('.component-binding-select');

// Export tab elements
const exportNoSelection      = document.getElementById('export-no-selection') as HTMLElement;
const exportFrameSummary     = document.getElementById('export-frame-summary') as HTMLElement;
const exportFrameInfo        = document.getElementById('export-frame-info') as HTMLElement;
const exportBlockCounts      = document.getElementById('export-block-counts') as HTMLElement;
const exportTruncatedWarning = document.getElementById('export-truncated-warning') as HTMLElement;
const exportBtn              = document.getElementById('export-btn') as HTMLButtonElement;
const exportReviewBtn        = document.getElementById('export-review-btn') as HTMLButtonElement;
const exportReviewPanel      = document.getElementById('export-review-panel') as HTMLElement;
const exportReviewBreadcrumb = document.getElementById('export-review-breadcrumb') as HTMLElement;
const exportReviewBlocks     = document.getElementById('export-review-blocks') as HTMLElement;
const exportReviewBack       = document.getElementById('export-review-back') as HTMLButtonElement;
const exportConfirmBtn       = document.getElementById('export-confirm-btn') as HTMLButtonElement;
const exportLogPanel         = document.getElementById('export-log-panel') as HTMLElement;
const exportLogContent       = document.getElementById('export-log-content') as HTMLElement;

// After DOM refs are established
if (!tabBar || !loader || !pasteSectionEl || !fileListEl || !themeSelectorEl) {
    console.error('[MFW] One or more critical elements missing from DOM. Check shell template and build:html output.');
}

// Theme presets (duplicated from settings.ts — UI runs in a separate iframe bundle).
// IMPORTANT: Keep in sync with THEME_PRESETS in settings.ts.
// NOTE: ThemeId in mfw-theme-selector.ts lists valid theme ids; ensure both stay aligned.
const THEME_PRESETS: Record<string, Record<string, unknown>> = {
    'minimal-light': {
        frameFillColor: '#FFFFFF', codeBackground: '#F2F2F2',
        tableHeaderBackground: '#F2F2F7', separatorColor: '#CCCCCC',
        blockSpacing: 16, listSpacing: 6, framePadding: 40,
    },
    'dark-mode': {
        frameFillColor: '#1E1E1E', codeBackground: '#2D2D2D',
        tableHeaderBackground: '#2D2D2D', separatorColor: '#404040',
        blockSpacing: 16, listSpacing: 6, framePadding: 40,
    },
    'documentation': {
        frameFillColor: '#FFFFFF', codeBackground: '#F6F8FA',
        tableHeaderBackground: '#F6F8FA', separatorColor: '#D0D7DE',
        blockSpacing: 8, listSpacing: 4, framePadding: 24,
    },
};

// ── State ───────────────────────────────────────────────────────────────────

let currentFiles: { name: string; content: string }[] = [];

// Export state
let exportFrameResults: ExportFrameResult[] = [];
let exportReviewSelections: Map<number, Map<number, 'use-original' | 'use-inferred' | 'skip'>> = new Map();
let exportCurrentFrameIndex = 0;
let pendingDownloadIndex = 0;
let downloadBatchId = 0;
const DOWNLOAD_STAGGER_MS = 300; // delay between triggering successive file downloads to avoid browser download-manager throttling

// ── Export UI helpers ────────────────────────────────────────────────────────

function showExportNoSelection() {
    exportNoSelection.hidden = false;
    exportFrameSummary.hidden = true;
    exportReviewPanel.hidden = true;
}

function renderExportSummary(frames: ExportFrameResult[]) {
    const incomingIds = frames.map(f => f.frameId).join(',');
    const currentIds  = exportFrameResults.map(f => f.frameId).join(',');
    if (incomingIds !== currentIds) {
        exportReviewSelections = new Map();
    }
    exportFrameResults = frames;
    exportNoSelection.hidden = true;
    exportReviewPanel.hidden = true;

    if (frames.length === 0) { showExportNoSelection(); return; }

    exportFrameSummary.hidden = false;
    const frame = frames[0];

    exportFrameInfo.textContent = frames.length === 1
        ? `"${frame.filename.replace('.md', '')}"`
        : `${frames.length} frames selected`;

    exportTruncatedWarning.hidden = !frames.some(f => f.sourceStatus === 'truncated');

    const unchanged = frames.reduce((n, f) => n + f.blocks.filter(b => b.state === 'unchanged').length, 0);
    const modified  = frames.reduce((n, f) => n + f.blocks.filter(b => b.state === 'modified').length, 0);
    const added     = frames.reduce((n, f) => n + f.blocks.filter(b => b.state === 'new').length, 0);

    if (frame.sourceStatus === 'none' && frames.length === 1) {
        exportFrameInfo.textContent = 'No import history found.';

        const countText = added === 0
            ? 'No Markdown content detected. This frame may not use Markdown/* styles.'
            : `${added} block${added !== 1 ? 's' : ''} inferred`;
        exportBlockCounts.textContent = `Inference works best on frames using Markdown/* text styles. Other frames may produce few or no blocks.\n\n${countText}`;

        exportBtn.disabled = added === 0;
        exportReviewBtn.hidden = true;
    } else {
        const parts = [
            unchanged > 0 ? `${unchanged} unchanged ✓` : '',
            modified  > 0 ? `${modified} modified ↻`  : '',
            added     > 0 ? `${added} added +`         : '',
        ].filter(Boolean);
        exportBlockCounts.textContent = parts.join('  ');
        exportBtn.disabled = false;
        exportBtn.textContent = frames.length > 1 ? `Export all (${frames.length} files)` : 'Export .md';
        exportReviewBtn.hidden = (modified + added) === 0;
    }
}

function renderReviewPanel(frameIndex: number) {
    exportCurrentFrameIndex = frameIndex;
    const frame = exportFrameResults[frameIndex];
    if (!frame) return;

    exportFrameSummary.hidden = true;
    exportReviewPanel.hidden = false;

    if (exportFrameResults.length > 1) {
        exportReviewBreadcrumb.textContent = `Frame ${frameIndex + 1} of ${exportFrameResults.length}: ${frame.filename}`;
        exportReviewBreadcrumb.hidden = false;
    } else {
        exportReviewBreadcrumb.hidden = true;
    }

    // Clear existing content using safe DOM method
    while (exportReviewBlocks.firstChild) exportReviewBlocks.removeChild(exportReviewBlocks.firstChild);

    const reviewable = frame.blocks.filter(b => b.state !== 'unchanged');
    const frameSelections = exportReviewSelections.get(frameIndex) ?? new Map<number, 'use-original' | 'use-inferred' | 'skip'>();

    reviewable.forEach(block => {
        const blockIndex = frame.blocks.indexOf(block);
        const defaultAction: 'use-original' | 'use-inferred' | 'skip' = block.state === 'modified' ? 'use-original' : 'use-inferred';
        const currentAction = frameSelections.get(blockIndex) ?? defaultAction;

        const el = document.createElement('div');
        el.className = `review-block review-block--${block.state}`;

        const header = document.createElement('div');
        header.className = 'review-block-header';
        const stateIcon = block.state === 'modified' ? '↻' : '+';
        const stateLabel = block.state === 'modified' ? 'modified' : 'added';
        header.textContent = `${stateIcon} ${stateLabel}`;
        el.appendChild(header);

        if (block.fidelityWarning) {
            const warn = document.createElement('div');
            warn.className = 'review-fidelity-warning';
            warn.textContent = `⚠ ${block.fidelityWarning}`;
            el.appendChild(warn);
        }

        // Diff panes
        const diff = document.createElement('div');
        diff.className = 'review-diff';

        if (block.state === 'modified') {
            const origCol = document.createElement('div');
            origCol.className = 'review-diff-col';
            const origLabel = document.createElement('div');
            origLabel.className = 'review-diff-header';
            origLabel.textContent = 'Original';
            const origPre = document.createElement('pre');
            origPre.className = 'review-diff-text';
            origPre.textContent = block.originalText;
            origCol.appendChild(origLabel);
            origCol.appendChild(origPre);
            diff.appendChild(origCol);
        }

        const currCol = document.createElement('div');
        currCol.className = 'review-diff-col';
        const currLabel = document.createElement('div');
        currLabel.className = 'review-diff-header';
        currLabel.textContent = 'Current';
        const currPre = document.createElement('pre');
        currPre.className = 'review-diff-text';
        currPre.textContent = block.inferredText;
        currCol.appendChild(currLabel);
        currCol.appendChild(currPre);
        diff.appendChild(currCol);
        el.appendChild(diff);

        // Action buttons
        const actions = document.createElement('div');
        actions.className = 'review-block-actions';

        const makeBtn = (label: string, blockIdx: number, selAction: 'use-original' | 'use-inferred' | 'skip', active: boolean) => {
            const btn = document.createElement('button');
            btn.className = `btn-review${active ? ' btn-review--active' : ''}`;
            btn.textContent = label;
            btn.addEventListener('click', () => {
                const sel = exportReviewSelections.get(frameIndex) ?? new Map<number, 'use-original' | 'use-inferred' | 'skip'>();
                sel.set(blockIdx, selAction);
                exportReviewSelections.set(frameIndex, sel);
                renderReviewPanel(frameIndex);
            });
            return btn;
        };

        if (block.state === 'modified') {
            actions.appendChild(makeBtn('✓ Keep original', blockIndex, 'use-original', currentAction === 'use-original'));
            actions.appendChild(makeBtn('Use current',     blockIndex, 'use-inferred', currentAction === 'use-inferred'));
        } else {
            actions.appendChild(makeBtn('✓ Include', blockIndex, 'use-inferred', currentAction === 'use-inferred'));
            actions.appendChild(makeBtn('Skip',      blockIndex, 'skip',         currentAction === 'skip'));
        }

        el.appendChild(actions);
        exportReviewBlocks.appendChild(el);
    });
}

function triggerDownload(filename: string, content: string): boolean {
    let url: string | null = null;
    try {
        const blob = new Blob([content], { type: 'text/markdown' });
        url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        return true;
    } catch (err) {
        console.error('[MarkDown For What] Download failed:', err);
        return false;
    } finally {
        if (url) {
            const urlToRevoke = url;
            setTimeout(() => URL.revokeObjectURL(urlToRevoke), 60_000);
        }
    }
}

function downloadFrame(frameIndex: number, batchId = downloadBatchId) {
    const frame = exportFrameResults[frameIndex];
    if (!frame) return;
    const sel = exportReviewSelections.get(frameIndex);
    const selections: BlockSelection[] = sel
        ? Array.from(sel.entries()).map(([blockIndex, action]) => ({ blockIndex, action }))
        : [];
    parent.postMessage({ pluginMessage: { type: MSG_EXPORT_DOWNLOAD, frameId: frame.frameId, selections, batchId } }, '*');
}

function startSequentialDownload() {
    pendingDownloadIndex = 0;
    downloadBatchId++;
    const batchId = downloadBatchId;
    downloadFrame(pendingDownloadIndex, batchId);
}

function renderExportLog(frames: ExportFrameResult[]) {
    const lines: string[] = [];
    for (const frame of frames) {
        if (frame.skippedLayers && frame.skippedLayers.length > 0) {
            lines.push(`--- ${frame.filename} ---`);
            for (const s of frame.skippedLayers) {
                lines.push(`  Skipped: "${s.name}" — ${s.reason}`);
            }
        }
    }
    exportLogPanel.hidden = lines.length === 0;
    exportLogContent.textContent = lines.join('\n');
}

// ── Tab switching ───────────────────────────────────────────────────────────
// (handled by mfw-tab-bar component — no manual querySelectorAll('.tab') needed)

// ── Drop zone ───────────────────────────────────────────────────────────────

dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer?.files.length) handleFiles(e.dataTransfer.files);
});

fileInput.addEventListener('change', () => {
    if (fileInput.files?.length) handleFiles(fileInput.files);
});

// ── File handling ───────────────────────────────────────────────────────────

function readFile(file: File): Promise<{ name: string; content: string }> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve({ name: file.name, content: e.target?.result as string });
        reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
        reader.readAsText(file);
    });
}

async function handleFiles(files: FileList) {
    if (importBtn) importBtn.disabled = true;
    showStatus('Reading files\u2026', 'success');

    try {
        const allFiles = Array.from(files);
        const validFiles = allFiles.filter(f => hasSupportedExtension(f.name));
        const invalidFiles = allFiles
            .filter(f => !hasSupportedExtension(f.name))
            .map(f => ({ name: f.name, ext: f.name.slice(f.name.lastIndexOf('.')) || f.name }));

        if (invalidFiles.length > 0 && validFiles.length === 0) {
            showImportError(invalidFiles);
            return;
        }

        currentFiles = await Promise.all(validFiles.map(readFile));

        if (currentFiles.length === 0) {
            showStatus('No valid Markdown files found.', 'error');
        } else {
            showPreview(currentFiles);
        }
    } catch (err) {
        console.error('[MarkDown For What] Error reading files:', err);
        showStatus('Error reading files', 'error');
    }
    fileInput.value = '';
}

function renderFileList(files: { name: string; content: string }[]) {
    fileListEl.setFiles(files.map(f => ({ name: f.name })));
}

// ── Preview ─────────────────────────────────────────────────────────────────

/** Returns a human-readable label for a block-level HTML element. */
function blockLabel(el: Element): string {
    const tag = el.tagName.toLowerCase();
    const text = (el.textContent ?? '').trim().slice(0, 30);
    const labels: Record<string, string> = {
        h1: 'H1', h2: 'H2', h3: 'H3', h4: 'H4', h5: 'H5', h6: 'H6',
        p: 'Para', ul: 'List', ol: 'List', pre: 'Code',
        blockquote: 'Quote', table: 'Table', hr: 'Rule', img: 'Image',
    };
    const prefix = labels[tag] ?? tag;
    return text ? `${prefix}: ${text}` : prefix;
}

function showPreview(files: { name: string; content: string }[]) {
    previewContent.innerHTML = '';
    let totalBlocks = 0;

    for (let fi = 0; fi < files.length; fi++) {
        const file = files[fi];
        if (fi > 0) {
            const divider = document.createElement('hr');
            divider.className = 'preview-divider';
            previewContent.appendChild(divider);
        }

        const fileHeader = document.createElement('div');
        fileHeader.className = 'preview-file-name';
        fileHeader.textContent = file.name;
        previewContent.appendChild(fileHeader);

        const clean = file.content.replace(FRONT_MATTER_REGEX, '');
        const html = marked.parse(clean) as string;

        // Parse HTML into DOM elements for per-block checkboxes
        const temp = document.createElement('div');
        temp.innerHTML = html;

        const children = Array.from(temp.children);
        for (let i = 0; i < children.length; i++) {
            const el = children[i];
            const row = document.createElement('div');
            row.className = 'preview-block-row';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = true;
            checkbox.className = 'preview-block-checkbox';
            checkbox.dataset.fileIndex = String(fi);
            checkbox.dataset.blockIndex = String(i);
            checkbox.addEventListener('change', () => {
                row.classList.toggle('unchecked', !checkbox.checked);
            });

            const label = document.createElement('span');
            label.className = 'preview-block-label';
            label.textContent = blockLabel(el);

            const content = document.createElement('div');
            content.className = 'preview-block-content preview-block';
            content.appendChild(el);

            row.appendChild(checkbox);
            row.appendChild(label);
            row.appendChild(content);
            previewContent.appendChild(row);
            totalBlocks++;
        }
    }

    previewSummary.textContent = `${files.length} file${files.length === 1 ? '' : 's'}, ${totalBlocks} block${totalBlocks === 1 ? '' : 's'}`;

    // Show preview, hide drop/paste
    importSection.style.display = 'none';
    (fileListEl as HTMLElement).style.display = 'none';
    previewPane.classList.remove('hidden');
    if (previewCancelBtn) previewCancelBtn.classList.remove('hidden');
    if (importBtn) {
        importBtn.disabled = false;
        importBtn.textContent = files.length === 1 ? 'Import to Canvas' : `Import ${files.length} Files`;
    }
}

function hidePreview() {
    previewPane.classList.add('hidden');
    if (previewCancelBtn) previewCancelBtn.classList.add('hidden');
    previewContent.innerHTML = '';
    importSection.style.display = '';
    (fileListEl as HTMLElement).style.display = '';
    if (importBtn) {
        importBtn.textContent = 'Import';
        importBtn.disabled = currentFiles.length === 0;
    }
}

// ── Paste ───────────────────────────────────────────────────────────────────

pasteSectionEl.addEventListener('mfw-paste-import', (e) => {
    const { text, name } = (e as CustomEvent<{ text: string; name: string }>).detail;
    currentFiles = [{ name: `${name || 'Pasted Markdown'}.md`, content: text }];
    showPreview(currentFiles);
});

// ── Import ──────────────────────────────────────────────────────────────────

function setAllCheckboxes(checked: boolean) {
    previewContent.querySelectorAll<HTMLInputElement>('.preview-block-checkbox').forEach(cb => {
        cb.checked = checked;
        cb.closest('.preview-block-row')?.classList.toggle('unchecked', !checked);
    });
}

selectAllBtn.addEventListener('click', () => setAllCheckboxes(true));
deselectAllBtn.addEventListener('click', () => setAllCheckboxes(false));

// ── Settings ────────────────────────────────────────────────────────────────

function populateSettings(settings: Record<string, unknown>) {
    if (!settings || typeof settings !== 'object') return;

    for (const id of settingInputIds) {
        const input = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
        if (!input || !(id in settings)) continue;
        input.value = String(settings[id]);

        // Sync color swatch if present
        const swatch = document.getElementById(`${id}-swatch`) as HTMLInputElement | null;
        if (swatch && typeof settings[id] === 'string') {
            swatch.value = settings[id] as string;
        }
    }

    // Handle checkboxes
    for (const id of checkboxSettingIds) {
        const cb = document.getElementById(id) as HTMLInputElement | null;
        if (cb && id in settings) cb.checked = !!settings[id];
    }

    // Handle theme selector active state
    const theme = settings.theme as string ?? 'minimal-light';
    themeSelectorEl.setAttribute('active', theme);

    // Handle style and component bindings
    restoreBindings(styleBindingSelects, (settings.styleBindings ?? {}) as Record<string, string>, 'auto');
    restoreBindings(componentBindingSelects, (settings.componentBindings ?? {}) as Record<string, string>, '');

    // Handle width mode visibility
    updateCustomWidthVisibility();
}

/** Restores select values from a bindings record, falling back to defaultValue. */
function restoreBindings(selects: NodeListOf<HTMLSelectElement>, bindings: Record<string, string>, defaultValue: string) {
    selects.forEach(select => {
        const key = select.dataset.binding;
        if (key && bindings[key]) select.value = bindings[key];
        else select.value = defaultValue;
    });
}

/** Collects binding values from a set of <select> elements, omitting those set to defaultValue. */
function collectBindings(selects: NodeListOf<HTMLSelectElement>, defaultValue: string): Record<string, string> {
    const bindings: Record<string, string> = {};
    selects.forEach(select => {
        const key = select.dataset.binding;
        if (key && select.value !== defaultValue) {
            bindings[key] = select.value;
        }
    });
    return bindings;
}

/** Populates a set of <select> dropdowns with items, preserving current selections. */
function populateDropdowns(
    selects: NodeListOf<HTMLSelectElement>,
    items: Array<{ id: string; name: string }>,
) {
    selects.forEach(select => {
        const currentValue = select.value;
        // Clear all options except the first default ("Auto" / "None")
        while (select.options.length > 1) select.remove(1);
        for (const item of items) {
            const opt = document.createElement('option');
            opt.value = item.id;
            opt.textContent = item.name;
            select.appendChild(opt);
        }
        // Restore previous selection if it still exists
        if (currentValue && Array.from(select.options).some(o => o.value === currentValue)) {
            select.value = currentValue;
        }
    });
}

function updateCustomWidthVisibility() {
    const widthMode = document.getElementById('widthMode') as HTMLSelectElement | null;
    const customRow = document.getElementById('customWidthRow') as HTMLElement | null;
    if (widthMode && customRow) {
        customRow.style.display = widthMode.value === 'custom' ? '' : 'none';
    }
}

function setupSettingListeners() {
    for (const id of settingInputIds) {
        const input = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
        const swatch = document.getElementById(`${id}-swatch`) as HTMLInputElement | null;

        input?.addEventListener('change', () => {
            if (id === 'widthMode') updateCustomWidthVisibility();
            // Manual change → deactivate theme preset
            themeSelectorEl.setAttribute('active', 'custom');
            sendCurrentSettings();
            if (swatch && input instanceof HTMLInputElement && isValidHex(input.value)) {
                swatch.value = input.value;
            }
        });

        swatch?.addEventListener('input', () => {
            if (input && input instanceof HTMLInputElement) {
                input.value = swatch.value;
                themeSelectorEl.setAttribute('active', 'custom');
                sendCurrentSettings();
            }
        });
    }

    // Checkbox listeners
    for (const id of checkboxSettingIds) {
        document.getElementById(id)?.addEventListener('change', () => sendCurrentSettings());
    }

    // Theme selector
    themeSelectorEl.addEventListener('mfw-theme-change', (e) => {
        const theme = (e as CustomEvent<{ theme: string }>).detail.theme;
        if (!THEME_PRESETS[theme]) return;
        const preset = THEME_PRESETS[theme];
        for (const [key, value] of Object.entries(preset)) {
            const input = document.getElementById(key) as HTMLInputElement | null;
            if (input) {
                input.value = String(value);
                const swatch = document.getElementById(`${key}-swatch`) as HTMLInputElement | null;
                if (swatch && typeof value === 'string') swatch.value = value;
            }
        }
        updateCustomWidthVisibility();
        sendCurrentSettings();
    });

    // Style and component binding selects
    [styleBindingSelects, componentBindingSelects].forEach(selects => {
        selects.forEach(select => {
            select.addEventListener('change', () => sendCurrentSettings());
        });
    });

    document.getElementById('reset-btn')?.addEventListener('click', () => {
        parent.postMessage({ pluginMessage: { type: MSG_RESET_SETTINGS } }, '*');
    });
}

function sendCurrentSettings() {
    const settings: Record<string, unknown> = {};
    for (const id of settingInputIds) {
        const input = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
        if (!input) continue;
        if (input instanceof HTMLInputElement && input.type === 'number') {
            settings[id] = Number(input.value);
        } else {
            settings[id] = input.value;
        }
    }

    // Include checkbox values
    for (const id of checkboxSettingIds) {
        const cb = document.getElementById(id) as HTMLInputElement | null;
        if (cb) settings[id] = cb.checked;
    }

    // Collect style and component bindings
    settings.styleBindings = collectBindings(styleBindingSelects, 'auto');
    settings.componentBindings = collectBindings(componentBindingSelects, '');

    // Determine active theme
    settings.theme = themeSelectorEl.getAttribute('active') ?? 'custom';

    // Compute frameWidth from widthMode/customWidth for backwards compat with validateSettings.
    // Duplicated from settings.ts WIDTH_PRESETS — UI runs in a separate iframe bundle,
    // so it cannot import from the plugin sandbox bundle directly.
    // IMPORTANT: Keep in sync with WIDTH_PRESETS in settings.ts (custom omitted; handled by fallback).
    const widthPresets: Record<string, number> = { narrow: 480, medium: 800, wide: 960 };
    const mode = settings.widthMode as string;
    settings.frameWidth = widthPresets[mode] ?? (settings.customWidth as number) ?? 800;

    parent.postMessage({ pluginMessage: { type: MSG_SAVE_SETTINGS, settings } }, '*');
}

setupSettingListeners();

tabBar.addEventListener('mfw-tab-change', (e) => {
    const tab = (e as CustomEvent<{ tab: string }>).detail.tab;
    const panels = document.querySelectorAll<HTMLElement>('.tab-panel');
    panels.forEach(p => {
        p.classList.toggle('active', p.id === `${tab}-panel`);
        p.classList.toggle('hidden', p.id !== `${tab}-panel`);
    });
    if (tab === 'settings') {
        parent.postMessage({ pluginMessage: { type: MSG_GET_SETTINGS } }, '*');
        parent.postMessage({ pluginMessage: { type: MSG_GET_LOCAL_STYLES } }, '*');
        parent.postMessage({ pluginMessage: { type: MSG_GET_LOCAL_COMPONENTS } }, '*');
    }
    if (tab === 'history') {
        parent.postMessage({ pluginMessage: { type: MSG_GET_HISTORY } }, '*');
    }
    if (tab === 'export') {
        parent.postMessage({ pluginMessage: { type: MSG_GET_SELECTION } }, '*');
    }
});

// ── Export button listeners ──────────────────────────────────────────────────

exportBtn.addEventListener('click', startSequentialDownload);
exportReviewBtn.addEventListener('click', () => renderReviewPanel(0));
exportReviewBack.addEventListener('click', () => {
    exportReviewPanel.hidden = true;
    exportFrameSummary.hidden = false;
});
exportConfirmBtn.addEventListener('click', startSequentialDownload);

// ── History ─────────────────────────────────────────────────────────────────

const historyFileList = document.getElementById('history-file-list') as HTMLElement & { setFiles(f: { name: string; meta: string }[]): void } | null;
const historyEmpty = document.getElementById('history-empty') as HTMLElement | null;
const historyCount = document.getElementById('history-count') as HTMLElement | null;
const clearHistoryBtn = document.getElementById('clear-history-btn') as HTMLButtonElement;

function renderHistory(entries: Array<{ filename: string; timestamp: number; blockCount: number }>) {
    if (!historyFileList) return;
    historyFileList.setFiles(entries.map(e => {
        const date = new Date(e.timestamp);
        const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        return {
            name: e.filename,
            meta: `${dateStr} ${timeStr} · ${e.blockCount} block${e.blockCount === 1 ? '' : 's'}`,
        };
    }));
    if (historyEmpty) historyEmpty.hidden = entries.length > 0;
    if (historyCount) historyCount.textContent = `${entries.length} FILE${entries.length !== 1 ? 's' : ''}`;
}

clearHistoryBtn.addEventListener('click', () => {
    parent.postMessage({ pluginMessage: { type: MSG_CLEAR_HISTORY } }, '*');
});

// ── Status helper ───────────────────────────────────────────────────────────

function showStatus(message: string, type: 'success' | 'error' = 'success') {
    if (!statusEl) return;
    statusEl.setAttribute('message', message);
    statusEl.setAttribute('type', type);
}

// ── Plugin → UI messages ─────────────────────────────────────────────────────

window.onmessage = event => {
    const msg = event.data?.pluginMessage;
    if (!msg) return;

    switch (msg.type) {
        case MSG_STATUS:
            loader.removeAttribute('visible');
            if (!previewPane.classList.contains('hidden')) hidePreview();
            showStatus(msg.message, msg.error ? 'error' : 'success');
            // Clear paste area on successful import (but not for export-domain status messages)
            if (!msg.error && msg.domain !== STATUS_DOMAIN_EXPORT) {
                pasteSectionEl.reset();
                currentFiles = [];
                renderFileList([]);
            }
            if (importBtn) importBtn.disabled = currentFiles.length === 0;
            break;
        case MSG_SETTINGS:
            populateSettings(msg.settings);
            break;
        case MSG_LOCAL_STYLES:
            populateDropdowns(styleBindingSelects, msg.textStyles ?? []);
            if (msg.error) showStatus(msg.error, 'error');
            break;
        case MSG_LOCAL_COMPONENTS:
            populateDropdowns(componentBindingSelects, msg.components ?? []);
            if (msg.error) showStatus(msg.error, 'error');
            break;
        case MSG_HISTORY:
            renderHistory(msg.entries ?? []);
            break;
        case MSG_SELECTION_CHANGED: {
            const activePanel = document.querySelector<HTMLElement>('.tab-panel:not(.hidden)');
            if (activePanel?.id === 'tab-export') {
                if (msg.frameIds.length > 0) {
                    parent.postMessage({ pluginMessage: { type: MSG_EXPORT_REQUEST, frameIds: msg.frameIds } }, '*');
                } else {
                    showExportNoSelection();
                }
            }
            break;
        }
        case MSG_EXPORT_RESULT:
            renderExportSummary(msg.frames);
            renderExportLog(msg.frames);
            break;
        case MSG_EXPORT_MARKDOWN: {
            if (msg.batchId !== downloadBatchId) break; // stale batch — ignore
            const success = triggerDownload(msg.filename, msg.content);
            if (!success) {
                // triggerDownload already logged; show user-visible feedback via existing status mechanism
                showStatus(`Failed to download ${msg.filename}`, 'error');
            }
            pendingDownloadIndex++;
            if (pendingDownloadIndex < exportFrameResults.length) {
                const nextIndex = pendingDownloadIndex;
                const thisBatchId = downloadBatchId;
                setTimeout(() => downloadFrame(nextIndex, thisBatchId), DOWNLOAD_STAGGER_MS);
            }
            break;
        }
        default:
            console.warn('[MFW] Unknown plugin message type:', msg.type);
            break;
    }
};
