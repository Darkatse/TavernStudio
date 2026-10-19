import fs from 'node:fs/promises';
import path from 'node:path';
import { OUT } from './image.mjs';
import {
  classes,
  elements,
  parseHtml,
  querySelectorAll,
  readStylesheet,
  textOf,
} from './markup.mjs';
import { readThemeModule, THEME_MODULE } from './theme-module.mjs';

const CORE_STYLESHEET = 'style.css';
const LOCALE = 'locales/zh-cn.json';

export async function writeAnatomy(image, id) {
  let files;
  try {
    files = await readAnatomy(image, id);
  } catch (error) {
    throw new Error(`Anatomy of ${id}: ${error.message}`, { cause: error });
  }
  const dir = path.join(OUT, 'anatomy', id);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  for (const [file, content] of Object.entries(files)) {
    await fs.writeFile(path.join(dir, file), `${JSON.stringify(content, null, 2)}\n`);
  }
  // What the anatomy holds, so that readers list it instead of knowing it.
  await fs.writeFile(path.join(dir, 'index.json'), `${JSON.stringify(Object.keys(files))}\n`);

  const fields = Object.entries(files['theme.json'].fields);
  const reload = fields.filter(([, field]) => !field.control).map(([key]) => key);
  const variables = Object.keys(files['css-variables.json'].variables).length;
  console.log(`Anatomy of ${id}: ${fields.length} theme fields, ${variables} CSS variables`);
  console.log(`  No control, reload to apply: ${reload.join(', ') || 'none'}`);
}

async function readAnatomy(image, id) {
  const read = (file) => fs.readFile(path.join(image, file), 'utf8');
  const module = readThemeModule(await read(THEME_MODULE));
  const doc = parseHtml(await read('index.html'));
  const locale = JSON.parse(await read(LOCALE));
  const controls = findControls(module, doc);

  const fields = {};
  for (const key of module.fields) {
    const control = controls.get(key);
    const targets = [...module.classes].map(([target, names]) => [target, drives(names, key)]);
    fields[key] = {
      control: control ? describeControl(control, locale) : null,
      cssVariables: drives(module.variables, key),
      classes: Object.fromEntries(targets.filter(([, names]) => names.length)),
      element: module.texts.get(key) ?? null,
    };
  }

  const variables = {};
  const settersOf = (name) => module.fields.filter((key) => module.variables.get(name)?.has(key));
  for (const [name, declared] of await readRootVariables(read)) {
    variables[name] = { ...declared, fields: settersOf(name) };
  }
  for (const name of module.variables.keys()) {
    if (!variables[name] && settersOf(name).length) {
      variables[name] = { default: null, source: null, fields: settersOf(name) };
    }
  }

  const toggledClasses = {};
  for (const [target, names] of module.classes) {
    toggledClasses[target] = Object.fromEntries(
      [...names].map(([name, keys]) => [name, [...keys]]),
    );
  }
  return {
    'theme.json': { vendor: id, fields },
    'css-variables.json': { vendor: id, variables },
    'landmarks.json': { vendor: id, ...readLandmarks(doc), classes: toggledClasses },
  };
}

const drives = (map, key) => [...map.keys()].filter((name) => map.get(name).has(key));

function findControls(module, doc) {
  const controls = new Map();
  for (const handler of module.handlers) {
    const keys = [...handler.keys].filter((key) => module.fields.includes(key));
    if (keys.length === 0 && !handler.dataset) continue;
    const binding = `$('${handler.selector}').on('${handler.event}')`;
    if (keys.length > 1) {
      throw new Error(`${binding} sets several theme fields: ${keys.join(', ')}`);
    }
    // `this.dataset.someKey` reads the element's `data-some-key`.
    const attribute =
      handler.dataset && `data-${handler.dataset.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

    for (const selector of handler.selector.split(',').map((part) => part.trim())) {
      const matched = querySelectorAll(doc, selector);
      if (matched.length !== 1) {
        throw new Error(`${binding}: ${selector} matches ${matched.length} elements in index.html`);
      }
      const [element] = matched;
      const key = attribute ? element.attrs[attribute] : keys[0];
      if (!key) throw new Error(`${binding}: ${selector} has no ${attribute}`);
      if (!module.fields.includes(key)) continue;
      if (controls.has(key)) {
        const first = controls.get(key).selector;
        throw new Error(`Theme field ${key} has two controls: ${first} and ${selector}`);
      }
      // What the listener then waits for on the same control before applying
      // the value, such as a slider's release.
      const commits = new Set(
        handler.later
          .filter((later) => later.event !== handler.event)
          .filter((later) => querySelectorAll(doc, later.selector).includes(element))
          .map((later) => later.event),
      );
      if (commits.size > 1) {
        throw new Error(`${binding}: ${selector} waits for ${[...commits].join(' and ')}`);
      }
      const [commit = null] = commits;
      controls.set(key, { selector, element, event: handler.event, commit });
    }
  }
  return controls;
}

function describeControl({ selector, element, event, commit }, locale) {
  const kind = controlKind(element);
  // toolcool-color-picker dispatches `change` with `detail.rgba` itself when
  // its `color` attribute is set; another dispatch makes the handler throw.
  const color = kind === 'color';
  return {
    selector,
    kind,
    write: color ? { attribute: 'color' } : { property: kind === 'checkbox' ? 'checked' : 'value' },
    dispatch: color ? null : event,
    commit,
    ...controlText(element, locale),
  };
}

function controlKind(element) {
  if (element.tag === 'toolcool-color-picker') return 'color';
  if (element.tag === 'select' || element.tag === 'textarea') return element.tag;
  if (element.tag === 'input') return element.attrs.type ?? 'text';
  throw new Error(`<${element.tag} id="${element.attrs.id}"> is not a known control`);
}

function controlText(control, locale) {
  const outside = (node) => {
    for (let n = node; n; n = n.parent) if (n === control) return false;
    return true;
  };
  for (let scope = control.parent; scope; scope = scope.parent) {
    const around = [...elements(scope)].filter(outside);
    const label = around.find((node) => i18n(node).text);
    if (!label) continue;
    const lineage = [];
    for (let n = control; n !== scope.parent; n = n.parent) lineage.push(n);
    const titled = [...lineage, ...around].find((node) => i18n(node).title);
    return {
      label: { en: textOf(label), zh: locale[i18n(label).text] ?? null },
      description: titled
        ? { en: titled.attrs.title ?? '', zh: locale[i18n(titled).title] ?? null }
        : null,
    };
  }
  return { label: null, description: null };
}

/** The keys of `data-i18n`, as ST's translateElement reads them. */
function i18n(node) {
  const keys = { text: null, title: null };
  for (const key of (node.attrs['data-i18n'] ?? '').split(';').filter(Boolean)) {
    const attribute = /\[(\S+)\](.+)/.exec(key);
    if (!attribute) keys.text = key;
    else if (attribute[1] === 'title') keys.title = attribute[2];
  }
  return keys;
}

/** Imported sheets come before the importing sheet's own properties, in cascade order. */
async function readRootVariables(read) {
  const declared = new Map();
  const visit = async (file) => {
    const { imports, properties } = readStylesheet(await read(file));
    for (const target of imports) {
      // Resolved as the browser does, against the image root.
      await visit(new URL(target, `http://image/${file}`).pathname.slice(1));
    }
    for (const { name, value } of properties) declared.set(name, { default: value, source: file });
  };
  await visit(CORE_STYLESHEET);
  return declared;
}

/**
 * The vendor names its regions with ids; an element without one is a part
 * inside a region. Attributes written without a value are render-time slots
 * and boolean flags.
 */
function readLandmarks(doc) {
  const body = [...elements(doc)].find((node) => node.tag === 'body');
  if (!body) throw new Error('index.html has no <body>');
  const skeleton = [];
  const spine = (node, depth) => {
    skeleton.push(line(node, depth));
    for (const child of node.children) {
      if (child.attrs?.id && !isTemplate(child)) spine(child, depth + 1);
    }
  };
  spine(body, 0);

  const templates = {};
  const visit = (node) => {
    for (const child of node.children) {
      if (!child.tag) continue;
      if (!isTemplate(child)) {
        visit(child);
      } else if (!child.attrs.id) {
        throw new Error(`A template in index.html has no id: ${line(child, 0)}`);
      } else {
        templates[child.attrs.id] = child.children.filter((c) => c.tag).flatMap((c) => outline(c));
      }
    }
  };
  visit(body);
  return { skeleton, templates };
}

const isTemplate = (node) => node.tag === 'template' || classes(node).includes('template_element');

function outline(node, depth = 0) {
  const children = node.children.filter((child) => child.tag);
  return [line(node, depth), ...children.flatMap((child) => outline(child, depth + 1))];
}

function line(node, depth) {
  const id = node.attrs.id ? `#${node.attrs.id}` : '';
  const names = classes(node).map((name) => `.${name}`);
  const flags = Object.keys(node.attrs)
    .filter((name) => node.attrs[name] === '' && name !== 'id' && name !== 'class')
    .map((name) => `[${name}]`);
  return `${'  '.repeat(depth)}${node.tag}${id}${names.join('')}${flags.join('')}`;
}
