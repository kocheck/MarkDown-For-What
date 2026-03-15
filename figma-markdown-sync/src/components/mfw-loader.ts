class MfwLoader extends HTMLElement {
  static get observedAttributes() { return ['visible']; }

  connectedCallback(): void {
    this.render();
  }

  attributeChangedCallback(): void {
    const overlay = this.querySelector('.loader-overlay');
    if (overlay) {
      overlay.classList.toggle('hidden', !this.hasAttribute('visible'));
    }
  }

  render(): void {
    while (this.firstChild) this.removeChild(this.firstChild);

    const overlay = document.createElement('div');
    overlay.className = 'loader-overlay';
    if (!this.hasAttribute('visible')) overlay.classList.add('hidden');

    const content = document.createElement('div');
    content.className = 'loader-content';

    const spinner = document.createElement('div');
    spinner.className = 'spinner';

    const msg = document.createElement('p');
    msg.textContent = 'Importing\u2026';

    content.appendChild(spinner);
    content.appendChild(msg);
    overlay.appendChild(content);
    this.appendChild(overlay);
  }
}

customElements.define('mfw-loader', MfwLoader);
