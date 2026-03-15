export function makeComponent(tagName: string, attrs: Record<string, string> = {}): HTMLElement {
  const el = document.createElement(tagName);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  return el;
}
