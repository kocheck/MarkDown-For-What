/**
 * @jest-environment jsdom
 */
import '../mfw-settings-section';
import { makeComponent } from '../test-helpers';

describe('mfw-settings-section', () => {
  afterEach(() => { document.body.textContent = ''; });

  it('registers as a custom element', () => {
    expect(customElements.get('mfw-settings-section')).toBeDefined();
  });

  it('applies settings-section class to itself', () => {
    const el = makeComponent('mfw-settings-section', { title: 'Theme' });
    expect(el.classList.contains('settings-section')).toBe(true);
  });

  it('renders an h3 with settings-section-title class', () => {
    const el = makeComponent('mfw-settings-section', { title: 'Spacing' });
    const h3 = el.querySelector('h3.settings-section-title');
    expect(h3).not.toBeNull();
    expect(h3!.textContent).toBe('Spacing');
  });

  it('does not render h3 when title attribute is absent', () => {
    const el = makeComponent('mfw-settings-section', {});
    expect(el.querySelector('h3')).toBeNull();
  });

  it('preserves existing child elements when title is rendered', () => {
    const el = document.createElement('mfw-settings-section');
    el.setAttribute('title', 'Frame');
    const child = document.createElement('label');
    child.className = 'settings-row';
    el.appendChild(child);
    document.body.appendChild(el);
    expect(el.querySelector('label.settings-row')).not.toBeNull();
  });

  it('does not duplicate h3 on reconnect', () => {
    const el = makeComponent('mfw-settings-section', { title: 'Colors' });
    document.body.removeChild(el);
    document.body.appendChild(el);
    expect(el.querySelectorAll('h3').length).toBe(1);
  });
});
