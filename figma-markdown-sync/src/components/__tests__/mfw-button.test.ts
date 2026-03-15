/**
 * @jest-environment jsdom
 */
import '../mfw-button';

describe('mfw-button', () => {
  function make(attrs: Record<string, string> = {}): HTMLElement {
    const el = document.createElement('mfw-button');
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.body.appendChild(el);
    return el;
  }

  afterEach(() => { document.body.textContent = ''; });

  it('registers as a custom element', () => {
    expect(customElements.get('mfw-button')).toBeDefined();
  });

  it('renders a button with btn-primary class by default', () => {
    const el = make({ label: 'Click me' });
    const btn = el.querySelector('button');
    expect(btn).not.toBeNull();
    expect(btn!.className).toBe('btn-primary');
    expect(btn!.textContent).toBe('Click me');
  });

  it('renders btn-secondary when variant is secondary', () => {
    const el = make({ variant: 'secondary', label: 'Cancel' });
    expect(el.querySelector('button')!.className).toBe('btn-secondary');
  });

  it('renders btn-link when variant is link', () => {
    const el = make({ variant: 'link', label: 'All' });
    expect(el.querySelector('button')!.className).toBe('btn-link');
  });

  it('passes disabled attribute to inner button', () => {
    const el = make({ label: 'Go', disabled: '' });
    expect(el.querySelector('button')!.disabled).toBe(true);
  });

  it('does not double-render on reconnect', () => {
    const el = make({ label: 'X' });
    document.body.removeChild(el);
    document.body.appendChild(el);
    expect(el.querySelectorAll('button').length).toBe(1);
  });
});
