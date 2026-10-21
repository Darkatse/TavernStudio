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
const FIRST_REPLY = '*Seraphina kneels beside you';
/** SillyTavern debounces character and chat saves; JS-Slash-Runner saves after them. */
const SAVE_DELAY_MS = 3000;

/** TauriTavern defers extensions, so the vendor page can be ready before TavernHelper is. */
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
    extension_settings.studioSessionCheck = mark;
    await script.saveSettings();
    const description = document.querySelector('#description_textarea');
    description.value = `${description.value}\n${mark}`;
    description.dispatchEvent(new Event('input', { bubbles: true }));
    const theme = await fetch('/api/themes/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: mark, main_text_color: 'rgba(220, 220, 210, 1)' }),
    });
    const helper = window.TavernHelper;
    helper.replaceScriptTrees(
      [{ type: 'script', name: mark, enabled: false, content: '// Tavern Studio check' }],
      { type: 'character' },
    );
    helper.replaceVariables({ studio: mark }, { type: 'character' });
    helper.replaceVariables({ studio: mark }, { type: 'chat' });
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

/** A streamed reply shows several lengths before it is complete. */
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

/**
 * The browser closes Studio's database connection while the page lives on,
 * as Safari does when its network process ends. Clearing the origin's
 * IndexedDB closes it the same way in Chromium; a Session write afterwards
 * must still reach storage.
 */
async function persistsAfterClose(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Storage.clearDataForOrigin', {
    origin: new URL(options.url).origin,
    storageTypes: 'indexeddb',
  });
  await write(await readyPage(page));
  await page.waitForTimeout(SAVE_DELAY_MS);
  return page.evaluate(
    (mark) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('tavern-studio');
        request.addEventListener('error', () => reject(request.error));
        request.addEventListener('success', () => {
          const database = request.result;
          const get = database
            .transaction('sessionFiles')
            .objectStore('sessionFiles')
            .get('default-user/settings.json');
          get.addEventListener('error', () => reject(get.error));
          get.addEventListener('success', () => {
            database.close();
            const content = get.result?.content ?? new Uint8Array();
            resolve(new TextDecoder().decode(content).includes(mark));
          });
        });
      }),
    MARK,
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
  // Last, as it clears Studio's database. The browser protocol it needs is Chromium's.
  if (session.browser.browserType().name() === 'chromium') {
    result.persistsAfterClose = await persistsAfterClose(page);
  }

  for (const entry of await diagnostics(page)) {
    session.problems.push(`${entry.level} (${entry.frame}, ${entry.kind}): ${entry.message}`);
  }
  result.passed =
    Object.values(result.afterReload).every(Boolean) &&
    result.generation.messages === 2 &&
    result.generation.streamedLengths > 2 &&
    result.replyAfterReload &&
    result.persistsAfterClose !== false;
} catch (error) {
  session.problems.push(error.message);
}

console.log(JSON.stringify({ ...result, problems: session.problems }, null, 2));
await session.browser.close();
process.exitCode = session.problems.length || !result.passed ? 1 : 0;
