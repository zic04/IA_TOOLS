// `doc-kit record` (ETUDE-CAPTURES.md D1): a capture plan entry written from what a person does in the browser.
// Playwright's own recorder (codegen) writes JavaScript; this module turns its lines into the kit's plan entry —
// the route of the first page opened, then one action per click, fill, choice or key — and lists the lines it
// could not translate, so that nothing is lost silently. Pure functions: the command runs codegen.
//
// Expressions are linear (RULES.md S5): string literals are read with the unrolled-loop pattern, never with
// nested quantifiers.

/** A JavaScript string literal in single or double quotes (codegen uses single quotes), captured without quotes. */
const STR = `'((?:[^'\\\\\\n]|\\\\.)*)'|"((?:[^"\\\\\\n]|\\\\.)*)"`;

export const RECORD_PATTERNS = Object.freeze({
  goto: new RegExp(`^await page\\.goto\\((?:${STR})\\);?$`),
  // page.<locator chain>.<action>(<args>);
  call: /^await page\.(.+)\.(click|dblclick|check|uncheck|fill|selectOption|press|hover)\((.*)\);?$/,
  keyboard: new RegExp(`^await page\\.keyboard\\.press\\((?:${STR})\\);?$`),
  locator: new RegExp(
    `^(getByRole|getByText|getByLabel|getByPlaceholder|locator)\\((?:${STR})(?:,\\s*\\{([^{}]*)\\})?\\)`,
  ),
  name: new RegExp(`name:\\s*(?:${STR})`),
  exact: /exact:\s*true/,
  nth: /^\.nth\((\d+)\)/,
  first: /^\.first\(\)/,
  last: /^\.last\(\)/,
  arg: new RegExp(`^(?:${STR})$`),
});

/** The value of a captured string literal (single- or double-quoted alternative), unescaped. */
function unquote(m, i) {
  const raw = m[i] ?? m[i + 1] ?? "";
  return raw.replace(/\\(.)/g, "$1");
}

/** A kit target from a codegen locator chain (`getByRole('button', { name: 'Save' }).first()`), or null. */
export function targetOf(chain) {
  const m = RECORD_PATTERNS.locator.exec(chain);
  if (!m) return null;
  const [, fn] = m;
  const value = unquote(m, 2);
  const opts = m[4] || "";
  const t = {};
  if (fn === "getByRole") {
    t.role = value;
    const n = RECORD_PATTERNS.name.exec(opts);
    if (n) t.name = unquote(n, 1);
  } else if (fn === "getByText") t.text = value;
  else if (fn === "getByLabel") t.label = value;
  else if (fn === "getByPlaceholder") t.placeholder = value;
  else t.css = value;
  if (RECORD_PATTERNS.exact.test(opts)) t.exact = true;
  const rest = chain.slice(m[0].length);
  if (!rest) return t;
  const nth = RECORD_PATTERNS.nth.exec(rest);
  if (nth && rest.length === nth[0].length) return { ...t, nth: Number(nth[1]) };
  if (RECORD_PATTERNS.first.test(rest) && rest === ".first()") return t;
  if (RECORD_PATTERNS.last.test(rest) && rest === ".last()") return { ...t, last: true };
  return null; // a longer chain (filter, nested locators): not translated
}

/** The route of a URL on the application (path, query and hash), or null when it is another origin. */
export function routeOf(url, appUrl) {
  try {
    const u = new URL(url, appUrl);
    const app = new URL(appUrl);
    if (u.origin !== app.origin) return null;
    const base = app.pathname.replace(/\/$/, "");
    const p = base && u.pathname.startsWith(base) ? u.pathname.slice(base.length) || "/" : u.pathname;
    return p + u.search + u.hash;
  } catch {
    return null;
  }
}

/**
 * A plan entry from codegen's JavaScript.
 * @param {string} code
 * @param {{ appUrl: string, id: string, route?: string|null }} o   route: the route asked for, when no goto is found
 * @returns {{ entry: object, skipped: string[] }}
 */
export function codegenToEntry(code, { appUrl, id, route = null }) {
  const actions = [];
  const skipped = [];
  let first = null;
  for (const raw of String(code).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith("await page.")) continue;
    let m = RECORD_PATTERNS.goto.exec(line);
    if (m) {
      const r = routeOf(unquote(m, 1), appUrl);
      if (first === null && r) first = r;
      else skipped.push(line);
      continue;
    }
    m = RECORD_PATTERNS.keyboard.exec(line);
    if (m) {
      actions.push({ press: unquote(m, 1) });
      continue;
    }
    m = RECORD_PATTERNS.call.exec(line);
    const target = m ? targetOf(m[1]) : null;
    if (!m || !target) {
      skipped.push(line);
      continue;
    }
    const [, , action, args] = m;
    const arg = RECORD_PATTERNS.arg.exec(args.trim());
    const value = arg ? unquote(arg, 1) : null;
    if (action === "click" || action === "dblclick" || action === "check" || action === "uncheck")
      actions.push({ click: target });
    else if (action === "hover") actions.push({ hover: target });
    else if (action === "fill" && value !== null) actions.push({ type: target, value });
    else if (action === "selectOption" && value !== null) actions.push({ select: target, value });
    else if (action === "press" && value !== null) actions.push({ click: target }, { press: value });
    else skipped.push(line);
  }
  const entry = { id, title: "", route: first ?? route ?? "/", ...(actions.length ? { actions } : {}), zones: [] };
  return { entry, skipped };
}

/** The plan file for one recorded entry: a module exporting CAPTURES, the untranslated lines as comments. */
export function planModule(entry, skipped = []) {
  const notes = skipped.length
    ? `// Not translated (to rewrite by hand, or leave out):\n${skipped.map((l) => `//   ${l}`).join("\n")}\n`
    : "";
  return `// Recorded with doc-kit record. Add the zones (the numbered markers) and the frame, then check the preview:\n//   doc-kit capture ${entry.id} --preview\n${notes}export const CAPTURES = [\n  ${JSON.stringify(entry, null, 2).replace(/\n/g, "\n  ")},\n];\n`;
}
