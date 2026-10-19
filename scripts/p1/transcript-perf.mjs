import { createServer } from 'node:http';
import { parseArgs } from 'node:util';
import { createThemeProject, launch, openStudio, useModel, vendorPage } from '../lib/studio.mjs';

const { values: options } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:3000/' },
    browser: { type: 'string', default: 'chrome' },
    port: { type: 'string', default: '3415' },
  },
});

const RUNS = 200;
const CALLS_PER_RUN = 10;
const PIECES = 3000;

async function startStreamingModel(port) {
  const server = createServer(async (request, response) => {
    if (request.method === 'OPTIONS') {
      response
        .writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' })
        .end();
      return;
    }
    for await (const _ of request);
    response.writeHead(200, {
      'access-control-allow-origin': '*',
      'content-type': 'text/event-stream',
    });
    const send = (delta, finish = null) =>
      response.write(
        `data: ${JSON.stringify({ id: 's', object: 'chat.completion.chunk', created: 0, model: 'm', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`,
      );
    for (let index = 0; index < PIECES; index++) {
      send({ content: index % 40 === 39 ? '\n\n' : `词${index % 10} ` });
      if (index % 4 === 0) await new Promise((resolve) => setTimeout(resolve, 2));
    }
    send({}, 'stop');
    response.end('data: [DONE]\n\n');
  });
  await new Promise((resolve) => server.listen(port, resolve));
  return server;
}

function seed({ runs, calls }) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('tavern-studio');
    request.addEventListener('error', () => reject(request.error), { once: true });
    request.addEventListener('success', () => {
      const database = request.result;
      const projects = database.transaction('projects').objectStore('projects').getAll();
      projects.addEventListener('success', () => {
        const project = projects.result[0].id;
        const transaction = database.transaction(['history', 'journal'], 'readwrite');
        const history = transaction.objectStore('history');
        const journal = transaction.objectStore('journal');
        const usage = {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        };
        const assistant = (content, stopReason) => ({
          role: 'assistant',
          content,
          api: 'openai-completions',
          provider: 'perf',
          model: 'm',
          usage,
          stopReason,
          timestamp: 0,
        });
        let time = Date.now() - runs * 60_000;
        for (let run = 0; run < runs; run++) {
          const id = `perf-${run}`;
          journal.add({ project, event: { type: 'run_created', run: id, time } });
          history.add({
            project,
            run: id,
            round: 0,
            message: {
              role: 'user',
              content: `第 ${run} 个请求：把引号改成别的颜色`,
              timestamp: time,
            },
          });
          for (let call = 0; call < calls; call++) {
            const callId = `${id}-${call}`;
            history.add({
              project,
              run: id,
              round: call + 1,
              message: assistant(
                [
                  { type: 'text', text: `看看第 ${call} 个文件。` },
                  {
                    type: 'toolCall',
                    id: callId,
                    name: 'workspace_read_file',
                    arguments: { path: `project/file-${call}.css` },
                  },
                ],
                'toolUse',
              ),
            });
            history.add({
              project,
              run: id,
              round: call + 1,
              message: {
                role: 'toolResult',
                toolCallId: callId,
                toolName: 'workspace_read_file',
                content: [
                  {
                    type: 'text',
                    text: `project/file-${call}.css lines 1-3\n1 | .mes {\n2 |   color: red;\n3 | }`,
                  },
                ],
                isError: false,
                timestamp: time,
                durationMs: 3,
              },
            });
          }
          history.add({
            project,
            run: id,
            round: calls + 1,
            message: assistant(
              [
                {
                  type: 'text',
                  text: `## 改好了\n\n- 引号改成了 **青色**\n- 正文不变\n\n\`\`\`css\n.mes q { color: teal; }\n\`\`\``,
                },
              ],
              'stop',
            ),
          });
          time += 60_000;
          journal.add({ project, event: { type: 'run_completed', run: id, time } });
        }
        transaction.addEventListener('complete', () => resolve(project), { once: true });
        transaction.addEventListener('error', () => reject(transaction.error), { once: true });
      });
    });
  });
}

function watch() {
  const started = Boolean(window.__perf);
  window.__perf = { longTasks: [], frames: [] };
  if (started) return;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) window.__perf.longTasks.push(Math.round(entry.duration));
  }).observe({ type: 'longtask' });
  let last = performance.now();
  const frame = (now) => {
    window.__perf.frames.push(now - last);
    last = now;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function summary() {
  const { longTasks, frames } = window.__perf;
  const sorted = frames.toSorted((a, b) => a - b);
  const at = (q) => Math.round(sorted[Math.floor(q * (sorted.length - 1))] * 10) / 10;
  return {
    longTasksOver50: longTasks.filter((duration) => duration > 50),
    longestTask: Math.max(0, ...longTasks),
    frames: frames.length,
    frameP50: at(0.5),
    frameP95: at(0.95),
    framesOver33: frames.filter((gap) => gap > 33).length,
  };
}

const server = await startStreamingModel(Number(options.port));
const session = await launch(options);
const result = {};
try {
  const page = await openStudio(session, options.url);
  await createThemeProject(page);
  await page.evaluate(seed, { runs: RUNS, calls: CALLS_PER_RUN });

  await page.reload();
  const transcript = page.locator('[role=log]');
  await transcript.waitFor({ timeout: 60_000 });
  await page.waitForFunction(
    (runs) => document.querySelectorAll('[role=log] section').length === runs,
    RUNS,
  );
  // The preview shares the main thread; measure once the frontend has started and settled.
  await vendorPage(page);
  await page.waitForTimeout(3000);
  await page.evaluate(watch);
  const box = await transcript.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let step = 0; step < 120; step++) {
    await page.mouse.wheel(0, -1500);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(500);
  result.longTranscript = {
    runs: RUNS,
    toolCalls: RUNS * CALLS_PER_RUN,
    ...(await page.evaluate(summary)),
  };

  await useModel(page, `http://localhost:${options.port}/v1`, 'stream');
  await page.evaluate(() => {
    const log = document.querySelector('[role=log]');
    log.scrollTop = log.scrollHeight;
  });
  await page.evaluate(watch);
  const composer = page.getByLabel('给 Agent 的消息');
  await composer.fill('写一段长回复');
  await composer.press('Enter');
  await page.waitForFunction(
    (runs) => {
      const log = document.querySelector('[role=log]');
      return (
        log.getAttribute('aria-busy') === 'false' && log.querySelectorAll('section').length > runs
      );
    },
    RUNS,
    { timeout: 120_000 },
  );
  result.streaming = { pieces: PIECES, ...(await page.evaluate(summary)) };
  result.passed =
    result.longTranscript.longTasksOver50.length === 0 &&
    result.streaming.longTasksOver50.length === 0 &&
    result.streaming.frameP95 <= 17;
} catch (error) {
  session.problems.push(error.message);
}

console.log(JSON.stringify({ ...result, problems: session.problems }, null, 2));
await session.browser.close();
server.close();
process.exitCode = session.problems.length || !result.passed ? 1 : 0;
