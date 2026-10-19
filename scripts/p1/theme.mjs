// P1a scenario (docs/plan/P1.md, P1a 主题): a theme project from the template;
// the Agent changes colours and CSS, which the preview hot-applies, and takes
// a screenshot; the author adjusts a colour in the frontend's own settings and
// adopts it; the theme is exported, imported through the frontend's own theme
// import in a fresh Studio, selected, and must look the same.
//
// The Agent runs on a scripted model, so no key is needed.
//
// Usage: node scripts/p1/theme.mjs [--url http://localhost:3000/] [--vendor st|tt]

import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { startScriptedModel } from '../lib/scripted-model.mjs';
import {
  askAgent,
  createThemeProject,
  launch,
  openStudio,
  useModel,
  vendorPage,
} from '../lib/studio.mjs';

const { values: options } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:3000/' },
    browser: { type: 'string', default: 'chrome' },
    vendor: { type: 'string', default: 'st' },
    port: { type: 'string', default: '3411' },
  },
});

const template = JSON.parse(
  await readFile(new URL('../../templates/theme/theme.json', import.meta.url), 'utf8'),
);
const COLORS = {
  main_text_color: 'rgba(245, 236, 220, 1)',
  quote_text_color: 'rgba(110, 200, 210, 1)',
};
const ITALICS = 'rgba(200, 170, 120, 1)';
const RADIUS = '14px';

/** A key and its string value as theme.json writes them. */
const json = (key, value) => `"${key}": "${value}"`;

/** What the Agent does, reply by reply. */
function script(round) {
  switch (round) {
    case 0:
      return {
        text: '先读主题文件。',
        calls: [
          { name: 'workspace_read_file', args: { path: 'project/theme.json' } },
          { name: 'workspace_read_file', args: { path: 'project/theme.css' } },
        ],
      };
    case 1:
      return {
        calls: [
          ...Object.entries(COLORS).map(([key, value]) => ({
            name: 'workspace_edit_file',
            args: {
              path: 'project/theme.json',
              old_string: json(key, template[key]),
              new_string: json(key, value),
            },
          })),
          {
            name: 'workspace_write_file',
            args: {
              path: 'project/theme.css',
              content: `\n#chat .mes {\n  border-radius: ${RADIUS};\n}\n`,
              mode: 'append',
            },
          },
        ],
      };
    case 2:
      return { calls: [{ name: 'preview_capture', args: {} }] };
    default:
      return { text: '改好了：正文暖白，引号青色，消息圆角。' };
  }
}

/** The look a theme gives, read from the vendor page: its variables and one rule of the CSS. */
const look = (frame) =>
  frame.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const variable = (name) => root.getPropertyValue(name).trim();
    return {
      body: variable('--SmartThemeBodyColor'),
      quote: variable('--SmartThemeQuoteColor'),
      italics: variable('--SmartThemeEmColor'),
      radius: getComputedStyle(document.querySelector('#chat .mes')).borderTopLeftRadius,
    };
  });

/** The look once the preview shows what `done` waits for, across the reloads a change may cause. */
async function settled(page, done, timeout = 30_000) {
  const started = Date.now();
  for (;;) {
    let seen;
    try {
      seen = await look(await vendorPage(page));
    } catch {
      // The View reloaded while it was read; read the new one.
    }
    if (seen && done(seen)) return seen;
    if (Date.now() - started > timeout)
      throw new Error(`The preview did not settle: ${JSON.stringify(seen)}`);
    await page.waitForTimeout(250);
  }
}

const model = await startScriptedModel(Number(options.port), script);
const session = await launch(options);
const result = { vendor: options.vendor };
try {
  // 1. A project from the theme template.
  const page = await openStudio(session, options.url, { vendor: options.vendor });
  page.on('pageerror', (error) => session.problems.push(`Page error: ${error.message}`));
  await createThemeProject(page);
  await useModel(page, `http://localhost:${options.port}/v1`);

  // 2–4. The Agent edits; the preview hot-applies; the Agent looks.
  result.run = await askAgent(page, '正文改成暖白，引号改成青色，消息加圆角');
  // On TauriTavern each change reloads the View, so wait for the last one.
  result.afterAgent = await settled(page, (seen) => seen.radius === RADIUS);
  const screenshot = model.requests
    .at(-1)
    .messages.some(
      (message) =>
        Array.isArray(message.content) && message.content.some((part) => part.type === 'image_url'),
    );
  result.agentSawScreenshot = screenshot;

  // 5. The author changes a colour in the frontend's own settings and adopts it.
  await (
    await vendorPage(page)
  ).evaluate(
    (color) => document.querySelector('#italics-color-picker').setAttribute('color', color),
    ITALICS,
  );
  await page.getByRole('button', { name: '待采纳 1' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '采纳' }).click();
  // The badge stays while its panel is open.
  await page.getByRole('button', { name: '待采纳 0' }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^待采纳/ }).waitFor({ state: 'detached' });
  result.projectLook = await settled(page, (seen) => seen.italics === ITALICS);

  // 6. Export: the browser's download, since a save dialog cannot be answered here.
  await page.evaluate(() => {
    window.showSaveFilePicker = undefined;
  });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '导出主题' }).click(),
  ]);
  const file = await download.path();
  const theme = JSON.parse(await readFile(file, 'utf8'));
  result.exported = {
    name: theme.name,
    fields: Object.keys(theme).length - 1,
    colors: {
      ...Object.fromEntries(Object.keys(COLORS).map((key) => [key, theme[key]])),
      italics_text_color: theme.italics_text_color,
    },
    css: theme.custom_css.includes(`border-radius: ${RADIUS}`),
  };

  // A fresh Studio, with no project: the frontend imports the file and selects the theme.
  const fresh = await session.browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const other = await openStudio({ context: fresh, problems: session.problems }, options.url, {
    vendor: options.vendor,
  });
  const vendor = await vendorPage(other);
  result.fixtureLook = await look(vendor);
  await vendor.setInputFiles('#ui_preset_import_file', file);
  await vendor.locator(`#themes option[value="${theme.name}"]`).waitFor({ state: 'attached' });
  await vendor.evaluate((name) => window.$('#themes').val(name).trigger('change'), theme.name);
  await other.waitForTimeout(1000);
  result.importedLook = await look(vendor);
  await fresh.close();

  result.passed =
    result.run === 'Agent 已完成' &&
    result.agentSawScreenshot &&
    result.afterAgent.body === COLORS.main_text_color &&
    result.afterAgent.quote === COLORS.quote_text_color &&
    result.afterAgent.radius === RADIUS &&
    result.projectLook.italics === ITALICS &&
    result.exported.colors.italics_text_color === ITALICS &&
    result.exported.css &&
    JSON.stringify(result.importedLook) === JSON.stringify(result.projectLook) &&
    JSON.stringify(result.fixtureLook) !== JSON.stringify(result.projectLook);
} catch (error) {
  session.problems.push(error.message);
}

console.log(JSON.stringify({ ...result, problems: session.problems }, null, 2));
await session.browser.close();
model.close();
process.exitCode = session.problems.length || !result.passed ? 1 : 0;
