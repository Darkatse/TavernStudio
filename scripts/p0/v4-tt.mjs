import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { diagnostics, launch, openStudio, vendorFrame, vendorPage } from '../lib/studio.mjs';

const { values: options } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:3000/' },
    browser: { type: 'string', default: 'chrome' },
    out: { type: 'string', default: path.join(tmpdir(), 'tavern-studio-v4') },
  },
});

/** TauriTavern loads third-party extensions after APP_READY, so the card comes later. */
async function inspect(page, device) {
  const vendor = await vendorPage(page);
  const shown = await vendor.evaluate(() => ({
    host: window.__TAURITAVERN_HOST__,
    messages: document.querySelectorAll('#chat .mes').length,
    lastMessage: document.querySelector('#chat .last_mes .ch_name')?.textContent.trim(),
    background: getComputedStyle(document.querySelector('#bg1')).backgroundImage.slice(-40),
  }));
  const started = Date.now();
  await vendorFrame(page)
    .frameLocator('iframe[id^="TH-message"]')
    .locator('.card h3')
    .waitFor({ timeout: 30_000 });
  shown.cardAfterReadyMs = Date.now() - started;
  await page.screenshot({ path: path.join(options.out, `tt-${device}.png`) });
  return shown;
}

const session = await launch(options);
const result = {};
let seen = 0;
const newDiagnostics = async (page) => {
  const entries = await diagnostics(page);
  const fresh = entries
    .slice(seen)
    .map((entry) => `${entry.level} (${entry.frame}, ${entry.kind}): ${entry.message}`);
  seen = entries.length;
  return fresh;
};
try {
  const page = await openStudio(session, options.url, { vendor: 'tt' });
  result.desktop = await inspect(page, 'desktop');
  result.desktopDiagnostics = await newDiagnostics(page);

  // Switching the device unmounts the desktop View: its teardown is reported apart.
  await page.getByRole('radio', { name: '移动' }).click();
  await page.waitForFunction(
    () => performance.getEntriesByName('studio:view-ready').length >= 3,
    undefined,
    { timeout: 60_000 },
  );
  result.teardownDiagnostics = await newDiagnostics(page);
  result.mobile = await inspect(page, 'mobile');
  result.mobileDiagnostics = await newDiagnostics(page);
  result.passed = [result.desktop, result.mobile].every((shown) => shown.messages === 5);
} catch (error) {
  session.problems.push(error.message);
}

console.log(JSON.stringify({ ...result, problems: session.problems }, null, 2));
await session.browser.close();
process.exitCode = session.problems.length || !result.passed ? 1 : 0;
