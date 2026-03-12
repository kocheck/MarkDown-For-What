import './styles.css';
import { marked } from 'marked';
import { isValidHex, hasSupportedExtension } from '../utils';
import {
    MSG_GET_SETTINGS, MSG_SAVE_SETTINGS, MSG_RESET_SETTINGS,
    MSG_GET_LOCAL_STYLES, MSG_GET_LOCAL_COMPONENTS,
    MSG_GET_HISTORY, MSG_CLEAR_HISTORY, MSG_IMPORT_BATCH,
    MSG_STATUS, MSG_SETTINGS, MSG_LOCAL_STYLES, MSG_LOCAL_COMPONENTS, MSG_HISTORY,
} from '../messages';

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

const tabs = document.querySelectorAll<HTMLButtonElement>('.tab');
const tabPanels = document.querySelectorAll<HTMLElement>('.tab-panel');

const importSection = document.getElementById('import-section') as HTMLElement;
const dropZone = document.getElementById('drop-zone') as HTMLElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const fileList = document.getElementById('file-list') as HTMLUListElement;
const importBtn = document.getElementById('import-btn') as HTMLButtonElement;
const statusMsg = document.getElementById('status-message') as HTMLParagraphElement;
const loader = document.getElementById('loader') as HTMLElement;

// Preview elements
const previewPane = document.getElementById('preview-pane') as HTMLElement;
const previewContent = document.getElementById('preview-content') as HTMLElement;
const previewSummary = document.getElementById('preview-summary') as HTMLElement;
const previewCancelBtn = document.getElementById('preview-cancel') as HTMLButtonElement;
const selectAllBtn = document.getElementById('select-all-btn') as HTMLButtonElement;
const deselectAllBtn = document.getElementById('deselect-all-btn') as HTMLButtonElement;

// Paste elements
const pasteToggle = document.getElementById('paste-toggle') as HTMLButtonElement;
const pasteAreaWrap = document.getElementById('paste-area-wrap') as HTMLElement;
const pasteArea = document.getElementById('paste-area') as HTMLTextAreaElement;
const pasteName = document.getElementById('paste-name') as HTMLInputElement;
const pasteImportBtn = document.getElementById('paste-import-btn') as HTMLButtonElement;

// Settings inputs
const settingInputIds = [
    'blockSpacing', 'listSpacing', 'framePadding', 'widthMode', 'customWidth',
    'codeBackground', 'tableHeaderBackground', 'separatorColor', 'frameFillColor',
] as const;

const checkboxSettingIds = ['generateToc', 'componentNames'] as const;

// Theme buttons
const themeBtns = document.querySelectorAll<HTMLButtonElement>('.theme-btn');

// Style binding selects
const styleBindingSelects = document.querySelectorAll<HTMLSelectElement>('.style-binding-select');

// Component binding selects
const componentBindingSelects = document.querySelectorAll<HTMLSelectElement>('.component-binding-select');

// Theme presets (duplicated from settings.ts — UI runs in a separate iframe bundle)
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

// ── Tab switching ───────────────────────────────────────────────────────────

tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const targetId = 'tab-' + tab.dataset.tab;

        tabs.forEach(t => t.classList.toggle('active', t === tab));
        tabPanels.forEach(p => {
            p.classList.toggle('active', p.id === targetId);
            p.classList.toggle('hidden', p.id !== targetId);
        });

        if (tab.dataset.tab === 'settings') {
            parent.postMessage({ pluginMessage: { type: MSG_GET_SETTINGS } }, '*');
            parent.postMessage({ pluginMessage: { type: MSG_GET_LOCAL_STYLES } }, '*');
            parent.postMessage({ pluginMessage: { type: MSG_GET_LOCAL_COMPONENTS } }, '*');
        }
        if (tab.dataset.tab === 'history') {
            parent.postMessage({ pluginMessage: { type: MSG_GET_HISTORY } }, '*');
        }
    });
});

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
    importBtn.disabled = true;
    showStatus('Reading files\u2026', 'success');

    try {
        const validFiles = Array.from(files).filter(f => hasSupportedExtension(f.name));
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
    fileList.textContent = '';

    for (const file of files) {
        const li = document.createElement('li');
        li.textContent = file.name;
        fileList.appendChild(li);
    }
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
    fileList.style.display = 'none';
    previewPane.classList.remove('hidden');
    previewCancelBtn.classList.remove('hidden');
    importBtn.disabled = false;
    importBtn.textContent = files.length === 1 ? 'Import to Canvas' : `Import ${files.length} Files`;
}

function hidePreview() {
    previewPane.classList.add('hidden');
    previewCancelBtn.classList.add('hidden');
    previewContent.innerHTML = '';
    importSection.style.display = '';
    fileList.style.display = '';
    importBtn.textContent = 'Import';
}

// ── Paste ───────────────────────────────────────────────────────────────────

pasteToggle.addEventListener('click', () => {
    pasteAreaWrap.classList.toggle('hidden');
});

pasteArea.addEventListener('input', () => {
    pasteImportBtn.disabled = pasteArea.value.trim().length === 0;
});

pasteImportBtn.addEventListener('click', () => {
    const content = pasteArea.value.trim();
    if (!content) return;

    const name = pasteName.value.trim() || 'Pasted Markdown';
    currentFiles = [{ name: `${name}.md`, content }];
    showPreview(currentFiles);
});

// ── Import ──────────────────────────────────────────────────────────────────

importBtn.addEventListener('click', () => {
    if (currentFiles.length === 0) return;
    loader.classList.remove('hidden');
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

function setAllCheckboxes(checked: boolean) {
    previewContent.querySelectorAll<HTMLInputElement>('.preview-block-checkbox').forEach(cb => {
        cb.checked = checked;
        cb.closest('.preview-block-row')?.classList.toggle('unchecked', !checked);
    });
}

selectAllBtn.addEventListener('click', () => setAllCheckboxes(true));
deselectAllBtn.addEventListener('click', () => setAllCheckboxes(false));

previewCancelBtn.addEventListener('click', () => {
    hidePreview();
    currentFiles = [];
    renderFileList([]);
    showStatus('', 'success');
    importBtn.disabled = true;
});

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

    // Handle theme button active state
    const theme = settings.theme as string ?? 'minimal-light';
    themeBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === theme);
    });

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
            // Manual change → deactivate theme preset buttons
            themeBtns.forEach(b => b.classList.remove('active'));
            sendCurrentSettings();
            if (swatch && input instanceof HTMLInputElement && isValidHex(input.value)) {
                swatch.value = input.value;
            }
        });

        swatch?.addEventListener('input', () => {
            if (input && input instanceof HTMLInputElement) {
                input.value = swatch.value;
                themeBtns.forEach(b => b.classList.remove('active'));
                sendCurrentSettings();
            }
        });
    }

    // Checkbox listeners
    for (const id of checkboxSettingIds) {
        document.getElementById(id)?.addEventListener('change', () => sendCurrentSettings());
    }

    // Theme buttons
    themeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const theme = btn.dataset.theme;
            if (!theme || !THEME_PRESETS[theme]) return;

            // Activate this button
            themeBtns.forEach(b => b.classList.toggle('active', b === btn));

            // Apply preset values to settings inputs
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
    const activeThemeBtn = document.querySelector('.theme-btn.active') as HTMLButtonElement | null;
    settings.theme = activeThemeBtn?.dataset.theme ?? 'custom';

    // Compute frameWidth from widthMode/customWidth for backwards compat with validateSettings.
    // Duplicated from settings.ts WIDTH_PRESETS — UI runs in a separate iframe bundle,
    // so it cannot import from the plugin sandbox bundle directly.
    const widthPresets: Record<string, number> = { narrow: 480, medium: 800, wide: 960 };
    const mode = settings.widthMode as string;
    settings.frameWidth = widthPresets[mode] ?? (settings.customWidth as number) ?? 800;

    parent.postMessage({ pluginMessage: { type: MSG_SAVE_SETTINGS, settings } }, '*');
}

setupSettingListeners();

// ── History ─────────────────────────────────────────────────────────────────

const historyList = document.getElementById('history-list') as HTMLUListElement;
const historyEmpty = document.getElementById('history-empty') as HTMLElement;
const clearHistoryBtn = document.getElementById('clear-history-btn') as HTMLButtonElement;

function renderHistory(entries: Array<{ filename: string; timestamp: number; blockCount: number }>) {
    historyList.textContent = '';
    if (entries.length === 0) {
        historyEmpty.style.display = '';
        return;
    }
    historyEmpty.style.display = 'none';
    for (const entry of entries) {
        const li = document.createElement('li');
        li.className = 'history-entry';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'history-filename';
        nameSpan.textContent = entry.filename;

        const meta = document.createElement('span');
        meta.className = 'history-meta';
        const date = new Date(entry.timestamp);
        const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        meta.textContent = `${dateStr} ${timeStr} · ${entry.blockCount} block${entry.blockCount === 1 ? '' : 's'}`;

        li.appendChild(nameSpan);
        li.appendChild(meta);
        historyList.appendChild(li);
    }
}

clearHistoryBtn.addEventListener('click', () => {
    parent.postMessage({ pluginMessage: { type: MSG_CLEAR_HISTORY } }, '*');
});

// ── Status helper ───────────────────────────────────────────────────────────

function showStatus(message: string, type: 'success' | 'warning' | 'error' = 'success') {
    statusMsg.textContent = message;
    statusMsg.className = `status-message ${type}`;
}

// ── Plugin → UI messages ─────────────────────────────────────────────────────

window.onmessage = event => {
    const msg = event.data?.pluginMessage;
    if (!msg) return;

    switch (msg.type) {
        case MSG_STATUS:
            loader.classList.add('hidden');
            if (!previewPane.classList.contains('hidden')) hidePreview();
            importBtn.disabled = currentFiles.length === 0;
            showStatus(msg.message, msg.error ? 'error' : msg.warning ? 'warning' : 'success');
            // Clear paste area on successful import
            if (!msg.error) {
                pasteArea.value = '';
                pasteName.value = '';
                pasteImportBtn.disabled = true;
                currentFiles = [];
                renderFileList([]);
            }
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
        default:
            break;
    }
};
