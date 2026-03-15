type StatusType = 'info' | 'error' | 'success';

class MfwStatus extends HTMLElement {
  connectedCallback(): void {
    this.render();
  }

  render(): void {
    while (this.firstChild) this.removeChild(this.firstChild);

    const message = this.getAttribute('message') ?? '';
    const type = (this.getAttribute('type') ?? 'info') as StatusType;

    const p = document.createElement('p');
    p.className = 'status-message';
    if (type !== 'info') p.classList.add(`status-message--${type}`);
    p.textContent = message;
    p.hidden = message === '';

    this.appendChild(p);
  }
}

customElements.define('mfw-status', MfwStatus);
