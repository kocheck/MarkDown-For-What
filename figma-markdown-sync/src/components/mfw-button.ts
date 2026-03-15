type ButtonVariant = 'primary' | 'secondary' | 'link';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  link: 'btn-link',
};

class MfwButton extends HTMLElement {
  connectedCallback(): void {
    this.render();
  }

  render(): void {
    while (this.firstChild) this.removeChild(this.firstChild);

    const raw = this.getAttribute('variant') ?? 'primary';
    const variant: ButtonVariant = raw in VARIANT_CLASS ? (raw as ButtonVariant) : 'primary';
    const label = this.getAttribute('label') ?? '';
    const isDisabled = this.hasAttribute('disabled');

    const btn = document.createElement('button');
    btn.className = VARIANT_CLASS[variant];
    btn.textContent = label;
    btn.disabled = isDisabled;

    this.appendChild(btn);
  }
}

customElements.define('mfw-button', MfwButton);
