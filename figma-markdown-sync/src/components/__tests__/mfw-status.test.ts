/**
 * @jest-environment jsdom
 */
import '../mfw-status';
import { makeComponent } from '../test-helpers';

describe('mfw-status', () => {
  function make(attrs: Record<string, string> = {}): HTMLElement {
    return makeComponent('mfw-status', attrs);
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

  it('applies success modifier class', () => {
    const el = make({ message: 'Done', type: 'success' });
    expect(el.querySelector('p')!.classList.contains('status-message--success')).toBe(true);
  });

  it('applies error modifier class', () => {
    const el = make({ message: 'Failed', type: 'error' });
    expect(el.querySelector('p')!.classList.contains('status-message--error')).toBe(true);
  });

  it('applies no modifier class for info type', () => {
    const el = make({ message: 'Note', type: 'info' });
    const p = el.querySelector('p')!;
    expect(p.classList.length).toBe(1);
    expect(p.classList.contains('status-message')).toBe(true);
  });

  it('falls back to info (no modifier) for an unrecognised type', () => {
    const el = make({ message: 'Oops', type: 'banana' });
    const p = el.querySelector('p')!;
    expect(p.classList.contains('status-message--banana')).toBe(false);
    expect(p.classList.length).toBe(1);
  });

  it('does not double-render on reconnect', () => {
    const el = make({ message: 'X' });
    document.body.removeChild(el);
    document.body.appendChild(el);
    expect(el.querySelectorAll('p').length).toBe(1);
  });
});
