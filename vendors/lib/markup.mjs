// Reads only a vendor's own index.html and style.css, which are hand-written
// and well-formed.

const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);
const TEXT_ONLY = new Set(['script', 'style', 'textarea', 'title']);
const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: String.fromCodePoint(0xa0),
};

export function parseHtml(html) {
  const root = { tag: '#document', attrs: {}, children: [], parent: null };
  const lower = html.toLowerCase();
  let open = root;
  let i = 0;
  const appendText = (text) => text && open.children.push({ text: decode(text), parent: open });

  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      appendText(html.slice(i));
      break;
    }
    appendText(html.slice(i, lt));
    if (html.startsWith('<!--', lt)) {
      i = after(html, '-->', lt);
    } else if (html.startsWith('</', lt)) {
      const end = after(html, '>', lt);
      const tag = html
        .slice(lt + 2, end - 1)
        .trim()
        .toLowerCase();
      let closing = open;
      while (closing !== root && closing.tag !== tag) closing = closing.parent;
      if (closing !== root) open = closing.parent;
      i = end;
    } else if (/[a-zA-Z]/.test(html[lt + 1] ?? '')) {
      const { element, end, selfClosing } = readStartTag(html, lt);
      element.parent = open;
      open.children.push(element);
      i = end;
      if (TEXT_ONLY.has(element.tag)) {
        const close = lower.indexOf(`</${element.tag}`, i);
        if (close === -1) throw new Error(`Unclosed <${element.tag}> at offset ${lt}`);
        if (close > i) element.children.push({ text: html.slice(i, close), parent: element });
        i = after(html, '>', close);
      } else if (!selfClosing && !VOID.has(element.tag)) {
        open = element;
      }
    } else if (html[lt + 1] === '!') {
      i = after(html, '>', lt);
    } else {
      appendText('<');
      i = lt + 1;
    }
  }
  return root;
}

function readStartTag(html, start) {
  let i = start + 1;
  const name = /^[^\s/>]+/.exec(html.slice(i, i + 64))[0];
  i += name.length;
  const attrs = {};
  for (;;) {
    while (/\s/.test(html[i])) i++;
    const selfClosing = html.startsWith('/>', i);
    if (selfClosing || html[i] === '>') {
      const element = { tag: name.toLowerCase(), attrs, children: [], parent: null };
      return { element, end: i + (selfClosing ? 2 : 1), selfClosing };
    }
    if (i >= html.length) throw new Error(`Unterminated <${name}> at offset ${start}`);
    const attr = /^[^\s=/>]+/.exec(html.slice(i, i + 256))?.[0];
    if (!attr) throw new Error(`Unreadable attribute in <${name}> at offset ${i}`);
    i += attr.length;
    while (/\s/.test(html[i])) i++;
    let value = '';
    if (html[i] === '=') {
      i++;
      while (/\s/.test(html[i])) i++;
      const quote = html[i];
      if (quote === '"' || quote === "'") {
        const close = html.indexOf(quote, i + 1);
        value = html.slice(i + 1, close);
        i = close + 1;
      } else {
        value = /^[^\s>]*/.exec(html.slice(i, i + 1024))[0];
        i += value.length;
      }
    }
    attrs[attr.toLowerCase()] = decode(value);
  }
}

function after(text, token, from) {
  const at = text.indexOf(token, from);
  if (at === -1) throw new Error(`Expected ${token} after offset ${from}`);
  return at + token.length;
}

function decode(text) {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, body) => {
    if (body[0] !== '#') return ENTITIES[body.toLowerCase()] ?? entity;
    return String.fromCodePoint(
      body[1] === 'x' ? parseInt(body.slice(2), 16) : Number(body.slice(1)),
    );
  });
}

export function* elements(node) {
  for (const child of node.children ?? []) {
    if (!child.tag) continue;
    yield child;
    yield* elements(child);
  }
}

export function classes(node) {
  return (node.attrs.class ?? '').split(/\s+/).filter(Boolean);
}

export function textOf(node) {
  const parts = [];
  const visit = (n) => (n.tag ? n.children.forEach(visit) : parts.push(n.text));
  visit(node);
  return parts.join('').replace(/\s+/g, ' ').trim();
}

export function querySelectorAll(root, selectorList) {
  const compounds = selectorList.split(',').map((selector) => parseCompound(selector.trim()));
  return [...elements(root)].filter((node) => compounds.some((test) => test(node)));
}

function parseCompound(selector) {
  const part = /([#.]?)([\w-]+)|\[([\w-]+)(?:=(["']?)(.*?)\4)?\]/y;
  const tests = [];
  while (part.lastIndex < selector.length) {
    const at = part.lastIndex;
    const match = part.exec(selector);
    if (!match || match.index !== at) throw new Error(`Unsupported selector: ${selector}`);
    const [, sigil, name, attr, , value] = match;
    if (attr) {
      tests.push((n) => (value === undefined ? attr in n.attrs : n.attrs[attr] === value));
    } else if (sigil === '#') {
      tests.push((n) => n.attrs.id === name);
    } else if (sigil === '.') {
      tests.push((n) => classes(n).includes(name));
    } else {
      tests.push((n) => n.tag === name.toLowerCase());
    }
  }
  if (tests.length === 0) throw new Error(`Empty selector in a selector list`);
  return (node) => tests.every((test) => test(node));
}

/** Rules inside at-rules (`@media`, `@supports`) are conditional and left out. */
export function readStylesheet(css) {
  const text = stripComments(css);
  const imports = [];
  const properties = [];
  let i = 0;
  while (i < text.length) {
    const stop = scanTo(text, i, ';{');
    const prelude = text.slice(i, stop).trim();
    if (stop >= text.length) {
      if (prelude) throw new Error(`Unterminated CSS statement: ${prelude.slice(0, 60)}`);
      break;
    }
    if (text[stop] === ';') {
      const target = /^@import\s+(?:url\(\s*)?["']?([^"')\s]+)/i.exec(prelude)?.[1];
      if (target) imports.push(target);
      i = stop + 1;
      continue;
    }
    const close = scanTo(text, stop + 1, '}');
    if (prelude === ':root') properties.push(...declarations(text.slice(stop + 1, close)));
    i = close + 1;
  }
  return { imports, properties };
}

function declarations(block) {
  const found = [];
  let i = 0;
  while (i < block.length) {
    const end = scanTo(block, i, ';');
    const declaration = block.slice(i, end);
    const colon = declaration.indexOf(':');
    const name = declaration.slice(0, colon).trim();
    if (colon !== -1 && name.startsWith('--')) {
      found.push({
        name,
        value: declaration
          .slice(colon + 1)
          .replace(/\s+/g, ' ')
          .trim(),
      });
    }
    i = end + 1;
  }
  return found;
}

function scanTo(text, from, stops) {
  let depth = 0;
  for (let i = from; i < text.length; i++) {
    const char = text[i];
    if (char === '"' || char === "'") {
      i = text.indexOf(char, i + 1);
      if (i === -1) throw new Error(`Unterminated CSS string after offset ${from}`);
    } else if (depth === 0 && stops.includes(char)) {
      return i;
    } else if (char === '{' || char === '(' || char === '[') {
      depth++;
    } else if (char === '}' || char === ')' || char === ']') {
      depth--;
    }
  }
  return text.length;
}

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}
