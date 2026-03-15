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

  it('renders a status-dot span and a status-text span', () => {
    const el = make({ message: 'Ready' });
    expect(el.querySelector('.status-dot')).not.toBeNull();
    expect(el.querySelector('.status-text')).not.toBeNull();
  });

  it('renders message text in status-text span', () => {
    const el = make({ message: 'Ready' });
    expect(el.querySelector('.status-text')!.textContent).toBe('Ready');
  });

  it('is hidden when no message is set', () => {
    const el = make();
    expect((el as HTMLElement).hidden).toBe(true);
  });

  it('is visible when message is set', () => {
    const el = make({ message: 'Importing...' });
    expect((el as HTMLElement).hidden).toBe(false);
  });

  it('applies success type class to host', () => {
    const el = make({ message: 'Done', type: 'success' });
    expect(el.classList.contains('status--success')).toBe(true);
  });

  it('applies error type class to host', () => {
    const el = make({ message: 'Failed', type: 'error' });
    expect(el.classList.contains('status--error')).toBe(true);
  });

  it('applies no type class for info type', () => {
    const el = make({ message: 'Note', type: 'info' });
    expect(el.classList.contains('status--success')).toBe(false);
    expect(el.classList.contains('status--error')).toBe(false);
  });

  it('does not double-render on reconnect', () => {
    const el = make({ message: 'X' });
    document.body.removeChild(el);
    document.body.appendChild(el);
    expect(el.querySelectorAll('.status-dot').length).toBe(1);
  });
});
