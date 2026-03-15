/**
 * @jest-environment jsdom
 */
import '../mfw-button';
import { makeComponent } from '../test-helpers';

describe('mfw-button', () => {
  function make(attrs: Record<string, string> = {}): HTMLElement {
    return makeComponent('mfw-button', attrs);
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

  it('renders btn-ghost when variant is ghost', () => {
    const el = make({ variant: 'ghost', label: 'Cancel' });
    expect(el.querySelector('button')!.className).toBe('btn-ghost');
  });

  it('renders btn-destructive when variant is destructive', () => {
    const el = make({ variant: 'destructive', label: 'Delete' });
    expect(el.querySelector('button')!.className).toBe('btn-destructive');
  });

  it('falls back to btn-primary for an unrecognised variant', () => {
    const el = make({ variant: 'jumbo', label: 'Go' });
    expect(el.querySelector('button')!.className).toBe('btn-primary');
  });

  it('disables the button when disabled attribute present', () => {
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
