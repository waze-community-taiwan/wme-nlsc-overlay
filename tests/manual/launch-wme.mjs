// Manual harness: spawn Microsoft Edge stable as a normal child process with
// a persistent profile and a remote-debugging port, then attach Playwright
// via CDP. Google's sign-in flow blocks browsers that Playwright launches
// itself ("This browser or app may not be secure") — the CDP-attach pattern
// is the only known workaround that survives Google's runtime fingerprinting
// in current (2025+) versions. The userscript is injected as an init script
// on the attached context so it runs on every navigation, mimicking
// Tampermonkey.
//
// Run: node tests/manual/launch-wme.mjs
// Stop: close the browser window or Ctrl+C this process.

import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const userscriptPath = path.join(repoRoot, 'dist', 'wme-nlsc-overlay.user.js');
const profileDir = path.join(repoRoot, '.playwright-profile');
const CDP_PORT = 9222;
const EDGE_PATH = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';

if (!fs.existsSync(userscriptPath)) {
  console.error(`[harness] missing build at ${userscriptPath}. Run \`npm run build\` first.`);
  process.exit(1);
}

if (!fs.existsSync(EDGE_PATH)) {
  console.error(`[harness] Microsoft Edge not found at ${EDGE_PATH}. Install Edge stable or update EDGE_PATH.`);
  process.exit(1);
}

const userscript = fs.readFileSync(userscriptPath, 'utf8');

const ts = () => new Date().toISOString().slice(11, 23);
const log = (tag, msg) => console.log(`[${ts()}] [${tag}] ${msg}`);

const waitForPort = (port, timeoutMs = 15_000) =>
  new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tryConnect = () => {
      const sock = net.createConnection({ port, host: '127.0.0.1' });
      sock.once('connect', () => { sock.end(); resolve(); });
      sock.once('error', () => {
        sock.destroy();
        if (Date.now() > deadline) reject(new Error(`port ${port} not open after ${timeoutMs}ms`));
        else setTimeout(tryConnect, 200);
      });
    };
    tryConnect();
  });

log('harness', `spawning Edge with --remote-debugging-port=${CDP_PORT}, profile at ${profileDir}`);

// Spawn Edge ourselves so Playwright's launcher flags (--enable-automation,
// CDP pre-attach, etc.) never touch it. Edge writes a DevToolsActivePort file
// inside the profile once the debugger is ready.
const edgeProc = spawn(EDGE_PATH, [
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${profileDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  'https://www.waze.com/editor',
], {
  detached: false,
  stdio: 'ignore',
});

edgeProc.on('exit', (code) => log('harness', `Edge process exited with code ${code}`));

await waitForPort(CDP_PORT);
log('harness', `CDP endpoint open on :${CDP_PORT}, attaching Playwright`);

// `noDefaults: true` tells Playwright to skip its initialization overrides on
// the existing default context — most importantly the `Browser.setDownloadBehavior`
// CDP call, which Edge stable (148+) rejects with "Browser context management
// is not supported" when attached to a user-launched browser. The option is
// documented for exactly this "daily-driver attach" scenario.
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`, { noDefaults: true });
const context = browser.contexts()[0] ?? (await browser.newContext());

// Real Tampermonkey provides GM_xmlhttpRequest, which runs in the extension
// context and bypasses Waze's editor CSP (which blocks plain fetch() to
// wmts.nlsc.gov.tw). The harness has no extension, so we expose a Node-side
// fetcher and install a polyfill that forwards GM_xmlhttpRequest calls to it.
await context.exposeFunction('__harnessGmFetch__', async (opts) => {
  try {
    const res = await fetch(opts.url, { method: opts.method ?? 'GET' });
    const responseText = await res.text();
    return { ok: true, status: res.status, statusText: res.statusText, responseText };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

const gmPolyfill = `
  // GM_xmlhttpRequest polyfill backed by the Node-side __harnessGmFetch__.
  if (typeof window.GM_xmlhttpRequest === 'undefined') {
    window.GM_xmlhttpRequest = (opts) => {
      Promise.resolve(window.__harnessGmFetch__({ method: opts.method || 'GET', url: opts.url }))
        .then((res) => {
          if (res.ok) opts.onload && opts.onload({ status: res.status, statusText: res.statusText, responseText: res.responseText });
          else opts.onerror && opts.onerror({ error: res.error });
        })
        .catch((err) => opts.onerror && opts.onerror({ error: String(err) }));
      return { abort: () => {} };
    };
  }
`;
await context.addInitScript({ content: gmPolyfill });

// Tampermonkey honors the userscript's `@run-at: document-idle` metablock,
// which means it fires after WME's bootstrap has populated
// `window.SDK_INITIALIZED` and `window.getWmeSdk`. Playwright's
// `addInitScript` runs *before* any page script, so we wrap the userscript
// in a small bootstrap that polls for those globals first.
const wrappedUserscript = `(async () => {
  const ready = () =>
    typeof window.getWmeSdk === 'function' &&
    !!window.SDK_INITIALIZED &&
    !!window.OL &&
    !!window.W && !!window.W.map && !!window.W.map.olMap;
  while (!ready()) {
    await new Promise((r) => setTimeout(r, 100));
  }
  ${userscript}
})();`;
await context.addInitScript({ content: wrappedUserscript });
log('harness', 'userscript registered as init script (will inject on every page)');

const attachLoggers = (page) => {
  page.on('console', (msg) => log(`console.${msg.type()}`, msg.text()));
  page.on('pageerror', (err) => log('pageerror', err.message));
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) log('nav', frame.url());
  });
};

context.on('page', attachLoggers);
for (const existing of context.pages()) attachLoggers(existing);

// Re-navigate the active tab so the init script is applied to the WME page
// load too (init scripts only apply to navigations after addInitScript).
const page = context.pages()[0] ?? (await context.newPage());
await page.goto('https://www.waze.com/editor', { waitUntil: 'domcontentloaded' });

log('harness', 'log in to Waze in the Edge window — Google sign-in should now succeed');
log('harness', 'console output will appear below. Close the browser window or Ctrl+C to end this session.');

await new Promise((resolve) => {
  edgeProc.once('exit', resolve);
  process.once('SIGINT', () => { edgeProc.kill('SIGTERM'); resolve(); });
});

log('harness', 'browser closed, exiting');
process.exit(0);
