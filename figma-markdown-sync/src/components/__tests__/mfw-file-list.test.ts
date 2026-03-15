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
      { name: 'readme.md', size: 1024 },
      { name: 'notes.md', size: 512 },
    ]);
    expect(el.querySelectorAll('li').length).toBe(2);
  });

  it('setFiles shows file names as text content', () => {
    const el = make();
    (el as any).setFiles([{ name: 'design.md', size: 200 }]);
    expect(el.querySelector('li')!.textContent).toBe('design.md');
  });

  it('setFiles clears previous list before rendering', () => {
    const el = make();
    (el as any).setFiles([{ name: 'a.md', size: 100 }]);
    (el as any).setFiles([{ name: 'b.md', size: 200 }, { name: 'c.md', size: 300 }]);
    expect(el.querySelectorAll('li').length).toBe(2);
  });
});
