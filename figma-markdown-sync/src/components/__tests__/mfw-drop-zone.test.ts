/**
 * @jest-environment jsdom
 */
import '../mfw-drop-zone';
import { makeComponent } from './test-utils';

describe('mfw-drop-zone', () => {
  function make(attrs: Record<string, string> = {}): HTMLElement {
    return makeComponent('mfw-drop-zone', attrs);
  }

  afterEach(() => { document.body.textContent = ''; });

  it('registers as a custom element', () => {
    expect(customElements.get('mfw-drop-zone')).toBeDefined();
  });

  it('renders a div.drop-zone wrapper', () => {
    const el = make();
    expect(el.querySelector('div.drop-zone')).not.toBeNull();
  });

  it('renders the label text', () => {
    const el = make({ label: 'Drop Markdown here' });
    const p = el.querySelector('p.drop-zone-label');
    expect(p!.textContent).toBe('Drop Markdown here');
  });

  it('renders the sub-label text', () => {
    const el = make({ 'sub-label': 'or click to browse' });
    const p = el.querySelector('p.drop-zone-sub');
    expect(p!.textContent).toBe('or click to browse');
  });

  it('renders a file input with the accept attribute', () => {
    const el = make({ accept: '.md,.txt' });
    const input = el.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.accept).toBe('.md,.txt');
  });

  it('does not double-render on reconnect', () => {
    const el = make({ label: 'Drop' });
    document.body.removeChild(el);
    document.body.appendChild(el);
    expect(el.querySelectorAll('div.drop-zone').length).toBe(1);
  });
});
