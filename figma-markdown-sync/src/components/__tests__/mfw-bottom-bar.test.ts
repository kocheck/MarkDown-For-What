/**
 * @jest-environment jsdom
 */
import '../mfw-bottom-bar';
import { makeComponent } from '../test-helpers';

describe('mfw-bottom-bar', () => {
  function make(): HTMLElement {
    return makeComponent('mfw-bottom-bar');
  }

  afterEach(() => { document.body.textContent = ''; });

  it('registers as a custom element', () => {
    expect(customElements.get('mfw-bottom-bar')).toBeDefined();
  });

  it('renders a .bottom-bar container', () => {
    const el = make();
    expect(el.querySelector('.bottom-bar')).not.toBeNull();
  });

  it('renders a status slot and an actions slot', () => {
    const el = make();
    expect(el.querySelector('[data-slot="status"]')).not.toBeNull();
    expect(el.querySelector('[data-slot="actions"]')).not.toBeNull();
  });

  it('allows programmatic children to be added to slots', () => {
    const el = make();
    const statusSlot = el.querySelector('[data-slot="status"]')!;
    const p = document.createElement('p');
    p.textContent = 'Ready';
    statusSlot.appendChild(p);
    expect(el.querySelector('[data-slot="status"] p')!.textContent).toBe('Ready');
  });

  it('does not double-render on reconnect', () => {
    const el = make();
    document.body.removeChild(el);
    document.body.appendChild(el);
    expect(el.querySelectorAll('.bottom-bar').length).toBe(1);
  });
});
