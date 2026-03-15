/**
 * @jest-environment jsdom
 */
import '../mfw-file-list';
import { makeComponent } from '../test-helpers';

describe('mfw-file-list', () => {
  function make(): HTMLElement {
    return makeComponent('mfw-file-list');
  }

  afterEach(() => { document.body.textContent = ''; });

  it('registers as a custom element', () => {
    expect(customElements.get('mfw-file-list')).toBeDefined();
  });

  it('renders an empty <ul> on connect', () => {
    const el = make();
    const ul = el.querySelector('ul.file-list');
    expect(ul).not.toBeNull();
    expect(ul!.children.length).toBe(0);
  });

  it('setFiles renders one li per file', () => {
    const el = make();
    (el as any).setFiles([
      { name: 'readme.md' },
      { name: 'notes.md' },
    ]);
    expect(el.querySelectorAll('li').length).toBe(2);
  });

  it('setFiles shows file name in .file-item-name element', () => {
    const el = make();
    (el as any).setFiles([{ name: 'design.md' }]);
    expect(el.querySelector('.file-item-name')!.textContent).toBe('design.md');
  });

  it('renders name and meta when meta is provided', () => {
    const el = make();
    (el as any).setFiles([{ name: 'readme.md', meta: '2.4 KB — UTF-8' }]);
    const li = el.querySelector('li')!;
    expect(li.querySelector('.file-item-name')!.textContent).toBe('readme.md');
    expect(li.querySelector('.file-item-meta')!.textContent).toBe('2.4 KB — UTF-8');
  });

  it('does not render meta element when meta is absent', () => {
    const el = make();
    (el as any).setFiles([{ name: 'readme.md' }]);
    expect(el.querySelector('.file-item-meta')).toBeNull();
  });

  it('setFiles clears previous list before rendering', () => {
    const el = make();
    (el as any).setFiles([{ name: 'a.md' }]);
    (el as any).setFiles([{ name: 'b.md' }, { name: 'c.md' }]);
    expect(el.querySelectorAll('li').length).toBe(2);
  });

  it('setFiles([]) clears a previously populated list', () => {
    const el = make();
    (el as any).setFiles([{ name: 'a.md' }, { name: 'b.md' }]);
    (el as any).setFiles([]);
    expect(el.querySelectorAll('li').length).toBe(0);
  });
});
