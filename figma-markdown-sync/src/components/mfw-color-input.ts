import { isValidHex } from '../../utils';

class MfwColorInput extends HTMLElement {
  connectedCallback(): void {
    this.render();
  }

  render(): void {
    while (this.firstChild) this.removeChild(this.firstChild);

    const inputId = this.getAttribute('input-id') ?? '';
    const placeholder = this.getAttribute('placeholder') ?? '';

    const textInput = document.createElement('input');
    textInput.type = 'text';
    if (inputId) textInput.id = inputId;
    textInput.maxLength = 7;
    textInput.placeholder = placeholder;

    const swatch = document.createElement('input');
    swatch.type = 'color';
    swatch.className = 'color-swatch';
    if (inputId) swatch.id = `${inputId}-swatch`;

    textInput.addEventListener('change', () => {
      if (isValidHex(textInput.value)) {
        swatch.value = textInput.value;
      }
    });

    swatch.addEventListener('input', () => {
      textInput.value = swatch.value;
    });

    this.appendChild(textInput);
    this.appendChild(swatch);
  }
}

customElements.define('mfw-color-input', MfwColorInput);
