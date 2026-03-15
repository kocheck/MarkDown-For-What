const STATUS_CLASSES = {
  info: null,
  error: 'error',
  success: 'success',
} as const;

type StatusType = keyof typeof STATUS_CLASSES;

function isStatusType(value: string): value is StatusType {
  return value in STATUS_CLASSES;
}

class MfwStatus extends HTMLElement {
  connectedCallback(): void {
    this.render();
  }

  render(): void {
    while (this.firstChild) this.removeChild(this.firstChild);

    const message = this.getAttribute('message') ?? '';
    const raw = this.getAttribute('type') ?? 'info';
    let type: StatusType;
    if (isStatusType(raw)) {
      type = raw;
    } else {
      console.warn(`[mfw-status] Unknown type "${raw}", falling back to "info".`);
      type = 'info';
    }

    const p = document.createElement('p');
    p.className = 'status-message';
    const modifier = STATUS_CLASSES[type];
    if (modifier !== null) p.classList.add(modifier);
    p.textContent = message;
    p.hidden = message === '';

    this.appendChild(p);
  }
}

customElements.define('mfw-status', MfwStatus);
