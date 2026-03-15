/**
 * @jest-environment jsdom
 */
import '../mfw-paste-section';
import { makeComponent } from '../test-helpers';

describe('mfw-paste-section', () => {
  function make(): HTMLElement {
    return makeComponent('mfw-paste-section');
  }

  afterEach(() => { document.body.textContent = ''; });

  it('registers as a custom element', () => {
    expect(customElements.get('mfw-paste-section')).toBeDefined();
  });

  it('renders a textarea directly without a toggle button', () => {
    const el = make();
    expect(el.querySelector('textarea')).not.toBeNull();
    expect(el.querySelector('.paste-toggle-btn')).toBeNull();
  });

  it('renders a name input in paste-actions', () => {
    const el = make();
    expect(el.querySelector('input.paste-name-input')).not.toBeNull();
  });

  it('renders import button with btn-ghost class', () => {
    const el = make();
    const btn = el.querySelector('button');
    expect(btn).not.toBeNull();
    expect(btn!.className).toBe('btn-ghost');
  });

  it('reset() clears textarea and name input', () => {
    const el = make();
    const textarea = el.querySelector('textarea')!;
    const nameInput = el.querySelector('input.paste-name-input') as HTMLInputElement;
    textarea.value = 'some markdown';
    nameInput.value = 'my frame';
    (el as any).reset();
    expect(textarea.value).toBe('');
    expect(nameInput.value).toBe('');
  });

  it('fires mfw-paste-import event when import button clicked', () => {
    const el = make();
    const textarea = el.querySelector('textarea')!;
    textarea.value = '# Hello';
    const events: Event[] = [];
    el.addEventListener('mfw-paste-import', e => events.push(e));
    el.querySelector('button')!.click();
    expect(events.length).toBe(1);
  });

  it('does not double-render on reconnect', () => {
    const el = make();
    document.body.removeChild(el);
    document.body.appendChild(el);
    expect(el.querySelectorAll('textarea').length).toBe(1);
  });
});
