// Session writes and Replay through a vendor's own paths (docs/Vendors.md §2;
// TauriTavern's T4 W2 and W3 acceptance): write, reload through Studio, and
// check what the reloaded page shows. Then send a message, watch Replay
// stream the reply, and check that it is still there after another reload.
//
// Usage: node scripts/session-check.mjs [--url http://localhost:3000/]
//        [--vendor st|tt] [--browser chrome]

import { parseArgs } from 'node:util';
import { diagnostics, launch, openStudio, reloadPreview, vendorPage } from './lib/studio.mjs';

const { values: options } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:3000/' },
    browser: { type: 'string', default: 'chrome' },
    vendor: { type: 'string', default: 'st' },
  },
});

const MARK = `studio-check-${Date.now()}`;
/** The start of the fixture's first Replay reply. */
const FIRST_REPLY = '*Seraphina kneels beside you';
/** SillyTavern debounces character and chat saves; JS-Slash-Runner saves after them. */
const SAVE_DELAY_MS = 3000;

/** The vendor page once its extensions have loaded (TauriTavern defers them). */
async function readyPage(page) {
  const frame = await vendorPage(page);
  await frame.waitForFunction(() => window.TavernHelper !== undefined, undefined, {
    timeout: 30_000,
  });
  return frame;
}

async function write(frame) {
  return frame.evaluate(async (mark) => {
    const script = await import('/script.js');
    const { extension_settings } = await import('/scripts/extensions.js');
    // SillyTavern settings.
    extension_settings.studioSessionCheck = mark;
    await script.saveSettings();
    // The character edit form, as typing in the description does.
    const description = document.querySelector('#description_textarea');
    description.value = `${description.value}\n${mark}`;
    description.dispatchEvent(new Event('input', { bubbles: true }));
    // A theme, saved through the API the theme panel uses.
    const theme = await fetch('/api/themes/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: mark, main_text_color: 'rgba(220, 220, 210, 1)' }),
    });
    // JS-Slash-Runner: a character script, character variables, chat variables.
    const helper = window.TavernHelper;
    helper.replaceScriptTrees(
      [{ type: 'script', name: mark, enabled: false, content: '// Tavern Studio check' }],
      { type: 'character' },
    );
    helper.replaceVariables({ studio: mark }, { type: 'character' });
    helper.replaceVariables({ studio: mark }, { type: 'chat' });
    // TauriTavern's own settings, through its public host API.
    const host = window.__TAURITAVERN__;
    if (host) {
      await host.ready;
      await host.api.dev.frontendLogs.setConsoleCaptureEnabled(true);
    }
    return { themeStatus: theme.status };
  }, MARK);
}

async function read(frame) {
  return frame.evaluate(async (mark) => {
    const { extension_settings } = await import('/scripts/extensions.js');
    const context = window.SillyTavern.getContext();
    const character = context.characters[context.characterId];
    const helper = window.TavernHelper;
    const host = window.__TAURITAVERN__;
    return {
      sillyTavernSettings: extension_settings.studioSessionCheck === mark,
      characterEdit: String(character?.description).includes(mark),
      theme: [...document.querySelectorAll('#themes option')].some((o) => o.value === mark),
      characterScript: helper.getScriptTrees({ type: 'character' }).some((t) => t.name === mark),
      characterVariables: helper.getVariables({ type: 'character' }).studio === mark,
      chatVariables: helper.getVariables({ type: 'chat' }).studio === mark,
      ...(host
        ? { tauriTavernSettings: await host.api.dev.frontendLogs.getConsoleCaptureEnabled() }
        : {}),
    };
  }, MARK);
}

/**
 * Sends a message and samples the reply while it streams: a streamed reply
 * shows several lengths before it is complete.
 */
async function generate(frame) {
  return frame.evaluate(
    async ({ first }) => {
      const script = await import('/script.js');
      const started = performance.now();
      while (script.online_status === 'no_connection') {
        if (performance.now() - started > 15_000) throw new Error('The API never connected');
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const context = window.SillyTavern.getContext();
      const before = context.chat.length;
      const input = document.querySelector('#send_textarea');
      input.value = 'Thank you, Seraphina.';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#send_but').click();

      const lengths = new Set();
      const sent = performance.now();
      for (;;) {
        const last = context.chat.at(-1);
        if (context.chat.length === before + 2) lengths.add(last.mes.length);
        const done =
          context.chat.length === before + 2 && last.mes.startsWith(first) && !last.is_user;
        if (done && document.querySelector('#mes_stop')?.offsetParent === null) break;
        if (performance.now() - sent > 30_000) throw new Error('The reply did not finish');
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      return {
        connection: script.online_status,
        messages: context.chat.length - before,
        streamedLengths: lengths.size,
        ms: Math.round(performance.now() - sent),
      };
    },
    { first: FIRST_REPLY },
  );
}

const session = await launch(options);
const result = { vendor: options.vendor };
try {
  const page = await openStudio(session, options.url, { vendor: options.vendor });
  result.write = await write(await readyPage(page));
  await page.waitForTimeout(SAVE_DELAY_MS);
  await reloadPreview(page);
  result.afterReload = await read(await readyPage(page));

  result.generation = await generate(await readyPage(page));
  await page.waitForTimeout(SAVE_DELAY_MS);
  await reloadPreview(page);
  const frame = await readyPage(page);
  result.replyAfterReload = await frame.evaluate(
    (first) => window.SillyTavern.getContext().chat.at(-1)?.mes.startsWith(first) ?? false,
    FIRST_REPLY,
  );

  for (const entry of await diagnostics(page)) {
    session.problems.push(`${entry.level} (${entry.frame}, ${entry.kind}): ${entry.message}`);
  }
  result.passed =
    Object.values(result.afterReload).every(Boolean) &&
    result.generation.messages === 2 &&
    result.generation.streamedLengths > 2 &&
    result.replyAfterReload;
} catch (error) {
  session.problems.push(error.message);
}

console.log(JSON.stringify({ ...result, problems: session.problems }, null, 2));
await session.browser.close();
process.exitCode = session.problems.length || !result.passed ? 1 : 0;
