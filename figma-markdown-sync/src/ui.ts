import './styles.css';

const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const previewArea = document.getElementById('preview-area');
const fileContentPre = document.getElementById('file-content');
const importBtn = document.getElementById('import-btn') as HTMLButtonElement;
const statusMessage = document.getElementById('status-message');

let currentFileContent: string | null = null;
let currentFileName: string | null = null;

// Handle Drag & Drop
dropZone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});

dropZone?.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
});

dropZone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');

    if (e.dataTransfer?.files.length) {
        handleFile(e.dataTransfer.files[0]);
    }
});

// Handle Click
dropZone?.addEventListener('click', () => {
    fileInput?.click();
});

fileInput?.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    if (target.files?.length) {
        handleFile(target.files[0]);
    }
});

function handleFile(file: File) {
    if (!file.name.endsWith('.md') && !file.name.endsWith('.markdown') && !file.name.endsWith('.txt')) {
        showStatus('Invalid file type. Please select a .md, .markdown, or .txt file.', 'error');
        return;
    }

    if (file.size > 1024 * 1024) { // 1MB warning
        showStatus('Warning: File is large (>1MB).', 'error');
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const content = e.target?.result as string;
        currentFileContent = content;
        currentFileName = file.name;

        // Show preview
        if (fileContentPre) {
            fileContentPre.textContent = content.substring(0, 500) + (content.length > 500 ? '...' : '');
        }
        previewArea?.classList.add('visible');

        // Enable import button
        if (importBtn) {
            importBtn.disabled = false;
        }

        showStatus(`Loaded ${file.name}`, 'success');
    };

    reader.onerror = () => {
        showStatus('Error reading file', 'error');
    };

    reader.readAsText(file);
}

// Handle Import
importBtn?.addEventListener('click', () => {
    if (!currentFileContent) return;

    parent.postMessage({
        pluginMessage: {
            type: 'import-markdown',
            content: currentFileContent,
            filename: currentFileName
        }
    }, '*');
});

// Handle Messages from Plugin Code
window.onmessage = (event) => {
    const msg = event.data.pluginMessage;
    if (msg.type === 'status') {
        showStatus(msg.message, msg.error ? 'error' : 'success');
    }
};

function showStatus(message: string, type: 'success' | 'error' = 'success') {
    if (statusMessage) {
        statusMessage.textContent = message;
        statusMessage.className = `status-message ${type}`;
    }
}
