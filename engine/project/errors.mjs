// Kit error: an exit code (ARCHITECTURE.md §4) and translatable messages.
//   0 OK · 1 a check failed · 2 invalid usage or configuration · 3 environment problem
// `key` is a `cli.*` i18n key (without the "cli." prefix) describing what is wrong; `<key>.help` says what to do.
// `details`: list of { path, key, vars } (validation errors, one line each).

export const EXIT = Object.freeze({ OK: 0, CHECK: 1, USAGE: 2, ENVIRONMENT: 3 });

export class KitError extends Error {
  /**
   * @param {number} code      exit code
   * @param {string} key       i18n key, without "cli."
   * @param {object} [vars]
   * @param {{ details?: object[], prefix?: string, cause?: unknown }} [more]
   */
  constructor(code, key, vars = {}, { details = [], prefix = "", cause } = {}) {
    super(`${key} ${JSON.stringify(vars)}`, cause ? { cause } : undefined);
    this.name = "KitError";
    this.code = code;
    this.key = key;
    this.vars = vars;
    this.details = details;
    this.prefix = prefix;
  }
}
