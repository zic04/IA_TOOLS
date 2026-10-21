// Stack adapter of Express and of the routers written like it — Fastify, Hono, Koa (ARCHITECTURE.md §5):
// `app.<method>("/path", …middleware, handler)` and `router.<method>(…)`, `.ws(…)` included (express-ws, method "WS",
// §6.13); the guards are the names of the middleware between the path and the handler. A call inside a comment is
// ignored; a path that is not a literal is out of scope.
import { textIndex, jsCommentRanges, callSpan } from "../../engine/facts/behaviour-common.mjs";

/** A route call of an application or a router. */
const ROUTE_CALL = /\b(?:app|router)\.(get|post|put|patch|delete|head|options|all|ws)\(/g;
/** The path of a route: its first argument, a literal. */
const LITERAL_PATH = /^["'`]([^"'`]{1,500})["'`]/;
/** A middleware named by its first identifier ("requireAuth", "auth.check"). */
const MIDDLEWARE = /^([A-Za-z_$][\w.$]{0,120})/;

/** The expressions of this adapter (test/tools/redos-worker.mjs, RULES.md S5). */
export const EXPRESS_PATTERNS = Object.freeze({ ROUTE_CALL, LITERAL_PATH, MIDDLEWARE });

/** Splits a call's arguments on top-level commas (depth-aware; strings are not split). Linear. */
function splitArgs(text) {
  const args = [];
  let depth = 0;
  let from = 0;
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) {
      args.push(text.slice(from, i).trim());
      from = i + 1;
    }
  }
  const last = text.slice(from).trim();
  if (last) args.push(last);
  return args;
}

/**
 * The Express routes of one source file: { method, route, file, line, guards }. A call's arguments are read up to
 * the next route call at most, 4,000 characters at most (callSpan): the calls are walked once, and a call the walk
 * cannot close — a handler written inline that is longer, or that holds a regular expression literal such as
 * `/"/g` — gives its path and middleware from what was read, its last argument being the handler.
 */
export function expressRoutes(source, file) {
  const items = [];
  const index = textIndex(source, jsCommentRanges(source));
  const calls = [...source.matchAll(ROUTE_CALL)].filter((m) => !index.inComment(m.index));
  for (const [k, m] of calls.entries()) {
    const open = m.index + m[0].length - 1;
    const next = k + 1 < calls.length ? calls[k + 1].index : source.length;
    const span = callSpan(source, open, Math.min(4000, next - open));
    const args = splitArgs(span.closed ? span.args : source.slice(open + 1, span.end));
    const path = LITERAL_PATH.exec(args[0] || "");
    if (!path) continue;
    const guards = args
      .slice(1, -1)
      .map((a) => MIDDLEWARE.exec(a)?.[1])
      .filter(Boolean);
    items.push({ method: m[1].toUpperCase(), route: path[1], file, line: index.lineOf(m.index), guards });
  }
  return items;
}

export default {
  name: "express",
  files: /\.(js|ts|mjs|cjs)$/,
  marker: /\b(?:app|router)\.(?:get|post|put|patch|delete|head|options|all|ws)\(/,
  api({ sources }) {
    const items = [];
    for (const [file, source] of sources)
      if (!/(^|\/)route\.(ts|js)$/.test(file)) items.push(...expressRoutes(source, file));
    return items;
  },
};
