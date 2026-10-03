// Links between the screens and the server (ARCHITECTURE.md §6.10, "Dependencies of a page"): the API paths written
// in a page's own front-end files (`api.get("/admin/groups")`, `fetch(\`/api/orders/${id}\`)`) are matched against
// the routes of facts/api.json, so that the server code behind a screen is a dependency of its page (sync flags
// the page when that code changes; doc-kit context gives its handlers to the writer).
// Pure functions: the caller reads the files and the facts.

/** A route segment that stands for any value: `{id}`, `[id]`, `[...slug]`, `:id`, or a `${…}` of the code. */
const isParam = (segment) => /^(\{.+\}|\[.+\]|:.+|\$\{.*\})$/.test(segment);

/**
 * API paths written as string literals in a source text: a quoted or template literal starting with "/", with at
 * least two segments (one-segment paths like "/" or "/login" say too little to be linked). The query string is
 * dropped; a `${…}` stays as a parameter segment.
 * @returns {string[]} distinct paths, in order of appearance
 */
export function apiPathsIn(text) {
  const out = new Set();
  const src = String(text);
  for (const m of src.matchAll(/["'`]\//g)) {
    const p = readPath(src, m.index + 1).replace(/\/+$/, "");
    if (p.split("/").filter(Boolean).length >= 2) out.add(p);
  }
  return [...out];
}

/**
 * The path that starts at `start` (a "/"), read character by character: path characters, and a `${…}` (braces
 * balanced, so a nested template such as `${f ? `?a=${x}` : ""}` is skipped whole) only when it forms a whole
 * segment, where it becomes ":param". Anything else ends the path: a query, a `${…}` glued to a segment
 * (`/list${query}` → `/list`), a quote, a space.
 */
function readPath(src, start) {
  let out = "";
  let i = start;
  while (i < src.length) {
    const c = src[i];
    if (/[A-Za-z0-9_\-./]/.test(c)) {
      out += c;
      i++;
    } else if (c === "$" && src[i + 1] === "{" && out.endsWith("/")) {
      let depth = 0;
      let j = i + 1;
      for (; j < src.length; j++) {
        if (src[j] === "{") depth++;
        else if (src[j] === "}" && --depth === 0) break;
      }
      if (j >= src.length) break;
      out += ":param";
      i = j + 1;
    } else break;
  }
  return out;
}

/** Segments of a path, empty ones removed. */
const segments = (p) => p.split("/").filter(Boolean);

/**
 * Does a path written in the code name this route? The path's segments must equal the LAST segments of the route
 * (the route may carry a prefix the client adds, like /api); a parameter on either side matches any segment.
 */
export function pathMatchesRoute(written, route) {
  const w = segments(written);
  const r = segments(route);
  if (w.length > r.length) return false;
  const tail = r.slice(r.length - w.length);
  return w.every((s, i) => s === tail[i] || isParam(s) || isParam(tail[i]));
}

/**
 * The API routes (facts/api.json items) named by the paths written in `texts`.
 * @param {string[]} texts   the page's own front-end files
 * @param {Array<{ method: string, route: string, file: string, line?: number }>} items
 * @returns {Array<object>} the matching items, each once
 */
export function apiRoutesCalledBy(texts, items) {
  const paths = [...new Set(texts.flatMap(apiPathsIn))];
  return (items || []).filter((item) => item.route && paths.some((p) => pathMatchesRoute(p, item.route)));
}
