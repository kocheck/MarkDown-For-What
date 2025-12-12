import './styles.css';
console.log('UI script starting...');

const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const browseBtn = document.getElementById('browse-btn');
const previewArea = document.getElementById('preview-area');
const fileContentPre = document.getElementById('file-content');
const importBtn = document.getElementById('import-btn') as HTMLButtonElement;
const statusMessage = document.getElementById('status-message');
const loader = document.getElementById('loader');

// Debug element finding
if (!dropZone) console.error('Error: drop-zone not found');
if (!fileInput) console.error('Error: file-input not found');
if (!browseBtn) console.error('Error: browse-btn not found');
if (!importBtn) console.error('Error: import-btn not found');
if (!loader) console.error('Error: loader not found');

console.log('UI Elements initialized', { dropZone, fileInput, browseBtn });

let currentFiles: { name: string, content: string }[] = [];

// Handle Drag & Drop
if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        console.log('File dropped');

        if (e.dataTransfer?.files.length) {
            handleFiles(e.dataTransfer.files);
        }
    });

    // Handle Click (Dropzone)
    dropZone.addEventListener('click', (e) => {
        // Avoid double triggering if clicking the button (bubbling)
        if (e.target !== browseBtn) {
             console.log('Dropzone clicked (background)');
             fileInput?.click();
        }
    });
}

// Handle Browse Button
if (browseBtn) {
    browseBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Explicitly stop bubbling
        e.preventDefault();  // Prevent default button behavior
        console.log('Browse button clicked');

        if (fileInput) {
            console.log('Triggering file input click');
            fileInput.click();
        } else {
            console.error('File input missing when browse clicked');
        }
    });
} else {
    console.warn('Browse button listener NOT attached (element missing)');
}

fileInput?.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    console.log('File input changed', target.files?.length);
    if (target.files?.length) {
        handleFiles(target.files);
    }
});

function readFile(file: File): Promise<{ name: string, content: string }> {
    return new Promise((resolve, reject) => {
        if (!file.name.endsWith('.md') && !file.name.endsWith('.markdown') && !file.name.endsWith('.txt')) {
            // resolve with empty content to filter out later or reject?
            // Let's just reject or skip.
            // Better to skip quietly or warn.
            resolve({ name: file.name, content: '' }); // Mark as empty/invalid
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            resolve({ name: file.name, content: e.target?.result as string });
        };
        reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
        reader.readAsText(file);
    });
}

async function handleFiles(fileList: FileList) {
    currentFiles = [];
    showStatus('Reading files...', 'success');

    // Disable button while reading
    if (importBtn) importBtn.disabled = true;

    try {
        const promises: Promise<{ name: string, content: string }>[] = [];
        for (let i = 0; i < fileList.length; i++) {
            promises.push(readFile(fileList[i]));
        }

        const results = await Promise.all(promises);

        // Filter out invalid/empty ones if we want, or just keep them
        // For now, let's keep valid ones.
        currentFiles = results.filter(f => f.content !== '');

        if (currentFiles.length === 0) {
            showStatus('No valid markdown files found.', 'error');
            if (previewArea) previewArea.classList.remove('visible');
            return;
        }

        // Update Preview
        if (fileContentPre) {
            if (currentFiles.length === 1) {
                // Show content preview for single file (limit 500 chars)
                const content = currentFiles[0].content;
                fileContentPre.textContent = content.substring(0, 500) + (content.length > 500 ? '...' : '');
            } else {
                // Show list of files with snippets (User Request: ~50 chars)
                const previewText = currentFiles.map(f => {
                    const snippet = f.content.substring(0, 50).replace(/\n/g, ' ') + (f.content.length > 50 ? '...' : '');
                    return `• ${f.name} \n  "${snippet}"`;
                }).join('\n\n');
                fileContentPre.textContent = `Selected ${currentFiles.length} files:\n\n` + previewText;
            }
        }

        if (previewArea) previewArea.classList.add('visible');
        if (importBtn) {
            importBtn.disabled = false;
            importBtn.innerText = currentFiles.length > 1 ? `Import ${currentFiles.length} Files` : 'Import to Selected Layer(s)';
        }

        showStatus(`Ready to import ${currentFiles.length} file${currentFiles.length === 1 ? '' : 's'}`, 'success');

    } catch (err) {
        console.error(err);
        showStatus('Error reading files', 'error');
    }
}

// Handle Import
importBtn?.addEventListener('click', () => {
    if (currentFiles.length === 0) return;

    // Show Loader
    if (loader) loader.classList.add('visible');
    // Disable inputs
    if (importBtn) importBtn.disabled = true;

    parent.postMessage({
        pluginMessage: {
            type: 'import-markdown-batch',
            files: currentFiles
        }
    }, '*');
});

// Handle Messages from Plugin Code
window.onmessage = (event) => {
    const msg = event.data.pluginMessage;

    // Hide Loader on any return message
    if (loader) loader.classList.remove('visible');
    if (importBtn) importBtn.disabled = false;

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
