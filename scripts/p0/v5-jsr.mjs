// P0 V5: JS-Slash-Runner installed from upstream renders a frontend card in a
// srcdoc iframe, and the iframe's requests reach the Preview SW and the API layer.
//
// Usage: node scripts/p0/v5-jsr.mjs [--url http://localhost:3000/] [--browser chrome]

import { parseArgs } from 'node:util';
import { diagnostics, launch, openStudio, vendorPage } from '../lib/studio.mjs';

const { values: options } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:3000/' },
    browser: { type: 'string', default: 'chrome' },
  },
});

const TAILWIND = '/scripts/extensions/third-party/JS-Slash-Runner/lib/tailwindcss.min.js';

const session = await launch(options);
const result = { browser: options.browser };
try {
  const page = await openStudio(session, options.url);
  const vendor = await vendorPage(page);
  result.tavernHelper = await vendor.evaluate(() => typeof window.TavernHelper);

  const card = page.frameLocator('iframe[title="预览"]').frameLocator('iframe[id^="TH-message"]');
  await card.locator('.card h3').waitFor({ timeout: 30_000 });
  const frame = await (
    await page
      .frameLocator('iframe[title="预览"]')
      .locator('iframe[id^="TH-message"]')
      .first()
      .elementHandle()
  ).contentFrame();

  result.card = await frame.evaluate(async (tailwind) => {
    const entry = performance
      .getEntriesByType('resource')
      .find((resource) => resource.name.endsWith(tailwind));
    return {
      id: frameElement.id,
      title: document.querySelector('.card h3')?.textContent,
      location: location.href,
      controlled: navigator.serviceWorker.controller !== null,
      tailwind: entry && { status: entry.responseStatus, viaWorker: entry.workerStart > 0 },
      fetchPatched: !String(window.fetch).includes('[native code]'),
    };
  }, TAILWIND);

  // The card's own realm answers the API: asynchronous fetch and synchronous XHR.
  result.cardApi = await frame.evaluate(async () => {
    const ping = await fetch('/api/ping', { method: 'POST' });
    const xhr = new XMLHttpRequest();
    xhr.open('GET', '/version', false);
    xhr.send();
    return { ping: ping.status, versionSync: JSON.parse(xhr.responseText).pkgVersion };
  });

  for (const entry of await diagnostics(page)) {
    session.problems.push(`${entry.level} (${entry.frame}, ${entry.kind}): ${entry.message}`);
  }
} catch (error) {
  session.problems.push(error.message);
}

console.log(JSON.stringify({ ...result, problems: session.problems }, null, 2));
await session.browser.close();
process.exitCode = session.problems.length ? 1 : 0;
