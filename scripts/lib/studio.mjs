// Drives Studio in a headless browser for checks and experiments.

import { chromium, firefox, webkit } from 'playwright-core';

const API = /^\/(api\/|csrf-token$|version$)/;
const DEVICE_LABELS = { desktop: '桌面', mobile: '移动' };
/** Firefox and WebKit are Playwright's own builds; Chrome and Edge are the installed browsers. */
const ENGINES = { firefox, webkit };

/**
 * Launches a browser and collects what goes wrong across every page: API
 * requests reaching the network, same-origin error responses, page errors.
 */
export async function launch({ url, browser: name = 'chrome', args = [], headless = true }) {
  const engine = ENGINES[name];
  const browser = engine
    ? await engine.launch({ headless, args })
    : await chromium.launch({ channel: name, headless, args });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const origin = new URL(url).origin;
  const problems = [];

  context.on('request', (request) => {
    const target = new URL(request.url());
    if (target.origin === origin && API.test(target.pathname)) {
      problems.push(`API request reached the network: ${request.method()} ${target.pathname}`);
    }
  });
  context.on('response', (response) => {
    const target = new URL(response.url());
    if (target.origin === origin && response.status() >= 400) {
      problems.push(`HTTP ${response.status()} ${target.pathname}${target.search}`);
    }
  });

  return { browser, context, problems };
}

/** Opens Studio in a new tab and waits until the preview of `device` is ready. */
export async function openStudio({ context, problems }, url, device = 'desktop') {
  const page = await context.newPage();
  page.on('pageerror', (error) => problems.push(`Page error: ${error.message}`));
  await page.goto(url);
  await waitForViews(page, 1);
  if (device !== 'desktop') {
    await page.getByRole('radio', { name: DEVICE_LABELS[device] }).click();
    await waitForViews(page, 2);
  }
  return page;
}

export function viewCount(page) {
  return page.evaluate(() => performance.getEntriesByName('studio:view-ready').length);
}

export async function waitForViews(page, count) {
  await page.waitForFunction(
    (expected) => performance.getEntriesByName('studio:view-ready').length >= expected,
    count,
    { timeout: 60_000 },
  );
}

/** Reloads the preview through Studio's own button and waits for the new View. */
export async function reloadPreview(page) {
  const before = await viewCount(page);
  await page.getByRole('button', { name: '重新载入预览' }).click();
  await waitForViews(page, before + 1);
}

/** The vendor page of the current View. */
export function vendorFrame(page) {
  return page.frameLocator('iframe[title="预览"]');
}

/** The vendor page's playwright Frame, for evaluate(). */
export async function vendorPage(page) {
  const handle = await page.locator('iframe[title="预览"]').elementHandle();
  return handle.contentFrame();
}

export async function diagnostics(page) {
  return page.evaluate(() => window.__TAVERN_STUDIO__.diagnostics);
}
