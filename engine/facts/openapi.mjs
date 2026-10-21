// Behaviour signals of the OpenAPI documents of the application (ARCHITECTURE.md §6.9, source `behaviours`):
// openapi.json, swagger.json or *.openapi.json found in its folder. For each operation: its query parameters (their
// role from their name — page, sort, q… — their values, bounds and defaults) and the properties of its request body
// (required, bounds, pattern, format, values). JSON only: a YAML document is left unread and listed as such (the
// kit's YAML reader, engine/core/yaml.mjs, serves the infrastructure files only). A local $ref (#/components/schemas/X) is followed three levels deep at most; one longer
// than MAX_REF or of more than MAX_KEYS keys is not, and each is resolved once per document. A document is read for
// MAX_STEPS parameters and properties at most, whether they give a signal or not: a crafted document (thousands of
// parameters pointing to one long $ref, routes written with escaped slashes) costs a bounded time.
import { paramSignal } from "./behaviour-common.mjs";

/** An OpenAPI document of the application, by its name. */
export const OPENAPI_FILE = /(^|\/)(?:openapi|swagger)(?:\.[\w-]{1,40})?\.json$|\.openapi\.json$/i;
/** The same, written in YAML (left unread). */
export const OPENAPI_YAML = /(^|\/)(?:openapi|swagger)(?:\.[\w-]{1,40})?\.ya?ml$|\.openapi\.ya?ml$/i;

const METHODS = ["get", "post", "put", "patch", "delete"];
const MAX_REF = 512;
const MAX_KEYS = 16;
const MAX_STEPS = 20_000;
/** A route not found as written (escaped slashes, "\/orders") this many times: the next ones are not looked for. */
const MAX_MISSES = 8;

/**
 * The resolver of one document: a local $ref resolved in `doc` ("#/components/schemas/Order"), or the schema itself;
 * own keys only, each $ref once.
 */
function resolverOf(doc) {
  const cache = new Map();
  const follow = (schema, depth) => {
    if (!schema || typeof schema !== "object") return null;
    const ref = schema.$ref;
    if (typeof ref !== "string" || depth >= 3) return schema;
    if (!ref.startsWith("#/") || ref.length > MAX_REF) return null;
    const keys = ref.slice(2).split("/");
    if (keys.length > MAX_KEYS) return null;
    let node = doc;
    for (const key of keys) {
      const k = key.replaceAll("~1", "/").replaceAll("~0", "~");
      node = node && typeof node === "object" && Object.hasOwn(node, k) ? node[k] : undefined;
    }
    return follow(node, depth + 1);
  };
  return (schema) => {
    const ref = schema && typeof schema === "object" ? schema.$ref : undefined;
    if (typeof ref !== "string") return follow(schema, 0);
    if (!cache.has(ref)) cache.set(ref, follow(schema, 0));
    return cache.get(ref);
  };
}

/** The checks of a schema (a parameter's or a property's), pushed as validation and values signals. */
function schemaSignals(schema, field, push, at, route) {
  if (!schema) return;
  const via = "openapi";
  if (Array.isArray(schema.enum))
    push({ family: "values", signal: "enum", field, values: schema.enum.slice(0, 100), via, route }, at);
  for (const [key, signal] of [
    ["minLength", "min"],
    ["maxLength", "max"],
    ["minimum", "min"],
    ["maximum", "max"],
  ])
    if (typeof schema[key] === "number")
      push({ family: "validation", signal, field, value: schema[key], via, route }, at);
  if (typeof schema.pattern === "string") push({ family: "validation", signal: "pattern", field, via, route }, at);
  if (schema.format === "email" || schema.format === "uri")
    push({ family: "validation", signal: schema.format === "uri" ? "url" : "email", field, via, route }, at);
  if (schema.default !== undefined && typeof schema.default !== "object")
    push({ family: "validation", signal: "default", field, value: schema.default, via, route }, at);
}

/**
 * Every behaviour signal of one OpenAPI document (already parsed), pushed into `push(signal, index)`; the index is
 * that of the path in the text — found by a cursor that only moves forward, so that the text is walked once —, so
 * that each signal gets the line of its operation.
 * @param {any} doc
 * @param {string} text   the document as read
 * @param {{ push: (s: object, index: number) => void, full: boolean }} sink   it stops the walk once full
 */
export function openapiBehaviours(doc, text, sink) {
  const paths = doc?.paths && typeof doc.paths === "object" && !Array.isArray(doc.paths) ? doc.paths : {};
  const read = { resolved: resolverOf(doc), steps: MAX_STEPS, sink, required: new WeakMap() };
  let at = 0;
  let misses = 0;
  for (const [route, item] of Object.entries(paths)) {
    if (!item || typeof item !== "object") continue;
    if (misses < MAX_MISSES) {
      const found = text.indexOf(JSON.stringify(route), at);
      if (found === -1) misses++;
      else at = found;
    }
    for (const method of METHODS) {
      if (sink.full || read.steps <= 0) return;
      const op = item[method];
      if (op && typeof op === "object") operationSignals(read, item, op, `${method.toUpperCase()} ${route}`, at);
    }
  }
}

/**
 * The signals of one operation: its query parameters (the path's and its own), the properties of its JSON body —
 * each one read a step of `read.steps`.
 * @param {{ resolved: (schema: any) => any, steps: number, sink: { push: Function, full: boolean },
 *   required: WeakMap<object, Set<string>> }} read
 */
function operationSignals(read, item, op, operation, at) {
  const { resolved, sink } = read;
  const push = sink.push;
  for (const list of [item.parameters, op.parameters]) {
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      if (sink.full || read.steps-- <= 0) return;
      const p = resolved(raw);
      if (!p || p.in !== "query" || typeof p.name !== "string") continue;
      const { family, signal } = paramSignal(p.name);
      const schema = resolved(p.schema) || p;
      push({ family, signal, field: p.name, value: schema.default, via: "openapi", route: operation }, at);
      schemaSignals(schema, p.name, push, at, operation);
    }
  }
  const body = resolved(resolved(op.requestBody)?.content?.["application/json"]?.schema);
  const properties = body?.properties && typeof body.properties === "object" ? body.properties : {};
  const required = requiredOf(read, body);
  for (const name in properties) {
    if (!Object.hasOwn(properties, name)) continue;
    if (sink.full || read.steps-- <= 0) return;
    const signal = required.has(name) ? "required" : "optional";
    push({ family: "validation", signal, field: name, via: "openapi", route: operation }, at);
    schemaSignals(resolved(properties[name]), name, push, at, operation);
  }
}

/** The required names of a body, once per body: operations share one through a $ref, its list may be long. */
function requiredOf(read, body) {
  if (!body || !Array.isArray(body.required)) return new Set();
  let names = read.required.get(body);
  if (!names) read.required.set(body, (names = new Set(body.required)));
  return names;
}
