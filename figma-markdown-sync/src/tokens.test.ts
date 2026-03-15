// No @jest-environment annotation needed — runs in Node (default)
import { buildTokensCSS, Color, Font } from './tokens';

describe('buildTokensCSS', () => {
  let css: string;

  beforeAll(() => {
    css = buildTokensCSS();
  });

  it('returns a :root block', () => {
    expect(css.trimStart()).toMatch(/^:root \{/);
    expect(css.trimEnd()).toMatch(/\}$/);
  });

  it('maps Color.block to --color-block', () => {
    expect(css).toContain(`--color-block: ${Color.block}`);
  });

  it('maps camelCase Color.bgAlt to --color-bg-alt', () => {
    expect(css).toContain(`--color-bg-alt: ${Color.bgAlt}`);
  });

  it('maps Font.sizeXs to --font-size-xs', () => {
    expect(css).toContain(`--font-size-xs: ${Font.sizeXs}`);
  });

  it('maps Font.weightBold to --font-weight-bold', () => {
    expect(css).toContain(`--font-weight-bold: ${Font.weightBold}`);
  });

  it('maps Color.textPrimary to --color-text-primary', () => {
    expect(css).toContain(`--color-text-primary: ${Color.textPrimary}`);
  });
});
