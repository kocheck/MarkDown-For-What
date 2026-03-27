const VARIANT_CLASS = {
  primary:     'btn-primary',
  ghost:       'btn-ghost',
  destructive: 'btn-destructive',
} as const;

type ButtonVariant = keyof typeof VARIANT_CLASS;

function isButtonVariant(value: string): value is ButtonVariant {
  return value in VARIANT_CLASS;
}

class MfwButton extends HTMLElement {
  connectedCallback(): void {
    this.render();
  }

  render(): void {
    while (this.firstChild) this.removeChild(this.firstChild);

    const raw = this.getAttribute('variant') ?? 'primary';
    let variant: ButtonVariant;
    if (isButtonVariant(raw)) {
      variant = raw;
    } else {
      console.warn(`[mfw-button] Unknown variant "${raw}", falling back to "primary".`);
      variant = 'primary';
    }
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
