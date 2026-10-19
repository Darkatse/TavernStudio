/**
 * A window used as a JavaScript realm: its own constructors (Request,
 * Response, Element...) build objects that pass the page's own checks.
 */
export type Realm = Window & typeof globalThis;
