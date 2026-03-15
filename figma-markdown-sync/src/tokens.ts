export const Color = {
  // Backgrounds
  gray1:  '#161616',  // main bg
  gray2:  '#1c1c1c',  // elevated surface (tab bar, file rows)
  gray3:  '#232323',  // input bg, drop bg, subtle surface
  gray6:  '#343434',  // border muted, dividers
  gray8:  '#505050',  // border strong, version text
  gray11: '#a0a0a0',  // text muted, meta, labels
  gray12: '#ededed',  // text default

  // Mint (accent)
  mint8:  '#006d5b',  // accent border + inset shadow
  mint9:  '#70e1c8',  // accent glow (box-shadow)
  mint10: '#25d0ab',  // accent fill — interactive backgrounds
  mint11: '#25d0ab',  // accent text — foreground on dark surfaces (same hex, semantic distinction)

  // Red (error / destructive)
  red8:   '#aa2429',  // error border + inset shadow
  red10:  '#f2555a',  // error fill
  red11:  '#ff6369',  // error text

  // Orange (in-progress)
  orange11: '#ff8b3e',
} as const;

export const Spacing = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
} as const;

export const Radius = {
  sm: '4px',
  md: '6px',
  lg: '8px',
} as const;

export const Font = {
  // Font family stacks
  sansSerif:  '"Space Grotesk", sans-serif',  // file names, headings, drop zone label, error title
  mono:       '"Geist Mono", monospace',       // buttons, labels, values, log entries
  monoBrand:  '"Geist Pixel", monospace',      // meta text, status, section headers, unit suffixes

  // Sizes (toKebab produces --font-size-xs through --font-size-display)
  sizeXs:      '8px',
  sizeSm:      '9px',
  sizeMd:      '10px',
  sizeLg:      '11px',
  sizeXl:      '12px',
  sizeXxl:     '13px',
  sizeXxxl:    '14px',
  sizeDisplay: '16px',

  // Weights
  weightNormal:   '400',
  weightMedium:   '500',
  weightSemiBold: '600',
  weightBold:     '700',
} as const;

export const Transition = {
  fast:    '0.15s',
  spinner: '0.7s linear',
} as const;

type TokenRecord = Record<string, string>;

const NAMESPACES: Record<string, TokenRecord> = {
  color:      Color      as unknown as TokenRecord,
  spacing:    Spacing    as unknown as TokenRecord,
  radius:     Radius     as unknown as TokenRecord,
  font:       Font       as unknown as TokenRecord,
  transition: Transition as unknown as TokenRecord,
};

/** Converts camelCase to kebab-case: "bgAlt" → "bg-alt", "sizeXxl" → "size-xxl" */
function toKebab(camel: string): string {
  return camel.replace(/([A-Z])/g, '-$1').toLowerCase();
}

/** Returns a :root { ... } block with all token namespaces as CSS custom properties. */
export function buildTokensCSS(): string {
  const lines: string[] = [':root {'];
  for (const [ns, tokens] of Object.entries(NAMESPACES)) {
    for (const [key, value] of Object.entries(tokens)) {
      lines.push(`  --${ns}-${toKebab(key)}: ${value};`);
    }
  }
  lines.push('}');
  return lines.join('\n');
}
