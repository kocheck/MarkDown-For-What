class MfwPasteSection extends HTMLElement {
  connectedCallback(): void {
    this.render();
  }

  render(): void {
    while (this.firstChild) this.removeChild(this.firstChild);

    const section = document.createElement('div');
    section.className = 'paste-section';

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'paste-toggle-btn';
    toggleBtn.textContent = 'or paste Markdown text';

    const wrap = document.createElement('div');
    wrap.className = 'paste-area-wrap hidden';

    const textarea = document.createElement('textarea');
    textarea.className = 'paste-area';
    textarea.rows = 6;
    textarea.placeholder = 'Paste your Markdown here...';

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'paste-actions';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'paste-name-input';
    nameInput.placeholder = 'Frame name (optional)';

    const importBtn = document.createElement('button');
    importBtn.dataset.role = 'paste-import-btn';
    importBtn.className = 'btn-secondary';
    importBtn.textContent = 'Import Paste';
    importBtn.disabled = true;

    actionsDiv.appendChild(nameInput);
    actionsDiv.appendChild(importBtn);
    wrap.appendChild(textarea);
    wrap.appendChild(actionsDiv);
    section.appendChild(toggleBtn);
    section.appendChild(wrap);
    this.appendChild(section);

    // Events
    toggleBtn.addEventListener('click', () => {
      wrap.classList.toggle('hidden');
    });

    textarea.addEventListener('input', () => {
      importBtn.disabled = textarea.value.trim().length === 0;
    });

    importBtn.addEventListener('click', () => {
      const text = textarea.value.trim();
      if (!text) return;
      this.dispatchEvent(new CustomEvent('mfw-paste-import', {
        detail: { text, name: nameInput.value.trim() },
        bubbles: true,
      }));
    });
  }

  reset(): void {
    const textarea = this.querySelector<HTMLTextAreaElement>('textarea');
    const nameInput = this.querySelector<HTMLInputElement>('input[type="text"]');
    const importBtn = this.querySelector<HTMLButtonElement>('[data-role="paste-import-btn"]');
    const wrap = this.querySelector<HTMLElement>('.paste-area-wrap');
    if (textarea) textarea.value = '';
    if (nameInput) nameInput.value = '';
    if (importBtn) importBtn.disabled = true;
    if (wrap) wrap.classList.add('hidden');
  }
}

customElements.define('mfw-paste-section', MfwPasteSection);
