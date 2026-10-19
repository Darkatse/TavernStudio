// P0 V6: the app-use engine from npm runs in the vendor page. `app.snapshot`
// enters the JS-Slash-Runner card iframe, and `app.interact` clicks the card's
// button, which the card then reports in its own DOM (docs/Agent.md §4).
//
// Usage: node scripts/p0/v6-app-use.mjs [--url http://localhost:3000/] [--vendor st|tt]

import { parseArgs } from 'node:util';
import { launch, openStudio, vendorFrame } from '../lib/studio.mjs';

const { values: options } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:3000/' },
    browser: { type: 'string', default: 'chrome' },
    vendor: { type: 'string', default: 'st' },
  },
});

const CARD = 'iframe[id^="TH-message"]';
const BUTTON = 'Rest by the spring';

/** Calls the page's engine the way the Agent's tools will, from Studio's realm. */
const call = (page, tool, args) =>
  page.evaluate(
    (request) => {
      const { agent } = window.__TAVERN_STUDIO__.page();
      const started = performance.now();
      const output = agent[request.tool]('v6', request.args);
      return { output, ms: Math.round((performance.now() - started) * 10) / 10 };
    },
    { tool, args },
  );

const refOf = (tree, text) =>
  tree
    .split('\n')
    .find((line) => line.includes(text))
    ?.match(/s\d+:e\d+/)?.[0];

const session = await launch(options);
const result = {};
try {
  const page = await openStudio(session, options.url, { vendor: options.vendor });
  const card = vendorFrame(page).frameLocator(CARD);
  await card.getByRole('button', { name: BUTTON }).waitFor({ timeout: 30_000 });

  const overview = await call(page, 'snapshot', {});
  const again = await call(page, 'snapshot', {});
  result.overview = {
    firstMs: overview.ms,
    againMs: again.ms,
    lines: overview.output.tree.split('\n').length,
  };

  // Into the card: by the iframe's ref from a snapshot of its message, as the Agent would.
  const message = await call(page, 'snapshot', { selector: '#chat .last_mes .mes_text', depth: 6 });
  const frameRef = refOf(message.output.tree, 'iframe');
  if (!frameRef) throw new Error(`No iframe ref in the message snapshot:\n${message.output.tree}`);
  const inside = await call(page, 'snapshot', { root: frameRef, depth: 6 });
  result.enter = { ms: inside.ms, tree: inside.output.tree };

  // As an Agent would: a button below the visible part of the chat needs the
  // chat scrolled first, then a fresh look into the card.
  result.scrolls = 0;
  let buttonRef = refOf(inside.output.tree, BUTTON);
  let click;
  for (;;) {
    if (!buttonRef) throw new Error('The card button is not in the iframe snapshot');
    try {
      click = await call(page, 'interact', { action: 'click', ref: buttonRef });
      break;
    } catch (error) {
      if (!error.message.includes('outside the visible area') || result.scrolls === 5) throw error;
      await call(page, 'interact', { action: 'scroll', selector: '#chat', direction: 'down' });
      result.scrolls++;
      const fresh = await call(page, 'snapshot', { selector: CARD, depth: 6 });
      buttonRef = refOf(fresh.output.tree, BUTTON);
    }
  }
  result.click = { ms: click.ms, output: click.output };

  result.card = {
    health: await card.locator('#health .num').textContent(),
    button: await card.getByRole('button').textContent(),
    disabled: await card.getByRole('button').isDisabled(),
  };
  result.passed = result.card.health === '58' && result.card.disabled;
} catch (error) {
  session.problems.push(error.message);
}

console.log(JSON.stringify({ ...result, problems: session.problems }, null, 2));
await session.browser.close();
process.exitCode = session.problems.length || !result.passed ? 1 : 0;
