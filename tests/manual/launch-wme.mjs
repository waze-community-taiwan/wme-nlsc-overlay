// Manual harness: launch a headed Chromium with a persistent profile,
// inject the built userscript on every navigation (mimicking Tampermonkey),
// and stream all console output to stdout so the caller can verify the
// script attaches inside the real WME shell.
//
// Run: node tests/manual/launch-wme.mjs
// Stop: close the browser window.

import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const userscriptPath = path.join(repoRoot, 'dist', 'wme-nlsc-overlay.user.js');
const profileDir = path.join(repoRoot, '.playwright-profile');

if (!fs.existsSync(userscriptPath)) {
  console.error(`[harness] missing build at ${userscriptPath}. Run \`npm run build\` first.`);
  process.exit(1);
}

const userscript = fs.readFileSync(userscriptPath, 'utf8');

const ts = () => new Date().toISOString().slice(11, 23);
const log = (tag, msg) => console.log(`[${ts()}] [${tag}] ${msg}`);

log('harness', `launching Chromium with persistent profile at ${profileDir}`);

const context = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  viewport: null,
  args: ['--start-maximized'],
});

await context.addInitScript({ content: userscript });
log('harness', 'userscript registered as init script (will inject on every page)');

const attachLoggers = (page) => {
  page.on('console', (msg) => log(`console.${msg.type()}`, msg.text()));
  page.on('pageerror', (err) => log('pageerror', err.message));
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) log('nav', frame.url());
  });
};

context.on('page', attachLoggers);
const page = context.pages()[0] ?? (await context.newPage());
attachLoggers(page);

await page.goto('https://www.waze.com/editor', { waitUntil: 'domcontentloaded' });
log('harness', 'navigated to https://www.waze.com/editor — log in to Waze in the browser window');
log('harness', 'console output will appear below. Close the browser window to end this session.');

await new Promise((resolve) => context.on('close', resolve));
log('harness', 'browser closed, exiting');
