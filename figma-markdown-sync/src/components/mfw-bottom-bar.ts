class MfwBottomBar extends HTMLElement {
  connectedCallback(): void {
    this.render();
  }

  render(): void {
    while (this.firstChild) this.removeChild(this.firstChild);

    const bar = document.createElement('div');
    bar.className = 'bottom-bar';

    const statusDiv = document.createElement('div');
    statusDiv.setAttribute('data-slot', 'status');
    statusDiv.style.flex = '1';
    statusDiv.style.display = 'flex';
    statusDiv.style.alignItems = 'center';

    const actionsDiv = document.createElement('div');
    actionsDiv.setAttribute('data-slot', 'actions');
    actionsDiv.style.display = 'flex';
    actionsDiv.style.gap = '8px';
    actionsDiv.style.alignItems = 'center';

    bar.appendChild(statusDiv);
    bar.appendChild(actionsDiv);
    this.appendChild(bar);
  }
}

customElements.define('mfw-bottom-bar', MfwBottomBar);
