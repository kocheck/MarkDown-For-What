class MfwSectionHeader extends HTMLElement {
  connectedCallback(): void {
    this.render();
  }

  render(): void {
    while (this.firstChild) this.removeChild(this.firstChild);

    const prefix = document.createElement('span');
    prefix.className = 'section-header-prefix';
    prefix.textContent = '//';

    const label = document.createElement('span');
    label.className = 'section-header-label';
    label.textContent = this.getAttribute('label') ?? '';

    this.appendChild(prefix);
    this.appendChild(label);
  }
}

customElements.define('mfw-section-header', MfwSectionHeader);
