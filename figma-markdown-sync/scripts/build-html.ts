import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

function readPanel(name: string): string {
  return fs.readFileSync(path.join(ROOT, 'src', 'panels', `panel-${name}.html`), 'utf-8');
}

function readShell(name: string): string {
  return fs.readFileSync(path.join(ROOT, 'src', 'shells', `${name}-shell.html`), 'utf-8');
}

function injectPanels(shell: string): string {
  const panelNames = ['import', 'history', 'settings', 'export'];
  let result = shell;
  for (const name of panelNames) {
    result = result.replace(`<!-- PANEL:${name} -->`, readPanel(name));
  }
  return result;
}

const outputs: Array<{ shell: string; outFile: string }> = [
  { shell: 'ui',         outFile: 'ui.html' },
  { shell: 'ui-preview', outFile: 'ui-preview.html' },
];

for (const { shell, outFile } of outputs) {
  const content = injectPanels(readShell(shell));
  const outPath = path.join(ROOT, outFile);
  fs.writeFileSync(outPath, content, 'utf-8');
  console.log(`Written: ${outFile}`);
}
