const STATUS_CLASSES = {
  info:    null,
  error:   'status--error',
  success: 'status--success',
} as const;

type StatusType = keyof typeof STATUS_CLASSES;

function isStatusType(value: string): value is StatusType {
  return value in STATUS_CLASSES;
}

class MfwStatus extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['message', 'type'];
  }

  connectedCallback(): void {
    this.render();
  }

  attributeChangedCallback(): void {
    if (this.isConnected) this.render();
  }

  render(): void {
    while (this.firstChild) this.removeChild(this.firstChild);

    const message = this.getAttribute('message') ?? '';
    const raw = this.getAttribute('type') ?? 'info';
    const type: StatusType = isStatusType(raw) ? raw : 'info';

    this.hidden = message === '';

    // Remove old type classes before applying new one
    this.classList.remove('status--success', 'status--error');
    const modifier = STATUS_CLASSES[type];
    if (modifier) this.classList.add(modifier);

    const dot = document.createElement('span');
    dot.className = 'status-dot';

    const text = document.createElement('span');
    text.className = 'status-text';
    text.textContent = message;

    this.appendChild(dot);
    this.appendChild(text);
  }
}

customElements.define('mfw-status', MfwStatus);
