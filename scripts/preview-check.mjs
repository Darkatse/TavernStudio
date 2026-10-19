// Boots the preview in a headless browser and reports whether it is healthy
// and how fast it is (docs/plan/P0.md, V2, V3 and the measurements).
//
// Usage: node scripts/preview-check.mjs [--url http://localhost:3000/]
//        [--browser chrome|msedge] [--device desktop|mobile] [--reloads 3]
//        [--screenshot file.png]
//
// Needs a running dev server (`pnpm dev`) and a built vendor image. Exits 1
// when the preview did not become ready, an API request reached the network,
// a same-origin request failed, or anything was reported as an error.

import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';

const { values: options } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:3000/' },
    browser: { type: 'string', default: 'chrome' },
    device: { type: 'string', default: 'desktop' },
    reloads: { type: 'string', default: '3' },
    screenshot: { type: 'string' },
  },
});

const DEVICE_LABELS = { desktop: '桌面', mobile: '移动' };
const API = /^\/(api\/|csrf-token$|version$)/;

const browser = await chromium.launch({ channel: options.browser, headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const origin = new URL(options.url).origin;
const problems = [];

context.on('request', (request) => {
  const url = new URL(request.url());
  if (url.origin === origin && API.test(url.pathname)) {
    problems.push(`API request reached the network: ${request.method()} ${url.pathname}`);
  }
});
context.on('response', (response) => {
  const url = new URL(response.url());
  if (url.origin === origin && response.status() >= 400) {
    problems.push(`HTTP ${response.status()} ${url.pathname}${url.search}`);
  }
});

/** Opens Studio in a fresh tab and waits until `count` Views have reported ready. */
async function openStudio() {
  const page = await context.newPage();
  page.on('pageerror', (error) => problems.push(`Page error: ${error.message}`));
  await page.goto(options.url);
  await waitForViews(page, 1);
  if (options.device !== 'desktop') {
    await page.getByRole('radio', { name: DEVICE_LABELS[options.device] }).click();
    await waitForViews(page, 2);
  }
  return page;
}

async function waitForViews(page, count) {
  await page.waitForFunction(
    (expected) => performance.getEntriesByName('studio:view-ready').length >= expected,
    count,
    { timeout: 60_000 },
  );
}

async function measure(page) {
  return page.evaluate(() => {
    const [view] = performance.getEntriesByName('studio:view-ready').slice(-1);
    const [worker] = performance.getEntriesByName('studio:session-worker');
    const [data] = performance.getEntriesByName('studio:session-data');
    const frame = document.querySelector('iframe[title="预览"]');
    const resources = frame.contentWindow.performance.getEntriesByType('resource');
    return {
      ready: Math.round(view.startTime + view.duration),
      worker: Math.round(worker?.duration ?? 0),
      data: Math.round(data?.duration ?? 0),
      vendor: Math.round(view.duration),
      requests: resources.length,
      transferredKB: Math.round(resources.reduce((sum, r) => sum + r.transferSize, 0) / 1024),
      decodedKB: Math.round(resources.reduce((sum, r) => sum + r.decodedBodySize, 0) / 1024),
    };
  });
}

let page;
let report;
try {
  page = await openStudio();
  const cold = await measure(page);

  const reloads = [];
  for (let i = 0; i < Number(options.reloads); i++) {
    const before = await page.evaluate(
      () => performance.getEntriesByName('studio:view-ready').length,
    );
    await page.getByRole('button', { name: '重新载入预览' }).click();
    await waitForViews(page, before + 1);
    reloads.push((await measure(page)).vendor);
  }

  const warmPage = await openStudio();
  const warm = await measure(warmPage);

  if (options.screenshot) await page.screenshot({ path: options.screenshot });
  const diagnostics = await page.evaluate(() => window.__TAVERN_STUDIO__.diagnostics);
  for (const entry of diagnostics)
    problems.push(`${entry.level} (${entry.frame}, ${entry.kind}): ${entry.message}`);

  report = { browser: options.browser, device: options.device, cold, warm, reloads };
} catch (error) {
  problems.push(`Preview did not become ready: ${error.message}`);
}

console.log(JSON.stringify({ ...report, problems }, null, 2));
await browser.close();
process.exitCode = problems.length ? 1 : 0;
