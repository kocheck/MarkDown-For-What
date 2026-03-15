class MfwPasteSection extends HTMLElement {
  private _textarea: HTMLTextAreaElement | null = null;
  private _nameInput: HTMLInputElement | null = null;

  connectedCallback(): void {
    this.render();
  }

  render(): void {
    while (this.firstChild) this.removeChild(this.firstChild);

    const section = document.createElement('div');
    section.className = 'paste-section';

    this._textarea = document.createElement('textarea');
    this._textarea.className = 'paste-area';
    this._textarea.rows = 3;
    this._textarea.placeholder = 'Paste markdown content here...';

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'paste-actions';

    this._nameInput = document.createElement('input');
    this._nameInput.type = 'text';
    this._nameInput.className = 'paste-name-input';
    this._nameInput.placeholder = 'Frame name (optional)';

    const importBtn = document.createElement('button');
    importBtn.className = 'btn-ghost';
    importBtn.textContent = 'Import';

    const textarea = this._textarea;
    const nameInput = this._nameInput;

    importBtn.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('mfw-paste-import', {
        bubbles: true,
        detail: { content: textarea.value, name: nameInput.value.trim() },
      }));
    });

    actionsDiv.appendChild(this._nameInput);
    actionsDiv.appendChild(importBtn);
    section.appendChild(this._textarea);
    section.appendChild(actionsDiv);
    this.appendChild(section);
  }

  reset(): void {
    if (this._textarea) this._textarea.value = '';
    if (this._nameInput) this._nameInput.value = '';
  }
}

customElements.define('mfw-paste-section', MfwPasteSection);
