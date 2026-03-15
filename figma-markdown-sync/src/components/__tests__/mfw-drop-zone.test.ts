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
    expect(el.querySelector('p.drop-zone-label')!.textContent).toBe('Drop .md files here');
  });

  it('renders a custom label text', () => {
    const el = make({ label: 'Drop Markdown here' });
    expect(el.querySelector('p.drop-zone-label')!.textContent).toBe('Drop Markdown here');
  });

  it('renders the default sublabel when none is provided', () => {
    const el = make();
    expect(el.querySelector('p.drop-zone-sublabel')!.textContent).toBe('or click to browse');
  });

  it('renders a custom sublabel text', () => {
    const el = make({ sublabel: 'or drag a file' });
    expect(el.querySelector('p.drop-zone-sublabel')!.textContent).toBe('or drag a file');
  });

  it('renders the icon container', () => {
    const el = make();
    expect(el.querySelector('div.drop-zone-icon-container')).not.toBeNull();
  });

  it('renders an SVG inside the icon container', () => {
    const el = make();
    const svg = el.querySelector('div.drop-zone-icon-container svg');
    expect(svg).not.toBeNull();
  });

  it('SVG has correct dimensions', () => {
    const el = make();
    const svg = el.querySelector('div.drop-zone-icon-container svg')!;
    expect(svg.getAttribute('width')).toBe('24');
    expect(svg.getAttribute('height')).toBe('24');
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg.getAttribute('fill')).toBe('currentColor');
  });

  it('dispatches mfw-drop-click on click', () => {
    const el = make();
    let fired = false;
    el.addEventListener('mfw-drop-click', () => { fired = true; });
    (el.querySelector('div.drop-zone') as HTMLElement).click();
    expect(fired).toBe(true);
  });

  it('does not double-render on reconnect', () => {
    const el = make({ label: 'Drop' });
    document.body.removeChild(el);
    document.body.appendChild(el);
    expect(el.querySelectorAll('div.drop-zone').length).toBe(1);
  });
});
