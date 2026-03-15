interface FileItem {
  name: string;
}

class MfwFileList extends HTMLElement {
  private _ul: HTMLUListElement | null = null;

  connectedCallback(): void {
    this.render();
  }

  render(): void {
    while (this.firstChild) this.removeChild(this.firstChild);
    this._ul = document.createElement('ul');
    this._ul.className = 'file-list';
    this.appendChild(this._ul);
  }

  setFiles(files: FileItem[]): void {
    if (!this._ul) return;
    while (this._ul.firstChild) this._ul.removeChild(this._ul.firstChild);
    for (const file of files) {
      const li = document.createElement('li');
      li.textContent = file.name;
      this._ul.appendChild(li);
    }
  }
}

customElements.define('mfw-file-list', MfwFileList);
