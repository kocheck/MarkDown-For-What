import * as fs from 'fs';
import * as path from 'path';
import { buildTokensCSS } from '../src/tokens';

const outPath = path.resolve(__dirname, '../src/tokens.css');
const header = '/* GENERATED — do not edit by hand. Run: npm run build:tokens */\n';
const css = buildTokensCSS();
if (!css.trim()) {
  console.error('[build-tokens] buildTokensCSS() returned empty output — aborting write');
  process.exit(1);
}
fs.writeFileSync(outPath, header + css + '\n', 'utf-8');
console.log('tokens.css written to', outPath);
