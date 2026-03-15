/**
 * @jest-environment jsdom
 */
import '../mfw-settings-row';
import { makeComponent } from '../test-helpers';

describe('mfw-settings-row', () => {
  afterEach(() => { document.body.textContent = ''; });

  it('registers as a custom element', () => {
    expect(customElements.get('mfw-settings-row')).toBeDefined();
  });

  it('renders a label and a number input for type=number', () => {
    const el = makeComponent('mfw-settings-row', {
      label: 'Block spacing', type: 'number', 'input-id': 'blockSpacing', min: '0', max: '200', unit: 'px',
    });
    expect(el.querySelector('span.settings-label')!.textContent).toBe('Block spacing');
    const input = el.querySelector<HTMLInputElement>('input[type="number"]')!;
    expect(input).not.toBeNull();
    expect(input.id).toBe('blockSpacing');
    expect(input.min).toBe('0');
    expect(input.max).toBe('200');
    expect(el.querySelector('span.settings-unit')!.textContent).toBe('px');
  });

  it('renders a select for type=select', () => {
    const el = makeComponent('mfw-settings-row', {
      label: 'Width', type: 'select', 'input-id': 'widthMode',
    });
    const select = el.querySelector<HTMLSelectElement>('select')!;
    expect(select).not.toBeNull();
    expect(select.id).toBe('widthMode');
  });

  it('setOptions populates a select', () => {
    const el = makeComponent('mfw-settings-row', { label: 'Width', type: 'select', 'input-id': 'widthMode' });
    (el as any).setOptions([
      { value: 'narrow', label: 'Narrow (480px)' },
      { value: 'medium', label: 'Medium (800px)' },
    ]);
    const options = el.querySelectorAll('option');
    expect(options.length).toBe(2);
    expect(options[0].value).toBe('narrow');
    expect(options[1].textContent).toBe('Medium (800px)');
  });

  it('renders a checkbox for type=checkbox', () => {
    const el = makeComponent('mfw-settings-row', {
      label: 'Generate TOC', type: 'checkbox', 'input-id': 'generateToc',
    });
    const cb = el.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(cb).not.toBeNull();
    expect(cb.id).toBe('generateToc');
  });

  it('forwards select-class and data-binding to the rendered select', () => {
    const el = makeComponent('mfw-settings-row', {
      label: 'H1', type: 'select', 'input-id': 'style-h1',
      'select-class': 'style-binding-select', 'data-binding': 'h1',
    });
    const select = el.querySelector<HTMLSelectElement>('select')!;
    expect(select.classList.contains('style-binding-select')).toBe(true);
    expect(select.getAttribute('data-binding')).toBe('h1');
  });

  it('warns and falls back to number for unknown type', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const el = makeComponent('mfw-settings-row', { label: 'Test', type: 'color', 'input-id': 'x' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[mfw-settings-row]'));
    expect(el.querySelector('input[type="number"]')).not.toBeNull();
    warn.mockRestore();
  });
});
