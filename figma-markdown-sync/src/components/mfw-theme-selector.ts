type ThemeId = 'minimal-light' | 'dark-mode' | 'documentation';

const THEME_OPTIONS: Array<{ id: ThemeId; label: string }> = [
  { id: 'minimal-light', label: 'Light' },
  { id: 'dark-mode',     label: 'Dark' },
  { id: 'documentation', label: 'Docs' },
];

function isThemeId(value: string): value is ThemeId {
  return THEME_OPTIONS.some(t => t.id === value);
}

class MfwThemeSelector extends HTMLElement {
  static get observedAttributes() { return ['active']; }

  connectedCallback(): void {
    this.render();
  }

  attributeChangedCallback(): void {
    this.render();
  }

  render(): void {
    while (this.firstChild) this.removeChild(this.firstChild);

    const raw = this.getAttribute('active') ?? 'minimal-light';
    let active: ThemeId | null;
    if (raw === 'custom') {
      active = null;
    } else if (isThemeId(raw)) {
      active = raw;
    } else {
      console.warn(`[mfw-theme-selector] Unknown theme "${raw}", falling back to "minimal-light".`);
      active = 'minimal-light';
    }

    const container = document.createElement('div');
    container.className = 'theme-selector';

    for (const option of THEME_OPTIONS) {
      const btn = document.createElement('button');
      btn.className = `theme-btn${option.id === active ? ' active' : ''}`;
      btn.setAttribute('data-theme', option.id);
      btn.textContent = option.label;
      btn.addEventListener('click', () => {
        this.setAttribute('active', option.id);
        this.dispatchEvent(new CustomEvent('mfw-theme-change', {
          detail: { theme: option.id },
          bubbles: true,
        }));
      });
      container.appendChild(btn);
    }

    this.appendChild(container);
  }
}

customElements.define('mfw-theme-selector', MfwThemeSelector);
