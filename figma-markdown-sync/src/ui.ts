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
    previewCancelBtn.className = 'btn-ghost hidden';
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
import type { BlockSelection, ExportFrameResult } from '../exporter';

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

const importSection = document.getElementById('import-normal-state') as HTMLElement;
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
const exportBtn = document.getElementById('export-btn') as HTMLButtonElement;

// After DOM refs are established
if (!tabBar || !loader || !pasteSectionEl || !fileListEl || !themeSelectorEl) {
    console.error('[MFW] One or more critical elements missing from DOM. Check shell template and build:html output.');
}

// Populate static width options — mfw-settings-row renders an empty <select> by default
const widthModeRow = document.querySelector<HTMLElement & {
    setOptions(items: Array<{ value: string; label: string }>): void;
}>('mfw-settings-row[input-id="widthMode"]');
widthModeRow?.setOptions([
    { value: 'narrow', label: 'Narrow (480px)' },
    { value: 'medium', label: 'Medium (800px)' },
    { value: 'wide',   label: 'Wide (960px)' },
    { value: 'custom', label: 'Custom' },
]);

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
let pendingDownloadIndex = 0;
let downloadBatchId = 0;
const DOWNLOAD_STAGGER_MS = 300; // delay between triggering successive file downloads to avoid browser download-manager throttling

// ── Export UI helpers ────────────────────────────────────────────────────────

function buildLogEntry(text: string, status: 'done' | 'progress'): HTMLElement {
    const entry = document.createElement('div');
    entry.className = 'export-log-entry';

    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('width', '12');
    icon.setAttribute('height', '12');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('stroke-width', '2.5');

    if (status === 'done') {
        const check = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        check.setAttribute('points', '20 6 9 17 4 12');
        icon.appendChild(check);
        icon.classList.add('log-icon-done');
    } else {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', '12');
        circle.setAttribute('cy', '12');
        circle.setAttribute('r', '10');
        icon.appendChild(circle);
        icon.classList.add('log-icon-progress');
    }

    const label = document.createElement('span');
    label.textContent = text;
    label.className = status === 'progress' ? 'log-text-progress' : 'log-text-done';

    entry.appendChild(icon);
    entry.appendChild(label);
    return entry;
}

function updateExportPanel(filename: string, meta: string, logEntries: { text: string; status: 'done' | 'progress' }[]): void {
    const filenameEl = document.getElementById('export-filename');
    const metaEl = document.getElementById('export-meta');
    const logContainer = document.getElementById('export-log-entries');

    if (filenameEl) filenameEl.textContent = filename;
    if (metaEl) metaEl.textContent = meta;

    if (logContainer) {
        while (logContainer.firstChild) logContainer.removeChild(logContainer.firstChild);
        for (const entry of logEntries) {
            logContainer.appendChild(buildLogEntry(entry.text, entry.status));
        }
    }
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
    const selections: BlockSelection[] = [];
    parent.postMessage({ pluginMessage: { type: MSG_EXPORT_DOWNLOAD, frameId: frame.frameId, selections, batchId } }, '*');
}

function startSequentialDownload() {
    pendingDownloadIndex = 0;
    downloadBatchId++;
    const batchId = downloadBatchId;
    downloadFrame(pendingDownloadIndex, batchId);
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

exportBtn?.addEventListener('click', startSequentialDownload);

// ── History ─────────────────────────────────────────────────────────────────

const historyFileList = document.getElementById('history-file-list') as HTMLElement & { setFiles(f: { name: string; meta: string }[]): void } | null;
const historyEmpty = document.getElementById('history-empty') as HTMLElement | null;
const historyCount = document.getElementById('history-count') as HTMLElement | null;
const clearHistoryBtn = document.getElementById('clear-history-btn') as HTMLElement | null;

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

clearHistoryBtn?.addEventListener('click', () => {
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
            if (activePanel?.id === 'export-panel') {
                if (msg.frameIds.length > 0) {
                    parent.postMessage({ pluginMessage: { type: MSG_EXPORT_REQUEST, frameIds: msg.frameIds } }, '*');
                }
            }
            break;
        }
        case MSG_EXPORT_RESULT:
            exportFrameResults = msg.frames;
            if (msg.frames?.length > 0) {
                const frame = msg.frames[0] as ExportFrameResult;
                const blockCount = frame.blocks.length;
                const skipped = frame.skippedLayers.length;
                const meta = `${blockCount} block${blockCount !== 1 ? 's' : ''}` +
                    (skipped > 0 ? ` · ${skipped} layer${skipped !== 1 ? 's' : ''} skipped` : '');
                updateExportPanel(
                    frame.filename,
                    meta,
                    frame.blocks.map((_b, i) => ({
                        text: `exported block ${i + 1}`,
                        status: 'done' as const,
                    })),
                );
            }
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
