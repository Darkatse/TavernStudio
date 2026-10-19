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
import { diagnostics, launch, openStudio, reloadPreview } from './lib/studio.mjs';

const { values: options } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:3000/' },
    browser: { type: 'string', default: 'chrome' },
    device: { type: 'string', default: 'desktop' },
    reloads: { type: 'string', default: '3' },
    screenshot: { type: 'string' },
  },
});

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

const session = await launch(options);
let report;
try {
  const page = await openStudio(session, options.url, options.device);
  const cold = await measure(page);

  const reloads = [];
  for (let i = 0; i < Number(options.reloads); i++) {
    await reloadPreview(page);
    reloads.push((await measure(page)).vendor);
  }

  const warm = await measure(await openStudio(session, options.url, options.device));

  if (options.screenshot) await page.screenshot({ path: options.screenshot });
  for (const entry of await diagnostics(page)) {
    session.problems.push(`${entry.level} (${entry.frame}, ${entry.kind}): ${entry.message}`);
  }
  report = { browser: options.browser, device: options.device, cold, warm, reloads };
} catch (error) {
  session.problems.push(`Preview did not become ready: ${error.message}`);
}

console.log(JSON.stringify({ ...report, problems: session.problems }, null, 2));
await session.browser.close();
process.exitCode = session.problems.length ? 1 : 0;
