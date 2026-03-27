/**
 * @jest-environment jsdom
 */
import '../mfw-section-header';
import { makeComponent } from '../test-helpers';

describe('mfw-section-header', () => {
  function make(attrs: Record<string, string> = {}): HTMLElement {
    return makeComponent('mfw-section-header', attrs);
  }

  afterEach(() => { document.body.textContent = ''; });

  it('registers as a custom element', () => {
    expect(customElements.get('mfw-section-header')).toBeDefined();
  });

  it('renders a prefix span with text //', () => {
    const el = make({ label: 'FILES' });
    const prefix = el.querySelector('.section-header-prefix');
    expect(prefix).not.toBeNull();
    expect(prefix!.textContent).toBe('//');
  });

  it('renders a label span with the label text', () => {
    const el = make({ label: 'FILES' });
    const label = el.querySelector('.section-header-label');
    expect(label).not.toBeNull();
    expect(label!.textContent).toBe('FILES');
  });

  it('renders empty label span when label attribute is absent', () => {
    const el = make();
    expect(el.querySelector('.section-header-label')!.textContent).toBe('');
  });

  it('does not double-render on reconnect', () => {
    const el = make({ label: 'X' });
    document.body.removeChild(el);
    document.body.appendChild(el);
    expect(el.querySelectorAll('.section-header-prefix').length).toBe(1);
  });
});
