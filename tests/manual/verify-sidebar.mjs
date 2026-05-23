// Attaches Playwright over CDP to the Edge instance spawned by launch-wme.mjs
// and inspects the live WME sidebar to confirm the rebuilt userscript is
// rendering the post-fix UI (新增 row at the top of the NLSC tab pane).

import { chromium } from '@playwright/test';

const CDP_URL = 'http://127.0.0.1:9222';

const browser = await chromium.connectOverCDP(CDP_URL);
const ctx = browser.contexts()[0];
if (!ctx) {
  console.error('[verify] no context — is launch-wme.mjs running?');
  process.exit(1);
}

const page =
  ctx.pages().find((p) => /www\.waze\.com\/.*editor/.test(p.url())) ??
  ctx.pages()[0];
if (!page) {
  console.error('[verify] no WME page open');
  process.exit(1);
}

console.log('[verify] attached to', page.url());

// Click into the userscript tab if not already there.
await page.evaluate(() => {
  const tab = Array.from(document.querySelectorAll('*')).find(
    (el) => el.textContent?.trim() === 'NLSC' && el.children.length === 0,
  );
  tab?.click();
});

// Wait for the NLSC heading the userscript inserts.
await page
  .waitForFunction(
    () =>
      Array.from(document.querySelectorAll('h4')).some(
        (h) => h.textContent === 'NLSC Overlay',
      ),
    null,
    { timeout: 10_000 },
  )
  .catch(() => {
    console.error('[verify] NLSC Overlay heading never appeared — userscript not running?');
  });

const report = await page.evaluate(() => {
  const heading = Array.from(document.querySelectorAll('h4')).find(
    (h) => h.textContent === 'NLSC Overlay',
  );
  if (!heading) return { ok: false, reason: 'NLSC Overlay heading not found' };
  const pane = heading.parentElement;
  if (!pane) return { ok: false, reason: 'no parent pane' };

  // Capture the order of direct children so we can confirm 新增 sits above defaults.
  const children = Array.from(pane.children).map((el, i) => {
    const tag = el.tagName.toLowerCase();
    const hasAddButton = !!el.querySelector(
      'button:not([title="移除圖層"])',
    );
    const hasSelect = !!el.querySelector('select');
    let summary = tag;
    if (hasAddButton || hasSelect) {
      const btn = el.querySelector('button:not([title="移除圖層"])');
      summary += ` [add-row: select=${hasSelect}, button="${btn?.textContent ?? ''}"]`;
    } else {
      const text = el.textContent?.trim().slice(0, 40) ?? '';
      summary += ` "${text}"`;
    }
    return `${i}: ${summary}`;
  });

  const addBtn = pane.querySelector('button');
  const addBtnStyle = addBtn
    ? {
        text: addBtn.textContent,
        background: addBtn.style.background,
        color: addBtn.style.color,
        offsetTop: addBtn.offsetTop,
        offsetHeight: addBtn.offsetHeight,
        visible:
          addBtn.offsetWidth > 0 &&
          addBtn.offsetHeight > 0 &&
          getComputedStyle(addBtn).visibility !== 'hidden',
      }
    : null;

  const select = pane.querySelector('select');
  const options = select
    ? Array.from(select.options).map((o) => o.textContent ?? '')
    : [];

  // Where does the add-row sit relative to the heading?
  const addRow = pane.querySelector('button')?.parentElement;
  const headingRect = heading.getBoundingClientRect();
  const addRowRect = addRow?.getBoundingClientRect();

  return {
    ok: true,
    paneChildren: children,
    addBtnStyle,
    optionCount: options.length,
    firstFewOptions: options.slice(0, 5),
    headingY: Math.round(headingRect.bottom),
    addRowY: addRowRect ? Math.round(addRowRect.top) : null,
    addRowAboveAllLayerRows: addRow
      ? Array.from(pane.querySelectorAll('input[type="checkbox"]'))
          .filter((cb) => !addRow.contains(cb))
          .every(
            (cb) =>
              cb.getBoundingClientRect().top >=
              (addRowRect?.bottom ?? 0),
          )
      : false,
  };
});

console.log('[verify] report:', JSON.stringify(report, null, 2));
await browser.close();
