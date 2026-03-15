export const Color = {
  block:         '#1B3543',
  accent:        '#52C7A0',
  bg:            '#EFF4F2',
  bgAlt:         '#E6EDEB',
  border:        '#D8E5E0',
  borderSubtle:  '#F0F0F0',
  textPrimary:   '#333333',
  textSecondary: '#555555',
  textMuted:     '#888888',
  textHint:      '#6B8E82',
  success:       '#18A449',
  warning:       '#9B6E00',
  error:         '#D32F2F',
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
  sizeXs:       '10px',
  sizeSm:       '11px',
  sizeMd:       '12px',
  sizeLg:       '13px',
  weightNormal: '400',
  weightMedium: '500',
  weightBold:   '600',
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

/** Converts camelCase to kebab-case: "bgAlt" → "bg-alt", "sizeXs" → "size-xs" */
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
