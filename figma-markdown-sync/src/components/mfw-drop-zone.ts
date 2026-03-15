class MfwDropZone extends HTMLElement {
  connectedCallback(): void {
    this.render();
  }

  render(): void {
    while (this.firstChild) this.removeChild(this.firstChild);

    const icon = this.getAttribute('icon') ?? '\u2193';
    const label = this.getAttribute('label') ?? 'Drop your Markdown here';
    const subLabel = this.getAttribute('sub-label') ?? 'or click to browse';
    const accept = this.getAttribute('accept') ?? '.md,.markdown,.txt';

    const wrapper = document.createElement('div');
    wrapper.className = 'drop-zone';

    const iconSpan = document.createElement('span');
    iconSpan.className = 'drop-zone-icon';
    iconSpan.textContent = icon;

    const labelP = document.createElement('p');
    labelP.className = 'drop-zone-label';
    labelP.textContent = label;

    const subP = document.createElement('p');
    subP.className = 'drop-zone-sub';
    subP.textContent = subLabel;

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    const inputId = this.getAttribute('input-id');
    if (inputId) fileInput.id = inputId;
    fileInput.accept = accept;
    fileInput.multiple = true;
    fileInput.setAttribute('aria-label', 'Choose Markdown files');

    wrapper.appendChild(iconSpan);
    wrapper.appendChild(labelP);
    wrapper.appendChild(subP);
    wrapper.appendChild(fileInput);

    this.appendChild(wrapper);
  }
}

customElements.define('mfw-drop-zone', MfwDropZone);
