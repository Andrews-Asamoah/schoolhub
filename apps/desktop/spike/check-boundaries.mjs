import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = new URL('../../web/src/', import.meta.url);
function walk(path) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const name = join(path, entry.name);
    if (entry.isDirectory()) walk(name);
    else if (/\.[cm]?[jt]sx?$/.test(name) && !name.endsWith('.test.ts')) {
      const text = readFileSync(name, 'utf8');
      if (text.includes('@tauri-apps/') && !name.replaceAll('\\', '/').includes('/lib/platform/desktop/')) {
        throw new Error(`Native import outside desktop platform boundary: ${name}`);
      }
    }
  }
}
walk(fileURLToPath(root));
console.log('Native import boundary checks passed');
