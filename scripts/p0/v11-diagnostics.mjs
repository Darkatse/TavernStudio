import { parseArgs } from 'node:util';
import { dataPathForUrl } from '../../packages/preview/src/routes.ts';
import { launch, openStudio, reloadPreview, vendorPage } from '../lib/studio.mjs';

const { values: options } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:3000/' },
    browser: { type: 'string', default: 'chrome' },
  },
});

const CHAT = 'default-user/chats/default_Seraphina/Seraphina - 2023-5-12 @21h 32m 29s 224ms.jsonl';

/** Each source holds its error on a known line; `marker` finds the entry. */
const EXTENSIONS = {
  'V11-Runtime': [
    '// P0 V11: a runtime error in a third-party extension.',
    'const delay = 0;',
    'setTimeout(() => {',
    '  v11ExtensionMissing();',
    '}, delay);',
  ],
  'V11-Syntax': [
    '// P0 V11: a syntax error in a third-party extension.',
    'const ready = true;',
    'const = 1;',
  ],
};
const SCRIPTS = {
  'v11-runtime': ['const delay = 0;', 'setTimeout(() => {', '  v11ScriptMissing();', '}, delay);'],
  'v11-syntax': ['const ready = true;', 'const = 1;'],
};
const CARD = [
  '<!DOCTYPE html>',
  '<html>',
  '<body>',
  '<p>V11 probe</p>',
  '<script>',
  '  setTimeout(() => { v11CardMissing(); }, 0);',
  '</script>',
  '<script>',
  '  const = 1;',
  '</script>',
  '</body>',
  '</html>',
];

const EXPECTED = [
  { source: 'extension', error: 'runtime', marker: 'v11ExtensionMissing', line: 4 },
  { source: 'extension', error: 'syntax', marker: 'V11-Syntax/', line: 3 },
  { source: 'jsr-script', error: 'runtime', marker: 'v11ScriptMissing', line: 3 },
  { source: 'jsr-script', error: 'syntax', marker: 'TH-script--v11-syntax', line: 2 },
  { source: 'card', error: 'runtime', marker: 'v11CardMissing', line: 6 },
  { source: 'card', error: 'syntax', marker: 'TH-message', line: 9 },
];

const session = await launch(options);
const result = {};
try {
  const page = await openStudio(session, options.url);

  await page.evaluate(
    async ({ extensions, card, chat }) => {
      const studio = window.__TAVERN_STUDIO__;
      for (const [name, lines] of Object.entries(extensions)) {
        const manifest = { display_name: name, loading_order: 1, js: 'index.js', version: '1.0.0' };
        await studio.updateData(
          `default-user/extensions/${name}/manifest.json`,
          JSON.stringify(manifest),
        );
        await studio.updateData(`default-user/extensions/${name}/index.js`, lines.join('\n'));
      }
      const original = await (await fetch(`/_studio/fixtures/showcase/${encodeURI(chat)}`)).text();
      const message = {
        name: 'Seraphina',
        is_user: false,
        is_system: false,
        send_date: 'October 18, 2026 at 12:15 PM',
        mes: `\`\`\`html\n${card.join('\n')}\n\`\`\``,
        extra: {},
      };
      await studio.updateData(chat, `${original.trimEnd()}\n${JSON.stringify(message)}`);
    },
    { extensions: EXTENSIONS, card: CARD, chat: CHAT },
  );
  await reloadPreview(page);
  const vendor = await vendorPage(page);

  // JSR scripts are created through JSR's own API, which runs them at once.
  await vendor.waitForFunction(() => window.TavernHelper !== undefined);
  await vendor.evaluate((scripts) => {
    window.TavernHelper.replaceScriptTrees(
      Object.entries(scripts).map(([name, lines]) => ({
        type: 'script',
        name,
        enabled: true,
        content: lines.join('\n'),
      })),
      { type: 'global' },
    );
  }, SCRIPTS);
  await page.waitForTimeout(2000);

  const srcdocLines = await vendor.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('iframe[id^="TH-"]')].map((frame) => [
        frame.id,
        frame.getAttribute('srcdoc')?.split('\n') ?? [],
      ]),
    ),
  );

  const entries = await page.evaluate(() =>
    window.__TAVERN_STUDIO__.diagnostics.filter((entry) => entry.kind === 'error'),
  );
  result.checks = EXPECTED.map((expected) => {
    const entry = entries.find((candidate) =>
      [candidate.message, candidate.url, candidate.frame, candidate.stack].some((field) =>
        field?.includes(expected.marker),
      ),
    );
    if (!entry) return { ...expected, captured: false };
    const check = {
      source: expected.source,
      error: expected.error,
      captured: true,
      message: entry.message,
      frame: entry.frame,
      url: entry.url,
      line: entry.line,
      column: entry.column,
      sourceLine: expected.line,
    };
    // Extensions are files, so their line must be exact. JSR scripts and cards
    // are inline scripts in srcdoc documents that JSR assembles, so their line
    // counts from the start of the srcdoc.
    if (expected.source === 'extension') {
      check.dataPath = dataPathForUrl(new URL(entry.url));
      check.exact = entry.line === expected.line;
    } else {
      const lines = srcdocLines[entry.frame] ?? [];
      const sourceText = (expected.source === 'card' ? CARD : SCRIPTS[`v11-${expected.error}`])[
        expected.line - 1
      ];
      check.srcdocLine = lines.indexOf(sourceText) + 1;
      check.srcdocExact = entry.line === check.srcdocLine;
      check.offsetFromSource = entry.line - expected.line;
    }
    return check;
  });
  result.passed = result.checks.every(
    (check) => check.captured && (check.source !== 'extension' || (check.exact && check.dataPath)),
  );
} catch (error) {
  session.problems.push(error.message);
}

// The planted errors also surface as page errors; anything else is a problem.
const PLANTED = /^Page error: (v11\w+Missing is not defined|Unexpected token '=')$/;
const problems = session.problems.filter((problem) => !PLANTED.test(problem));
console.log(JSON.stringify({ ...result, problems }, null, 2));
await session.browser.close();
process.exitCode = problems.length || !result.passed ? 1 : 0;
