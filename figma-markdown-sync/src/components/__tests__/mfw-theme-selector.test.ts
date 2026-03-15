/**
 * @jest-environment jsdom
 */
import '../mfw-theme-selector';
import { makeComponent } from '../test-helpers';

describe('mfw-theme-selector', () => {
  function make(attrs: Record<string, string> = {}): HTMLElement {
    return makeComponent('mfw-theme-selector', attrs);
  }

  afterEach(() => { document.body.textContent = ''; });

  it('registers as a custom element', () => {
    expect(customElements.get('mfw-theme-selector')).toBeDefined();
  });

  it('renders 3 theme buttons inside .theme-selector', () => {
    const el = make({ active: 'minimal-light' });
    const container = el.querySelector('.theme-selector');
    expect(container).not.toBeNull();
    expect(container!.querySelectorAll('button.theme-btn').length).toBe(3);
  });

  it('marks the active theme button', () => {
    const el = make({ active: 'dark-mode' });
    const activeBtn = el.querySelector('button.theme-btn.active');
    expect(activeBtn!.getAttribute('data-theme')).toBe('dark-mode');
  });

  it('fires mfw-theme-change with correct theme when clicked', () => {
    const el = make({ active: 'minimal-light' });
    const received: string[] = [];
    el.addEventListener('mfw-theme-change', (e) => {
      received.push((e as CustomEvent).detail.theme);
    });
    const docsBtn = el.querySelector<HTMLButtonElement>('[data-theme="documentation"]')!;
    docsBtn.click();
    expect(received).toEqual(['documentation']);
  });

  it('falls back to minimal-light for unknown active value', () => {
    const el = make({ active: 'neon' });
    const activeBtn = el.querySelector('button.theme-btn.active');
    expect(activeBtn!.getAttribute('data-theme')).toBe('minimal-light');
  });
});
