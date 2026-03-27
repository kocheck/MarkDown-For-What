/**
 * @jest-environment jsdom
 */
import '../mfw-tab-bar';
import { makeComponent } from '../test-helpers';

describe('mfw-tab-bar', () => {
  function make(attrs: Record<string, string> = {}): HTMLElement {
    return makeComponent('mfw-tab-bar', attrs);
  }

  afterEach(() => { document.body.textContent = ''; });

  it('registers as a custom element', () => {
    expect(customElements.get('mfw-tab-bar')).toBeDefined();
  });

  it('renders a nav with 4 tab buttons', () => {
    const el = make({ active: 'import' });
    const nav = el.querySelector('nav.tab-bar');
    expect(nav).not.toBeNull();
    expect(nav!.querySelectorAll('button.tab').length).toBe(4);
  });

  it('marks the active tab with class "active"', () => {
    const el = make({ active: 'history' });
    const activeBtn = el.querySelector('button.tab.active');
    expect(activeBtn).not.toBeNull();
    expect(activeBtn!.getAttribute('data-tab')).toBe('history');
  });

  it('defaults to import tab when no active attribute', () => {
    const el = make();
    const activeBtn = el.querySelector('button.tab.active');
    expect(activeBtn!.getAttribute('data-tab')).toBe('import');
  });

  it('fires mfw-tab-change with correct tab when a button is clicked', () => {
    const el = make({ active: 'import' });
    const received: string[] = [];
    el.addEventListener('mfw-tab-change', (e) => {
      received.push((e as CustomEvent).detail.tab);
    });
    const settingsBtn = el.querySelector<HTMLButtonElement>('[data-tab="settings"]')!;
    settingsBtn.click();
    expect(received).toEqual(['settings']);
  });

  it('does not double-render on reconnect', () => {
    const el = make({ active: 'import' });
    document.body.removeChild(el);
    document.body.appendChild(el);
    expect(el.querySelectorAll('nav').length).toBe(1);
  });
});
