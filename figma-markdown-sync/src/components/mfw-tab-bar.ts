type TabId = 'import' | 'history' | 'settings' | 'export';

const TAB_IDS: TabId[] = ['import', 'history', 'settings', 'export'];
const TAB_LABELS: Record<TabId, string> = {
  import: 'Import', history: 'History', settings: 'Settings', export: 'Export',
};

function isTabId(value: string): value is TabId {
  return (TAB_IDS as string[]).includes(value);
}

class MfwTabBar extends HTMLElement {
  connectedCallback(): void {
    this.render();
  }

  render(): void {
    while (this.firstChild) this.removeChild(this.firstChild);

    const raw = this.getAttribute('active') ?? 'import';
    const active = isTabId(raw) ? raw : 'import';
    if (!isTabId(raw)) {
      console.warn(`[mfw-tab-bar] Unknown tab "${raw}", falling back to "import".`);
    }

    const nav = document.createElement('nav');
    nav.className = 'tab-bar';

    for (const id of TAB_IDS) {
      const btn = document.createElement('button');
      btn.className = `tab${id === active ? ' active' : ''}`;
      btn.setAttribute('data-tab', id);
      btn.textContent = TAB_LABELS[id];
      btn.addEventListener('click', () => {
        this.setAttribute('active', id);
        this.render();
        this.dispatchEvent(new CustomEvent('mfw-tab-change', {
          detail: { tab: id },
          bubbles: true,
        }));
      });
      nav.appendChild(btn);
    }

    this.appendChild(nav);
  }
}

customElements.define('mfw-tab-bar', MfwTabBar);
