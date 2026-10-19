import { parseArgs } from 'node:util';
import { diagnostics, launch, openStudio, reloadPreview } from './lib/studio.mjs';

const { values: options } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:3000/' },
    browser: { type: 'string', default: 'chrome' },
    vendor: { type: 'string', default: 'st' },
    device: { type: 'string', default: 'desktop' },
    reloads: { type: 'string', default: '3' },
    screenshot: { type: 'string' },
  },
});

async function measure(page) {
  return page.evaluate(() => {
    // The latest of each: a vendor switch opens a second Session.
    const [view, worker, data] = [
      'studio:view-ready',
      'studio:session-worker',
      'studio:session-data',
    ].map((name) => performance.getEntriesByName(name).at(-1));
    const frame = document.querySelector('iframe[title="预览"]');
    const resources = frame.contentWindow.performance.getEntriesByType('resource');
    return {
      // Studio starts on SillyTavern, so for TauriTavern `ready` includes the
      // SillyTavern View it switches from.
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
const target = { device: options.device, vendor: options.vendor };
let report;
try {
  const page = await openStudio(session, options.url, target);
  const cold = await measure(page);

  const reloads = [];
  for (let i = 0; i < Number(options.reloads); i++) {
    await reloadPreview(page);
    reloads.push((await measure(page)).vendor);
  }

  if (options.screenshot) await page.screenshot({ path: options.screenshot });
  for (const entry of await diagnostics(page)) {
    session.problems.push(`${entry.level} (${entry.frame}, ${entry.kind}): ${entry.message}`);
  }

  // One Studio tab at a time: tabs share the Preview SW and the published
  // Session, and a second tab does not take over the first.
  await page.close();
  const warmPage = await openStudio(session, options.url, target);
  const warm = await measure(warmPage);
  for (const entry of await diagnostics(warmPage)) {
    session.problems.push(`${entry.level} (${entry.frame}, ${entry.kind}): ${entry.message}`);
  }
  report = { browser: options.browser, ...target, cold, warm, reloads };
} catch (error) {
  session.problems.push(`Preview did not become ready: ${error.message}`);
}

console.log(JSON.stringify({ ...report, problems: session.problems }, null, 2));
await session.browser.close();
process.exitCode = session.problems.length ? 1 : 0;
