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

  it('renders the toggle button', () => {
    const el = make();
    expect(el.querySelector('button.paste-toggle-btn')).not.toBeNull();
  });

  it('hides the paste area by default', () => {
    const el = make();
    const wrap = el.querySelector('.paste-area-wrap')!;
    expect(wrap.classList.contains('hidden')).toBe(true);
  });

  it('reveals the paste area when toggle button is clicked', () => {
    const el = make();
    el.querySelector<HTMLButtonElement>('button.paste-toggle-btn')!.click();
    expect(el.querySelector('.paste-area-wrap')!.classList.contains('hidden')).toBe(false);
  });

  it('disables Import Paste button when textarea is empty', () => {
    const el = make();
    const importBtn = el.querySelector<HTMLButtonElement>('#paste-import-btn')!;
    expect(importBtn.disabled).toBe(true);
  });

  it('fires mfw-paste-import with text and name when Import Paste is clicked', () => {
    const el = make();
    // expand the paste area
    el.querySelector<HTMLButtonElement>('.paste-toggle-btn')!.click();
    const received: Array<{ text: string; name: string }> = [];
    el.addEventListener('mfw-paste-import', (e) => {
      received.push((e as CustomEvent).detail);
    });
    const textarea = el.querySelector<HTMLTextAreaElement>('textarea')!;
    textarea.value = '# Hello';
    textarea.dispatchEvent(new Event('input'));
    el.querySelector<HTMLInputElement>('input[type="text"]')!.value = 'My Doc';
    el.querySelector<HTMLButtonElement>('#paste-import-btn')!.click();
    expect(received).toEqual([{ text: '# Hello', name: 'My Doc' }]);
  });

  it('reset() clears textarea, name, and collapses the section', () => {
    const el = make();
    el.querySelector<HTMLButtonElement>('.paste-toggle-btn')!.click();
    const textarea = el.querySelector<HTMLTextAreaElement>('textarea')!;
    textarea.value = '# Hello';
    textarea.dispatchEvent(new Event('input'));
    (el as any).reset();
    expect(textarea.value).toBe('');
    expect(el.querySelector('.paste-area-wrap')!.classList.contains('hidden')).toBe(true);
  });
});
