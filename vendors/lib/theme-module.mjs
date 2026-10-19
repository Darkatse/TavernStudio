// Reads a vendor's theme module from its syntax tree, for the anatomy
// (anatomy.mjs). The module owns power_user: the theme fields, the handlers of
// their controls and the functions that apply them.

import { parse } from 'acorn';
import * as walk from 'acorn-walk';

export const THEME_MODULE = 'scripts/power-user.js';
const POWER_USER = 'power_user';
const CLASS_METHODS = new Set([
  'toggleClass',
  'addClass',
  'removeClass',
  'toggle',
  'add',
  'remove',
]);
/** jQuery methods returning the set they are called on. */
const SAME_SET = new Set(['on', 'off']);

/**
 * - `fields`: the keys of getThemeObject, each read from `power_user.<key>`;
 * - `handlers`: `$(selector).on('input' | 'change', listener)` bindings, with
 *   the power_user keys the listener assigns, and the bindings it makes when
 *   it runs (`later`), such as a slider's `mouseup` that applies the value;
 * - `variables`: CSS variable → power_user keys its written value derives from;
 * - `classes`: element selector → class → power_user keys deciding whether
 *   the element has it;
 * - `texts`: power_user key → the selector of the element whose content it
 *   becomes, such as custom_css → `#custom-style`.
 */
export function readThemeModule(source) {
  const program = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  const functions = new Map();
  for (const statement of program.body) {
    const declaration =
      statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    if (declaration?.type === 'FunctionDeclaration') {
      functions.set(declaration.id.name, declaration);
    }
  }
  // Scope (function or program) → name → initializer; null for parameters.
  const bindings = new Map();
  walk.ancestor(program, {
    Function(fn) {
      for (const name of fn.params.flatMap(patternNames)) entry(bindings, fn, Map).set(name, null);
    },
    VariableDeclarator(declarator, _, ancestors) {
      const scope = ancestors.findLast(isFunction) ?? program;
      for (const name of patternNames(declarator.id)) {
        entry(bindings, scope, Map).set(name, declarator.init);
      }
    },
  });
  const scopesOf = (ancestors) => [...ancestors.filter(isFunction).toReversed(), program];
  /** The initializer `name` is bound to in the innermost of `scopes`, and the scopes it sees. */
  const lookup = (name, scopes) => {
    const index = scopes.findIndex((scope) => bindings.get(scope)?.has(name));
    const init = index === -1 ? null : bindings.get(scopes[index]).get(name);
    return init && { init, scopes: scopes.slice(index) };
  };

  /** The power_user keys a value derives from, through local variables and module functions. */
  function readsOf(node, scopes, seen = new Set()) {
    const keys = new Set();
    const follow = (next, nextScopes) => {
      if (seen.has(next)) return;
      seen.add(next);
      for (const key of readsOf(next, nextScopes, seen)) keys.add(key);
    };
    walk.simple(node, {
      MemberExpression(member) {
        const key = powerUserKey(member);
        if (key) keys.add(key);
      },
      Identifier(identifier) {
        const bound = identifier.name !== POWER_USER && lookup(identifier.name, scopes);
        if (bound) follow(bound.init, bound.scopes);
      },
      CallExpression(call) {
        const fn = call.callee.type === 'Identifier' && functions.get(call.callee.name);
        if (fn) for (const value of returnedValues(fn)) follow(value, [fn, program]);
      },
    });
    return keys;
  }

  /**
   * The selector of a jQuery object, when the source names its element:
   * `$('#a')`, `$(document.body)`, the same set returned by `.off(…)` or
   * `.on(…)`, or a variable holding one.
   */
  function selectorOf(node, scopes) {
    if (node?.type === 'Identifier') {
      const bound = lookup(node.name, scopes);
      return bound ? selectorOf(bound.init, bound.scopes) : null;
    }
    if (node?.type !== 'CallExpression') return null;
    if (SAME_SET.has(memberName(node.callee))) return selectorOf(node.callee.object, scopes);
    if (!isJQuery(node.callee)) return null;
    const [element] = node.arguments;
    return isString(element) ? element.value : documentElement(element);
  }

  /** The selector of the element a class method acts on: jQuery's, or `classList`'s. */
  const classTarget = (object, method, scopes) =>
    method.endsWith('Class')
      ? selectorOf(object, scopes)
      : memberName(object) === 'classList' && documentElement(object.object);

  const getThemeObject = functions.get('getThemeObject');
  if (!getThemeObject) throw new Error(`${THEME_MODULE}: no getThemeObject function`);
  const fields = themeFields(getThemeObject);

  /** The id of the element a value is, when the source names it: `document.getElementById(id)`. */
  function elementId(node, scopes) {
    if (node?.type === 'Identifier') {
      const bound = lookup(node.name, scopes);
      return bound ? elementId(bound.init, bound.scopes) : null;
    }
    if (node?.type !== 'CallExpression' || memberName(node.callee) !== 'getElementById')
      return null;
    return stringValue(node.arguments[0], scopes);
  }

  /** A string literal, or a variable bound to one. */
  function stringValue(node, scopes) {
    if (isString(node)) return node.value;
    if (node?.type !== 'Identifier') return null;
    const bound = lookup(node.name, scopes);
    return bound ? stringValue(bound.init, bound.scopes) : null;
  }

  const handlers = [];
  // Every `.on` binding on a named element, with the functions it is made in.
  const listened = [];
  const variables = new Map();
  const classes = new Map();
  const texts = new Map();
  walk.ancestor(program, {
    AssignmentExpression({ left, right }, _, ancestors) {
      const property = memberName(left);
      if (property !== 'innerHTML' && property !== 'textContent') return;
      const scopes = scopesOf(ancestors);
      const id = elementId(left.object, scopes);
      if (!id) return;
      for (const key of readsOf(right, scopes)) texts.set(key, `#${id}`);
    },
    CallExpression(call, _, ancestors) {
      const method = memberName(call.callee);
      const [first, second] = call.arguments;
      if (method === 'on') {
        const selector = selectorOf(call.callee.object, scopesOf(ancestors));
        if (!selector || !isString(first)) return;
        const within = new Set(ancestors.filter(isFunction));
        listened.push({ call, selector, event: eventNames(first.value)[0], within });
        const handler = valueHandler(call, selector, functions);
        if (handler) handlers.push(handler);
      } else if (
        method === 'setProperty' &&
        isString(first) &&
        first.value.startsWith('--') &&
        second
      ) {
        const keys = entry(variables, first.value, Set);
        for (const key of readsOf(second, scopesOf(ancestors))) keys.add(key);
      } else if (CLASS_METHODS.has(method) && isString(first)) {
        const scopes = scopesOf(ancestors);
        const target = classTarget(call.callee.object, method, scopes);
        if (!target) return;
        // A class toggled by a state argument depends on it; otherwise on the
        // conditions it is set under.
        const toggled = second && (method === 'toggleClass' || method === 'toggle');
        const tests = toggled ? [second] : conditionsOf(ancestors);
        const keys = tests.flatMap((test) => [...readsOf(test, scopes)]);
        if (keys.length === 0) return;
        for (const name of first.value.split(/\s+/).filter(Boolean)) {
          const set = entry(entry(classes, target, Map), name, Set);
          for (const key of keys) set.add(key);
        }
      }
    },
  });

  for (const handler of handlers) {
    const reached = reachable(handler.listener, functions);
    handler.later = listened
      .filter(
        ({ call, within }) => call !== handler.call && [...within].some((fn) => reached.has(fn)),
      )
      .map(({ selector, event }) => ({ selector, event }));
  }
  return { fields, handlers, variables, classes, texts };
}

function themeFields(getThemeObject) {
  const object = getThemeObject.body.body.find((node) => node.type === 'ReturnStatement')?.argument;
  if (object?.type !== 'ObjectExpression') {
    throw new Error(`${THEME_MODULE}: getThemeObject does not return an object literal`);
  }
  const name = getThemeObject.params[0]?.name;
  const fields = [];
  for (const property of object.properties) {
    const key = property.key?.name ?? property.key?.value;
    if (property.value?.type === 'Identifier' && property.value.name === name) continue;
    if (property.computed || powerUserKey(property.value) !== key) {
      throw new Error(`${THEME_MODULE}: getThemeObject's ${key} is not power_user.${key}`);
    }
    fields.push(key);
  }
  return fields;
}

/**
 * A direct `$(selector).on(events, listener)` binding for an input or change
 * event; a delegated `.on(events, selector, listener)` listens elsewhere.
 */
function valueHandler(call, selector, functions) {
  const [events, listener] = call.arguments;
  if (call.arguments.length !== 2) return null;
  const event = eventNames(events.value).find((name) => name === 'input' || name === 'change');
  const fn = listener.type === 'Identifier' ? functions.get(listener.name) : listener;
  if (!event || !isFunction(fn)) return null;

  const keys = new Set();
  let dataset = null;
  walk.simple(fn.body, {
    AssignmentExpression({ left }) {
      const key = powerUserKey(left);
      if (key) keys.add(key);
      // `power_user[this.dataset.setting] = …`: each bound element names its key.
      if (left.type === 'MemberExpression' && isPowerUser(left.object) && left.computed) {
        const { object } = left.property;
        if (memberName(object) === 'dataset' && object.object.type === 'ThisExpression') {
          dataset = memberName(left.property);
        }
      }
    },
  });
  return { call, selector, event, listener: fn, keys, dataset };
}

/** The function and the module functions it calls, directly or not. */
function reachable(fn, functions) {
  const reached = new Set([fn]);
  for (const next of reached) {
    walk.simple(next.body, {
      CallExpression(call) {
        const callee = call.callee.type === 'Identifier' && functions.get(call.callee.name);
        if (callee) reached.add(callee);
      },
    });
  }
  return reached;
}

/** Event types of a jQuery events string, such as `mouseup touchend` or `input.zen`. */
const eventNames = (events) =>
  events
    .split(/\s+/)
    .filter(Boolean)
    .map((name) => name.split('.')[0]);

/** `document.body` as `body`, `document.documentElement` as `html`. */
function documentElement(node) {
  if (node?.type !== 'MemberExpression' || node.object.type !== 'Identifier') return null;
  if (node.object.name !== 'document') return null;
  return { body: 'body', documentElement: 'html' }[memberName(node)] ?? null;
}

/** Tests of the branches enclosing the last ancestor, within its function. */
function conditionsOf(ancestors) {
  const tests = [];
  for (let i = ancestors.length - 2; i >= 0 && !isFunction(ancestors[i]); i--) {
    const node = ancestors[i];
    if (node.type === 'IfStatement' || node.type === 'ConditionalExpression') tests.push(node.test);
    if (node.type === 'SwitchStatement') tests.push(node.discriminant);
  }
  return tests;
}

/** Values a function returns, without those of the functions nested in it. */
function returnedValues(fn) {
  if (fn.expression) return [fn.body];
  const values = [];
  walk.recursive(fn.body, null, {
    Function() {},
    ReturnStatement(node) {
      if (node.argument) values.push(node.argument);
    },
  });
  return values;
}

function patternNames(pattern) {
  switch (pattern?.type) {
    case 'Identifier':
      return [pattern.name];
    case 'ObjectPattern':
      return pattern.properties.flatMap((p) =>
        patternNames(p.type === 'RestElement' ? p : p.value),
      );
    case 'ArrayPattern':
      return pattern.elements.flatMap(patternNames);
    case 'RestElement':
      return patternNames(pattern.argument);
    case 'AssignmentPattern':
      return patternNames(pattern.left);
    default:
      return [];
  }
}

/** The value at `key`, created empty first. */
function entry(map, key, Empty) {
  if (!map.has(key)) map.set(key, new Empty());
  return map.get(key);
}

const isFunction = (node) => /Function/.test(node?.type ?? '');
const isString = (node) => node?.type === 'Literal' && typeof node.value === 'string';
const isJQuery = (node) =>
  node.type === 'Identifier' && (node.name === '$' || node.name === 'jQuery');
const isPowerUser = (node) => node.type === 'Identifier' && node.name === POWER_USER;
const memberName = (node) =>
  node?.type === 'MemberExpression' && !node.computed ? node.property.name : undefined;
const powerUserKey = (node) =>
  node?.type === 'MemberExpression' && isPowerUser(node.object) ? memberName(node) : undefined;
