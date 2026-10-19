import { chromium, firefox, webkit } from 'playwright-core';

const API = /^\/(api\/|csrf-token$|version$)/;
const DEVICE_LABELS = { desktop: '桌面', mobile: '移动' };
/** Firefox and WebKit are Playwright's own builds; Chrome and Edge are the installed browsers. */
const ENGINES = { firefox, webkit };

/**
 * The scripts find controls by their Chinese names, so Studio's locale cookie
 * defaults to Chinese. The browser's language, which the preview's frontend
 * follows, stays as it is.
 */
export async function launch({
  url,
  browser: name = 'chrome',
  args = [],
  headless = true,
  locale = 'zh',
}) {
  const engine = ENGINES[name];
  const browser = engine
    ? await engine.launch({ headless, args })
    : await chromium.launch({ channel: name, headless, args });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await context.addCookies([{ name: 'studio-locale', value: locale, url }]);
  // A vendor page loads several hundred resources; the default buffer keeps 250.
  await context.addInitScript(() => performance.setResourceTimingBufferSize(10_000));
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

/** Studio starts on the first built image, SillyTavern. */
export async function openStudio(
  { context, problems },
  url,
  { device = 'desktop', vendor = 'st' } = {},
) {
  const page = await context.newPage();
  page.on('pageerror', (error) => problems.push(`Page error: ${error.message}`));
  await page.goto(url);
  await waitForViews(page, 1);
  if (vendor !== 'st') await selectVendor(page, vendor);
  if (device !== 'desktop') {
    const before = await viewCount(page);
    await page.getByRole('radio', { name: DEVICE_LABELS[device] }).click();
    await waitForViews(page, before + 1);
  }
  return page;
}

export async function selectVendor(page, kind) {
  const before = await viewCount(page);
  await page.getByRole('radio', { name: kind.toUpperCase() }).click();
  await waitForViews(page, before + 1);
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

export async function reloadPreview(page) {
  const before = await viewCount(page);
  await page.getByRole('button', { name: '重新载入预览' }).click();
  await waitForViews(page, before + 1);
}

export function vendorFrame(page) {
  return page.frameLocator('iframe[title="预览"]');
}

/** A change can reload the vendor page, and its frame is then a new one. */
export async function vendorPage(page) {
  await page.waitForFunction(() => window.__TAVERN_STUDIO__?.page() !== undefined, undefined, {
    timeout: 60_000,
  });
  const frame = await page.evaluateHandle(() => window.__TAVERN_STUDIO__.page().frame);
  return frame.asElement().contentFrame();
}

export async function diagnostics(page) {
  return page.evaluate(() => window.__TAVERN_STUDIO__.diagnostics);
}

export async function createThemeProject(page) {
  await page.getByRole('tab', { name: '代码' }).click();
  await page.getByRole('button', { name: '新建主题项目' }).click();
  await page.getByRole('treeitem', { name: /theme\.css/ }).waitFor();
  await page.getByRole('tab', { name: '预览' }).click();
}

export async function useModel(page, baseUrl, model = 'scripted') {
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: '模型' }).click();
  await dialog.getByLabel('服务', { exact: true }).selectOption('custom');
  await dialog.getByLabel('地址', { exact: true }).fill(baseUrl);
  // The field, not the "模型" tab's panel, which bears the same name.
  await dialog.getByRole('combobox', { name: '模型' }).fill(model);
  await dialog.getByLabel('API Key', { exact: true }).fill('scripted');
  await dialog.getByRole('button', { name: '保存' }).click();
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
}

const runCount = () => document.querySelectorAll('[role=log] section').length;

export async function askAgent(page, message, timeout = 60_000) {
  const before = await page.evaluate(runCount);
  const composer = page.getByLabel('给 Agent 的消息');
  await composer.fill(message);
  await composer.press('Enter');
  await page.waitForFunction(
    (count) => {
      const log = document.querySelector('[role=log]');
      return (
        log?.getAttribute('aria-busy') === 'false' && log.querySelectorAll('section').length > count
      );
    },
    before,
    { timeout },
  );
  return page.locator('[role=log] ~ [aria-live=polite]').textContent();
}
