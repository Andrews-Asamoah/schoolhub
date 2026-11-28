import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const config = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url)));
const capability = JSON.parse(readFileSync(new URL('../src-tauri/capabilities/main.json', import.meta.url)));
assert.equal(config.build.frontendDist, '../../web/dist-desktop');
assert.equal(config.bundle.active, false, 'The spike must not publish an installer');
assert.equal(config.app.windows[0].devtools, false);
assert.deepEqual(capability.permissions, ["allow-desktop-request", "allow-desktop-select-school", "allow-desktop-remember-session", "allow-desktop-resume-session", "allow-desktop-forget-session"]);
assert(!config.app.security.csp.includes('unsafe-eval'));
assert(!config.app.security.csp.includes('https:'));
console.log('Desktop configuration checks passed');

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
const cargo = readFileSync(new URL('../src-tauri/Cargo.toml', import.meta.url), 'utf8');
assert.equal(config.version, pkg.version);
assert.equal(cargo.match(/^version = "([^"]+)"/m)?.[1], pkg.version);
