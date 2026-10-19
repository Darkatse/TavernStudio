// P0 V7: screenshot methods. Captures the showcase View, with the
// JS-Slash-Runner card, in SillyTavern's default theme and in a blurred one,
// through snapdom inside the vendor page and through Element Capture in
// Studio's page. Each result is compared with the browser's own screenshot
// of the View (docs/Agent.md §5).
//
// Element Capture needs a rendered tab, so the browser runs headed, with its
// window placed off-screen.
//
// Usage: node scripts/p0/v7-capture.mjs [--url http://localhost:3000/] [--out <dir>]

import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { launch, openStudio, vendorFrame, vendorPage } from '../lib/studio.mjs';

const { values: options } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:3000/' },
    browser: { type: 'string', default: 'chrome' },
    out: { type: 'string', default: path.join(tmpdir(), 'tavern-studio-v7') },
  },
});

// The classic build, which sets window.snapdom; the package only exports its ES module.
const SNAPDOM = path.join(
  path.dirname(createRequire(import.meta.url).resolve('@zumer/snapdom/package.json')),
  'dist/snapdom.js',
);
const PREVIEW = 'iframe[title="预览"]';
/** SillyTavern's default theme turns blur off; Azure blurs its panels over the background. */
const SCENES = [{ name: 'dark-lite' }, { name: 'azure', theme: 'Azure' }];
/**
 * What to capture and how. The page background is painted through the root
 * element, so capturing body alone can drop it. Caching is off so that each
 * variant renders afresh.
 */
const SNAPDOM_VARIANTS = {
  'snapdom-body': { root: 'body', settings: { cache: 'disabled' } },
  'snapdom-root': { root: 'html', settings: { cache: 'disabled' } },
  'snapdom-root-fonts': { root: 'html', settings: { cache: 'disabled', embedFonts: true } },
};

const session = await launch({
  ...options,
  headless: false,
  args: [
    // Element Capture asks the user to share the tab; this answers yes.
    '--auto-accept-this-tab-capture',
    '--window-position=-2400,0',
    // An off-screen window must keep painting.
    '--disable-features=CalculateNativeWinOcclusion',
    '--disable-backgrounding-occluded-windows',
  ],
});
const result = { scenes: {} };
const files = {};
try {
  const page = await openStudio(session, options.url);
  await vendorFrame(page).frameLocator('iframe[id^="TH-message"]').locator('.card h3').waitFor();
  const vendor = await vendorPage(page);
  await vendor.addScriptTag({ path: SNAPDOM });

  // Element Capture: share this tab once, restricted to the preview frame.
  await page.mouse.click(5, 5); // getDisplayMedia needs a user gesture
  result.elementCaptureSetup = await page.evaluate(startElementCapture, PREVIEW);

  for (const scene of SCENES) {
    console.error(`${scene.name}…`);
    if (scene.theme) {
      await vendor.evaluate((theme) => {
        window.$('#themes').val(theme).trigger('change');
      }, scene.theme);
    }
    await page.waitForTimeout(1500);

    const images = {
      reference: `data:image/png;base64,${(await page.locator(PREVIEW).screenshot()).toString('base64')}`,
    };
    const outcome = {
      blurredPanels: await vendor.evaluate(
        () =>
          [...document.querySelectorAll('*')].filter(
            (element) => getComputedStyle(element).backdropFilter !== 'none',
          ).length,
      ),
      snapdomMs: {},
      snapdomWarnings: {},
    };

    // snapdom runs in the page it captures, like the app-use engine.
    for (const [name, variant] of Object.entries(SNAPDOM_VARIANTS)) {
      outcome.snapdomMs[name] = [];
      for (let run = 0; run < 2; run++) {
        const capture = await vendor.evaluate(async ({ root, settings }) => {
          const started = performance.now();
          const shot = await window.snapdom(document.querySelector(root), settings);
          const canvas = await shot.toCanvas();
          return {
            ms: Math.round(performance.now() - started),
            warnings: (shot.warnings ?? []).map((warning) => warning.code ?? String(warning)),
            png: canvas.toDataURL('image/png'),
          };
        }, variant);
        outcome.snapdomMs[name].push(capture.ms);
        outcome.snapdomWarnings[name] = [...new Set(capture.warnings)];
        images[name] = capture.png;
      }
    }

    if (result.elementCaptureSetup.ok) {
      const frame = await page.evaluate(grabElementCapture);
      outcome.elementCaptureMs = frame.ms;
      outcome.elementCaptureSize = frame.size;
      images['element-capture'] = frame.png;
    }

    outcome.fidelity = await page.evaluate(compare, images);
    result.scenes[scene.name] = outcome;
    for (const [name, url] of Object.entries(images)) files[`${scene.name}-${name}.png`] = url;
  }

  await mkdir(options.out, { recursive: true });
  for (const [name, url] of Object.entries(files)) {
    await writeFile(path.join(options.out, name), Buffer.from(url.split(',')[1], 'base64'));
  }
  result.out = options.out;
} catch (error) {
  session.problems.push(error.message);
}

console.log(JSON.stringify({ ...result, problems: session.problems }, null, 2));
await session.browser.close();
process.exitCode = session.problems.length ? 1 : 0;

/** In Studio's page: shares the tab and keeps the stream for later frames. */
async function startElementCapture(selector) {
  const started = performance.now();
  // Each step names itself when it stalls.
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate sends only this function
  const step = (name, promise) =>
    Promise.race([
      promise,
      new Promise((resolve, reject) =>
        setTimeout(() => reject(new Error(`${name} did not finish in 10 s`)), 10_000),
      ),
    ]);
  try {
    const stream = await step(
      'getDisplayMedia',
      navigator.mediaDevices.getDisplayMedia({ video: true, preferCurrentTab: true }),
    );
    const [track] = stream.getVideoTracks();
    const target = await step(
      'RestrictionTarget.fromElement',
      RestrictionTarget.fromElement(document.querySelector(selector)),
    );
    await step('restrictTo', track.restrictTo(target));
    const video = document.createElement('video');
    video.muted = true;
    video.srcObject = stream;
    await step('video.play', video.play());
    window.v7Capture = video;
    return { ok: true, ms: Math.round(performance.now() - started) };
  } catch (error) {
    return { ok: false, error: `${error.name}: ${error.message}` };
  }
}

/**
 * In Studio's page: the current frame of the shared stream. Capture delivers
 * frames only when the View repaints, so the playing video already holds the
 * latest one; waiting for another would wait forever on a still page.
 */
function grabElementCapture() {
  const video = window.v7Capture;
  const started = performance.now();
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  return {
    ms: Math.round(performance.now() - started),
    size: `${canvas.width}x${canvas.height}`,
    png: canvas.toDataURL('image/png'),
  };
}

/** In Studio's page: draws each capture at the reference size and compares pixels. */
async function compare(images) {
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate sends only this function
  const load = async (url) => createImageBitmap(await (await fetch(url)).blob());
  const reference = await load(images.reference);
  const { width, height } = reference;
  const pixels = (bitmap) => {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0, width, height);
    return context.getImageData(0, 0, width, height).data;
  };
  const base = pixels(reference);
  const scores = {};
  for (const [name, url] of Object.entries(images)) {
    if (name === 'reference') continue;
    const other = pixels(await load(url));
    let total = 0;
    let mismatched = 0;
    for (let i = 0; i < base.length; i += 4) {
      const diff = Math.max(
        Math.abs(base[i] - other[i]),
        Math.abs(base[i + 1] - other[i + 1]),
        Math.abs(base[i + 2] - other[i + 2]),
      );
      total += diff;
      if (diff > 40) mismatched++;
    }
    const count = base.length / 4;
    scores[name] = {
      meanDiff: Math.round((total / count) * 10) / 10,
      mismatchedPct: Math.round((mismatched / count) * 1000) / 10,
    };
  }
  return scores;
}
