/**
 * @jest-environment jsdom
 */
import '../mfw-color-input';
import { makeComponent } from '../test-helpers';

describe('mfw-color-input', () => {
  afterEach(() => { document.body.textContent = ''; });

  it('registers as a custom element', () => {
    expect(customElements.get('mfw-color-input')).toBeDefined();
  });

  it('renders a text input with the given input-id and placeholder', () => {
    const el = makeComponent('mfw-color-input', { 'input-id': 'frameFillColor', placeholder: '#FFFFFF' });
    const textInput = el.querySelector<HTMLInputElement>('input[type="text"]')!;
    expect(textInput).not.toBeNull();
    expect(textInput.id).toBe('frameFillColor');
    expect(textInput.placeholder).toBe('#FFFFFF');
  });

  it('renders a color swatch input with id matching <input-id>-swatch', () => {
    const el = makeComponent('mfw-color-input', { 'input-id': 'frameFillColor', placeholder: '#FFFFFF' });
    const swatch = el.querySelector<HTMLInputElement>('input[type="color"]')!;
    expect(swatch).not.toBeNull();
    expect(swatch.id).toBe('frameFillColor-swatch');
  });

  it('syncs swatch to text input when text changes to valid hex', () => {
    const el = makeComponent('mfw-color-input', { 'input-id': 'codeBackground', placeholder: '#F2F2F2' });
    const textInput = el.querySelector<HTMLInputElement>('input[type="text"]')!;
    const swatch = el.querySelector<HTMLInputElement>('input[type="color"]')!;
    textInput.value = '#1B3543';
    textInput.dispatchEvent(new Event('change'));
    expect(swatch.value).toBe('#1b3543');
  });

  it('syncs text input to swatch when swatch changes', () => {
    const el = makeComponent('mfw-color-input', { 'input-id': 'separatorColor', placeholder: '#CCCCCC' });
    const textInput = el.querySelector<HTMLInputElement>('input[type="text"]')!;
    const swatch = el.querySelector<HTMLInputElement>('input[type="color"]')!;
    swatch.value = '#52c7a0';
    swatch.dispatchEvent(new Event('input'));
    expect(textInput.value).toBe('#52c7a0');
  });
});
