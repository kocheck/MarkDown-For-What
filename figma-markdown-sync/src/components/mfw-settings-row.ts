type RowType = 'number' | 'select' | 'checkbox';

function isRowType(value: string): value is RowType {
  return value === 'number' || value === 'select' || value === 'checkbox';
}

class MfwSettingsRow extends HTMLElement {
  connectedCallback(): void {
    this.render();
  }

  render(): void {
    while (this.firstChild) this.removeChild(this.firstChild);

    this.className = 'settings-row';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'settings-row-label';
    labelSpan.textContent = this.getAttribute('label') ?? '';

    const wrap = document.createElement('div');
    wrap.className = 'settings-input-wrap';

    const rawType = this.getAttribute('type') ?? 'number';
    let type: RowType;
    if (isRowType(rawType)) {
      type = rawType;
    } else {
      console.warn(`[mfw-settings-row] Unknown type "${rawType}", falling back to "number".`);
      type = 'number';
    }

    const inputId = this.getAttribute('input-id') ?? undefined;

    if (type === 'number') {
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'settings-row-input';
      if (inputId) input.id = inputId;
      const min = this.getAttribute('min');
      const max = this.getAttribute('max');
      if (min !== null) input.min = min;
      if (max !== null) input.max = max;
      wrap.appendChild(input);

      const unit = this.getAttribute('unit');
      if (unit) {
        const unitSpan = document.createElement('span');
        unitSpan.className = 'settings-row-unit';
        unitSpan.textContent = unit;
        wrap.appendChild(unitSpan);
      }
    } else if (type === 'select') {
      const select = document.createElement('select');
      select.className = 'settings-row-select';
      const selectClass = this.getAttribute('select-class');
      if (selectClass) select.classList.add(selectClass);
      const binding = this.getAttribute('data-binding');
      if (binding) select.setAttribute('data-binding', binding);
      if (inputId) select.id = inputId;
      wrap.appendChild(select);

      const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      chevron.setAttribute('width', '14');
      chevron.setAttribute('height', '14');
      chevron.setAttribute('viewBox', '0 0 24 24');
      chevron.setAttribute('fill', 'none');
      chevron.setAttribute('stroke', 'currentColor');
      chevron.setAttribute('stroke-width', '2');
      chevron.setAttribute('class', 'settings-row-chevron');
      const chevronPath = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      chevronPath.setAttribute('points', '6 9 12 15 18 9');
      chevron.appendChild(chevronPath);
      wrap.appendChild(chevron);
    } else {
      // checkbox
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'settings-checkbox';
      if (inputId) cb.id = inputId;
      wrap.appendChild(cb);
    }

    this.appendChild(labelSpan);
    this.appendChild(wrap);
  }

  setOptions(items: Array<{ value: string; label: string }>): void {
    const select = this.querySelector('select');
    if (!select) return;
    while (select.options.length > 0) select.remove(0);
    for (const item of items) {
      const opt = document.createElement('option');
      opt.value = item.value;
      opt.textContent = item.label;
      select.appendChild(opt);
    }
  }
}

customElements.define('mfw-settings-row', MfwSettingsRow);
