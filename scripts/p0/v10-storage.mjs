import { parseArgs } from 'node:util';
import { launch, openStudio, reloadPreview, vendorPage } from '../lib/studio.mjs';

const { values: options } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:3000/' },
    browser: { type: 'string', default: 'chrome' },
  },
});

const BACKGROUND = '/backgrounds/tavern%20day.jpg';

const inventory = (frame) =>
  frame.evaluate(async () => ({
    localStorage: Object.keys(localStorage).toSorted(),
    sessionStorage: Object.keys(sessionStorage).toSorted(),
    databases: (await indexedDB.databases()).map((database) => String(database.name)).toSorted(),
    caches: (await caches.keys()).toSorted(),
  }));

const head = (frame, url) =>
  frame.evaluate(async (target) => {
    const response = await fetch(target, { method: 'HEAD' });
    return {
      status: response.status,
      etag: response.headers.get('etag'),
      length: response.headers.get('content-length'),
    };
  }, url);

const plantMarkers = (frame) =>
  frame.evaluate(async () => {
    localStorage.setItem('v10-marker', '1');
    sessionStorage.setItem('v10-marker', '1');
    localStorage.setItem('tauritavern:in_app_agent_snapshot_sequence', '42');
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('v10-marker');
      request.addEventListener('success', () => {
        request.result.close();
        resolve();
      });
      request.addEventListener('error', () => reject(request.error));
    });
    await caches.open('v10-marker');
  });

const session = await launch(options);
const result = {};
try {
  let page = await openStudio(session, options.url);
  let frame = await vendorPage(page);
  result.inventory = await inventory(frame);

  result.etag = await head(frame, BACKGROUND);
  const startedReplace = Date.now();
  await page.evaluate(async (path) => {
    const replacement = await fetch(
      '/_studio/fixtures/showcase/default-user/backgrounds/landscape%20mountain%20lake.jpg',
    );
    await window.__TAVERN_STUDIO__.updateData(
      path,
      new Uint8Array(await replacement.arrayBuffer()),
    );
  }, 'default-user/backgrounds/tavern day.jpg');
  result.replaceMs = Date.now() - startedReplace;
  result.etagAfterReplace = await head(frame, BACKGROUND);
  await reloadPreview(page);
  frame = await vendorPage(page);
  result.servedAfterReload = await head(frame, BACKGROUND);

  await plantMarkers(frame);
  await page.close();
  page = await openStudio(session, options.url);
  result.sameVendor = await inventory(await vendorPage(page));

  // Another vendor image ran last: browser-side state is cleared before boot.
  await page.evaluate(async () => {
    const cache = await caches.open('studio-session');
    await cache.put('/_studio/session-state', Response.json({ vendor: 'st@0.0.0' }));
  });
  await page.close();
  page = await openStudio(session, options.url);
  result.otherVendor = await inventory(await vendorPage(page));
  result.agentCounter = await (
    await vendorPage(page)
  ).evaluate(() => localStorage.getItem('tauritavern:in_app_agent_snapshot_sequence'));
} catch (error) {
  session.problems.push(error.message);
}

console.log(JSON.stringify({ ...result, problems: session.problems }, null, 2));
await session.browser.close();
process.exitCode = session.problems.length ? 1 : 0;
