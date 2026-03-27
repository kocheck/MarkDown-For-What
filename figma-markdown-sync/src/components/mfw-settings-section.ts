class MfwSettingsSection extends HTMLElement {
  static get observedAttributes() { return ['title']; }

  connectedCallback(): void {
    this.render();
  }

  attributeChangedCallback(): void {
    this.render();
  }

  render(): void {
    // Apply class to self (no inner wrapper needed)
    this.className = 'settings-section';

    // Remove any previously rendered title
    const existing = this.querySelector('.settings-section-title');
    if (existing) this.removeChild(existing);

    const title = this.getAttribute('title');
    if (!title) return;

    const h3 = document.createElement('h3');
    h3.className = 'settings-section-title';
    h3.textContent = title;
    this.insertBefore(h3, this.firstChild);
  }
}

customElements.define('mfw-settings-section', MfwSettingsSection);
