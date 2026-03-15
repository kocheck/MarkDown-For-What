/**
 * @jest-environment jsdom
 */
import '../mfw-drop-zone';
import { makeComponent } from '../test-helpers';

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

  it('renders the default label when none is provided', () => {
    const el = make();
    expect(el.querySelector('p.drop-zone-label')!.textContent).toBe('Drop your Markdown here');
  });

  it('renders a custom label text', () => {
    const el = make({ label: 'Drop Markdown here' });
    expect(el.querySelector('p.drop-zone-label')!.textContent).toBe('Drop Markdown here');
  });

  it('renders the default sub-label when none is provided', () => {
    const el = make();
    expect(el.querySelector('p.drop-zone-sub')!.textContent).toBe('or click to browse');
  });

  it('renders a custom sub-label text', () => {
    const el = make({ 'sub-label': 'or click to browse' });
    expect(el.querySelector('p.drop-zone-sub')!.textContent).toBe('or click to browse');
  });

  it('renders a file input with the default accept attribute', () => {
    const el = make();
    const input = el.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toBe('.md,.markdown,.txt');
  });

  it('renders a file input with a custom accept attribute', () => {
    const el = make({ accept: '.md,.txt' });
    const input = el.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toBe('.md,.txt');
  });

  it('sets the file input id when input-id is provided', () => {
    const el = make({ 'input-id': 'md-upload' });
    expect((el.querySelector('input[type="file"]') as HTMLInputElement).id).toBe('md-upload');
  });

  it('does not set a file input id when input-id is absent', () => {
    const el = make();
    expect((el.querySelector('input[type="file"]') as HTMLInputElement).id).toBe('');
  });

  it('sets the file input to accept multiple files', () => {
    const el = make();
    expect((el.querySelector('input[type="file"]') as HTMLInputElement).multiple).toBe(true);
  });

  it('sets an aria-label on the file input', () => {
    const el = make();
    expect(el.querySelector('input[type="file"]')!.getAttribute('aria-label')).toBe('Choose Markdown files');
  });

  it('does not double-render on reconnect', () => {
    const el = make({ label: 'Drop' });
    document.body.removeChild(el);
    document.body.appendChild(el);
    expect(el.querySelectorAll('div.drop-zone').length).toBe(1);
  });
});
