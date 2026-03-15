class MfwDropZone extends HTMLElement {
  connectedCallback(): void {
    this.render();
  }

  render(): void {
    while (this.firstChild) this.removeChild(this.firstChild);

    const zone = document.createElement('div');
    zone.className = 'drop-zone';

    // Icon container box
    const iconContainer = document.createElement('div');
    iconContainer.className = 'drop-zone-icon-container';

    // Download SVG via createElementNS (no innerHTML — per CLAUDE.md)
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'currentColor');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M13 10h5l-6 6-6-6h5V3h2v7zm-9 9h16v-7h2v8a1 1 0 01-1 1H3a1 1 0 01-1-1v-8h2v7z');
    svg.appendChild(path);
    iconContainer.appendChild(svg);

    const label = document.createElement('p');
    label.className = 'drop-zone-label';
    label.textContent = this.getAttribute('label') ?? 'Drop .md files here';

    const sublabel = document.createElement('p');
    sublabel.className = 'drop-zone-sublabel';
    sublabel.textContent = this.getAttribute('sublabel') ?? 'or click to browse';

    zone.appendChild(iconContainer);
    zone.appendChild(label);
    zone.appendChild(sublabel);
    this.appendChild(zone);

    // Re-attach drag events
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const files = Array.from(e.dataTransfer?.files ?? []);
      this.dispatchEvent(new CustomEvent('mfw-drop', { bubbles: true, detail: { files } }));
    });
    zone.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('mfw-drop-click', { bubbles: true }));
    });
  }
}

customElements.define('mfw-drop-zone', MfwDropZone);
