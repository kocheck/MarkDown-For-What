type StatusType = 'info' | 'error' | 'success';

const VALID_STATUS_TYPES = new Set<string>(['info', 'error', 'success']);

class MfwStatus extends HTMLElement {
  connectedCallback(): void {
    this.render();
  }

  render(): void {
    while (this.firstChild) this.removeChild(this.firstChild);

    const message = this.getAttribute('message') ?? '';
    const raw = this.getAttribute('type') ?? 'info';
    const type: StatusType = VALID_STATUS_TYPES.has(raw) ? (raw as StatusType) : 'info';

    const p = document.createElement('p');
    p.className = 'status-message';
    if (type !== 'info') p.classList.add(`status-message--${type}`);
    p.textContent = message;
    p.hidden = message === '';

    this.appendChild(p);
  }
}

customElements.define('mfw-status', MfwStatus);
