/**
 * @jest-environment jsdom
 */
import '../mfw-loader';
import { makeComponent } from '../test-helpers';

describe('mfw-loader', () => {
  function make(attrs: Record<string, string> = {}): HTMLElement {
    return makeComponent('mfw-loader', attrs);
  }

  afterEach(() => { document.body.textContent = ''; });

  it('registers as a custom element', () => {
    expect(customElements.get('mfw-loader')).toBeDefined();
  });

  it('renders hidden overlay when visible attribute is absent', () => {
    const el = make();
    const overlay = el.querySelector('.loader-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay!.classList.contains('hidden')).toBe(true);
  });

  it('renders visible overlay when visible attribute is present', () => {
    const el = make({ visible: '' });
    const overlay = el.querySelector('.loader-overlay');
    expect(overlay!.classList.contains('hidden')).toBe(false);
  });

  it('renders a spinner and message', () => {
    const el = make({ visible: '' });
    expect(el.querySelector('.spinner')).not.toBeNull();
    expect(el.querySelector('p')!.textContent).toContain('Importing');
  });

  it('shows when visible attribute is added', () => {
    const el = make();
    el.setAttribute('visible', '');
    const overlay = el.querySelector('.loader-overlay');
    expect(overlay!.classList.contains('hidden')).toBe(false);
  });

  it('hides when visible attribute is removed', () => {
    const el = make({ visible: '' });
    el.removeAttribute('visible');
    const overlay = el.querySelector('.loader-overlay');
    expect(overlay!.classList.contains('hidden')).toBe(true);
  });
});
