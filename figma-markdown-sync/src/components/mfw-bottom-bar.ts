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
    statusDiv.className = 'bottom-bar-status';

    const actionsDiv = document.createElement('div');
    actionsDiv.setAttribute('data-slot', 'actions');
    actionsDiv.className = 'bottom-bar-actions';

    bar.appendChild(statusDiv);
    bar.appendChild(actionsDiv);
    this.appendChild(bar);
  }
}

customElements.define('mfw-bottom-bar', MfwBottomBar);
