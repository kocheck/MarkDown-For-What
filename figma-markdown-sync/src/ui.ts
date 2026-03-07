import './styles.css';

// ── DOM references ──────────────────────────────────────────────────────────

const tabs = document.querySelectorAll<HTMLButtonElement>('.tab');
const tabPanels = document.querySelectorAll<HTMLElement>('.tab-panel');

const dropZone = document.getElementById('drop-zone') as HTMLElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const fileList = document.getElementById('file-list') as HTMLUListElement;
const importBtn = document.getElementById('import-btn') as HTMLButtonElement;
const statusMsg = document.getElementById('status-message') as HTMLParagraphElement;
const loader = document.getElementById('loader') as HTMLElement;

// Settings inputs
const settingInputIds = [
    'blockSpacing', 'listSpacing', 'framePadding', 'frameWidth',
    'codeBackground', 'tableHeaderBackground', 'separatorColor',
] as const;

type SettingKey = typeof settingInputIds[number];

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
            parent.postMessage({ pluginMessage: { type: 'get-settings' } }, '*');
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

// The file input sits over the drop zone (position: absolute, opacity: 0)
// so clicking the drop zone area triggers the file picker naturally.
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
        const results = await Promise.all(Array.from(files).map(readFile));
        currentFiles = results.filter(f =>
            f.name.endsWith('.md') || f.name.endsWith('.markdown') || f.name.endsWith('.txt')
        );

        renderFileList(currentFiles);

        if (currentFiles.length === 0) {
            showStatus('No valid Markdown files found.', 'error');
        } else {
            showStatus(`${currentFiles.length} file${currentFiles.length === 1 ? '' : 's'} ready`, 'success');
            importBtn.disabled = false;
            importBtn.textContent = currentFiles.length === 1 ? 'Import' : `Import ${currentFiles.length} Files`;
        }
    } catch (err) {
        showStatus('Error reading files', 'error');
    }
}

function renderFileList(files: { name: string; content: string }[]) {
    const listEl = document.getElementById('file-list') as HTMLUListElement;
    listEl.textContent = ''; // Clear without innerHTML

    for (const file of files) {
        const li = document.createElement('li');
        li.textContent = file.name;
        listEl.appendChild(li);
    }
}

// ── Import ──────────────────────────────────────────────────────────────────

importBtn.addEventListener('click', () => {
    if (currentFiles.length === 0) return;
    loader.classList.remove('hidden');
    importBtn.disabled = true;

    parent.postMessage({
        pluginMessage: { type: 'import-markdown-batch', files: currentFiles }
    }, '*');
});

// ── Settings ────────────────────────────────────────────────────────────────

function populateSettings(settings: Record<string, unknown>) {
    for (const id of settingInputIds) {
        const input = document.getElementById(id) as HTMLInputElement | null;
        if (!input || !(id in settings)) continue;
        input.value = String(settings[id]);

        // Sync color swatch if present
        const swatch = document.getElementById(`${id}-swatch`) as HTMLInputElement | null;
        if (swatch && typeof settings[id] === 'string') {
            swatch.value = settings[id] as string;
        }
    }
}

function setupSettingListeners() {
    for (const id of settingInputIds) {
        const input = document.getElementById(id) as HTMLInputElement | null;
        const swatch = document.getElementById(`${id}-swatch`) as HTMLInputElement | null;

        input?.addEventListener('change', () => {
            sendCurrentSettings();
            if (swatch && input.value.match(/^#[0-9A-Fa-f]{6}$/)) {
                swatch.value = input.value;
            }
        });

        swatch?.addEventListener('input', () => {
            if (input) {
                input.value = swatch.value;
                sendCurrentSettings();
            }
        });
    }

    document.getElementById('reset-btn')?.addEventListener('click', () => {
        parent.postMessage({ pluginMessage: { type: 'reset-settings' } }, '*');
    });
}

function sendCurrentSettings() {
    const settings: Record<string, unknown> = {};
    for (const id of settingInputIds) {
        const input = document.getElementById(id) as HTMLInputElement | null;
        if (!input) continue;
        const val = input.type === 'number' ? Number(input.value) : input.value;
        settings[id] = val;
    }
    parent.postMessage({ pluginMessage: { type: 'save-settings', settings } }, '*');
}

setupSettingListeners();

// ── Status helper ───────────────────────────────────────────────────────────

function showStatus(message: string, type: 'success' | 'error' = 'success') {
    statusMsg.textContent = message;
    statusMsg.className = `status-message ${type}`;
}

// ── Plugin → UI messages ─────────────────────────────────────────────────────

window.onmessage = event => {
    const msg = event.data?.pluginMessage;
    if (!msg) return;

    loader.classList.add('hidden');
    importBtn.disabled = currentFiles.length === 0;

    switch (msg.type) {
        case 'status':
            showStatus(msg.message, msg.error ? 'error' : 'success');
            break;
        case 'settings':
            populateSettings(msg.settings);
            break;
        default:
            break;
    }
};
