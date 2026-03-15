/**
 * @jest-environment jsdom
 */
import '../mfw-status';

describe('mfw-status', () => {
  function make(attrs: Record<string, string> = {}): HTMLElement {
    const el = document.createElement('mfw-status');
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.body.appendChild(el);
    return el;
  }

  afterEach(() => { document.body.textContent = ''; });

  it('registers as a custom element', () => {
    expect(customElements.get('mfw-status')).toBeDefined();
  });

  it('renders a p.status-message element', () => {
    const el = make({ message: 'Ready' });
    const p = el.querySelector('p');
    expect(p).not.toBeNull();
    expect(p!.classList.contains('status-message')).toBe(true);
    expect(p!.textContent).toBe('Ready');
  });

  it('is hidden when no message is set', () => {
    const el = make();
    expect(el.querySelector('p')!.hidden).toBe(true);
  });

  it('is visible when message is set', () => {
    const el = make({ message: 'Importing...' });
    expect(el.querySelector('p')!.hidden).toBe(false);
  });

  it('applies type modifier class', () => {
    const el = make({ message: 'Done', type: 'success' });
    expect(el.querySelector('p')!.classList.contains('status-message--success')).toBe(true);
  });

  it('does not double-render on reconnect', () => {
    const el = make({ message: 'X' });
    document.body.removeChild(el);
    document.body.appendChild(el);
    expect(el.querySelectorAll('p').length).toBe(1);
  });
});
