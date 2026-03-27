// No @jest-environment annotation needed — runs in Node (default)
import { buildTokensCSS, Color, Font } from './tokens';

describe('buildTokensCSS', () => {
  let css: string;

  beforeAll(() => { css = buildTokensCSS(); });

  it('returns a :root block', () => {
    expect(css.trimStart()).toMatch(/^:root \{/);
    expect(css.trimEnd()).toMatch(/\}$/);
  });

  it('maps Color.gray1 to --color-gray1', () => {
    expect(css).toContain(`--color-gray1: ${Color.gray1}`);
  });

  it('maps Color.mint10 to --color-mint10', () => {
    expect(css).toContain(`--color-mint10: ${Color.mint10}`);
  });

  it('maps Color.red11 to --color-red11', () => {
    expect(css).toContain(`--color-red11: ${Color.red11}`);
  });

  it('maps Font.sizeXxl to --font-size-xxl', () => {
    expect(css).toContain(`--font-size-xxl: ${Font.sizeXxl}`);
  });

  it('maps Font.sizeDisplay to --font-size-display', () => {
    expect(css).toContain(`--font-size-display: ${Font.sizeDisplay}`);
  });

  it('maps Font.weightBold to --font-weight-bold', () => {
    expect(css).toContain(`--font-weight-bold: ${Font.weightBold}`);
  });

  it('maps Font.sansSerif to --font-sans-serif', () => {
    expect(css).toContain('--font-sans-serif:');
  });

  it('maps Font.monoBrand to --font-mono-brand', () => {
    expect(css).toContain('--font-mono-brand:');
  });
});
