import { parseArgs } from 'node:util';
import { launch, openStudio, reloadPreview, vendorPage } from '../lib/studio.mjs';

const { values: options } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:3000/' },
    browser: { type: 'string', default: 'chrome' },
  },
});

const OUTLINE = 'rgb(255, 0, 128)';
const TEXT = 'rgba(255, 200, 0, 1)';
const CSS = `#chat .mes { outline: 3px solid ${OUTLINE}; }`;

const probe = (frame) =>
  frame.evaluate(() => ({
    outline: getComputedStyle(document.querySelector('#chat .mes')).outlineColor,
    bodyColor: getComputedStyle(document.documentElement)
      .getPropertyValue('--SmartThemeBodyColor')
      .trim(),
    textColor: getComputedStyle(document.querySelector('#chat .mes_text')).color,
  }));

const session = await launch(options);
const result = {};
try {
  const page = await openStudio(session, options.url);
  let frame = await vendorPage(page);
  result.before = await probe(frame);

  result.customCssMs = await frame.evaluate(
    async ({ css, outline }) => {
      const area = document.querySelector('#customCSS');
      const mes = document.querySelector('#chat .mes');
      const started = performance.now();
      area.value = css;
      area.dispatchEvent(new Event('input', { bubbles: true }));
      while (getComputedStyle(mes).outlineColor !== outline) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      return Math.round(performance.now() - started);
    },
    { css: CSS, outline: OUTLINE },
  );

  // The picker component reports a change of its own `color` attribute.
  result.colorPicker = await frame.evaluate(async (color) => {
    const picker = document.querySelector('#main-text-color-picker');
    const root = getComputedStyle(document.documentElement);
    const started = performance.now();
    picker.setAttribute('color', color);
    while (
      root.getPropertyValue('--SmartThemeBodyColor').trim() !== color &&
      performance.now() - started < 3000
    ) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    const applied = root.getPropertyValue('--SmartThemeBodyColor').trim() === color;
    return { applied, ms: Math.round(performance.now() - started) };
  }, TEXT);

  result.hot = await probe(frame);
  // SillyTavern saves settings on a debounce; give it time before reloading.
  await page.waitForTimeout(2500);
  await reloadPreview(page);
  frame = await vendorPage(page);
  result.reloaded = await probe(frame);
  result.identical = JSON.stringify(result.hot) === JSON.stringify(result.reloaded);
} catch (error) {
  session.problems.push(error.message);
}

console.log(JSON.stringify({ ...result, problems: session.problems }, null, 2));
await session.browser.close();
process.exitCode = session.problems.length || !result.identical ? 1 : 0;
