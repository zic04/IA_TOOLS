// Home-made validator: a subset of JSON Schema, with no dependency.
// Supported keywords:
//   type (string or list: null, boolean, object, array, string, number, integer), enum, const, pattern,
//   required, default (applied when `applyDefaults`), properties, additionalProperties (false | true | schema),
//   items (one schema), minItems, maxItems, minLength, minimum, maximum, anyOf, $ref (local: "#/$defs/x").
// Other keywords ($schema, $id, title, description, examples…) are ignored.
// A property whose value is `undefined` counts as absent (JavaScript files: a helper may pass an optional argument
// through, e.g. `{ css, caption: undefined }`): it is neither checked nor reported, and gets its default.
//
// The validator produces no text: each error is { path, key, vars }, translated by the CLI
// (keys `cli.validate.<key>` and `cli.validate.<key>.help`).

const TYPES = {
  null: (v) => v === null,
  boolean: (v) => typeof v === "boolean",
  object: (v) => v !== null && typeof v === "object" && !Array.isArray(v),
  array: (v) => Array.isArray(v),
  string: (v) => typeof v === "string",
  number: (v) => typeof v === "number" && Number.isFinite(v),
  integer: (v) => Number.isInteger(v),
};

/** JSON type of a value, for messages. */
export function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (Number.isInteger(v)) return "integer";
  if (typeof v === "function") return "function";
  return typeof v;
}

/** Deep copy of JSON-like data; functions and other objects are kept by reference. */
export function clone(v) {
  if (Array.isArray(v)) return v.map(clone);
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype)
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)]));
  return v;
}

/** Edit distance (for "did you mean…" suggestions). */
function editDistance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++)
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = current;
  }
  return previous[b.length];
}

/** The known key closest to an unknown one (distance ≤ 2), or null. */
export function closest(key, known) {
  let best = null;
  let distance = 3;
  for (const k of known) {
    const d = editDistance(key.toLowerCase(), k.toLowerCase());
    if (d < distance) {
      distance = d;
      best = k;
    }
  }
  return best;
}

const join = (path, key) => (typeof key === "number" ? `${path}[${key}]` : path ? `${path}.${key}` : key);

function resolveRef(schema, root) {
  let s = schema;
  let guard = 0;
  while (s && s.$ref) {
    if (!s.$ref.startsWith("#/")) throw new Error(`unsupported $ref: ${s.$ref}`);
    s = s.$ref
      .slice(2)
      .split("/")
      .reduce((o, k) => (o ? o[k] : undefined), root);
    if (!s || ++guard > 20) throw new Error(`$ref not found: ${schema.$ref}`);
  }
  return s;
}

/**
 * Validates `value` against `schema`.
 * @returns {{ value: any, errors: Array<{path: string, key: string, vars: object}> }}
 *   `value` is a copy, completed with the `default` values when `applyDefaults` is true.
 */
export function validate(value, schema, { applyDefaults = false, path = "" } = {}) {
  const errors = [];
  const v = check(clone(value), schema, path, { root: schema, applyDefaults, errors });
  return { value: v, errors };
}

function check(v, rawSchema, path, ctx) {
  const schema = resolveRef(rawSchema, ctx.root);
  if (!schema || schema === true) return v;
  const fail = (key, vars = {}) => ctx.errors.push({ path: path || "(root)", key, vars });

  if (schema.anyOf) {
    for (const option of schema.anyOf) {
      const attempt = { ...ctx, errors: [] };
      const r = check(clone(v), option, path, attempt);
      if (!attempt.errors.length) return r;
    }
    fail("anyOf", { got: typeOf(v) });
    return v;
  }

  if (schema.type) {
    const types = [].concat(schema.type);
    if (!types.some((t) => TYPES[t]?.(v))) {
      fail("type", { expected: types.join(" | "), got: typeOf(v) });
      return v;
    }
  }
  if ("const" in schema && v !== schema.const) fail("enum", { values: JSON.stringify(schema.const), got: JSON.stringify(v) });
  if (schema.enum && !schema.enum.some((x) => x === v))
    fail("enum", { values: schema.enum.map((x) => JSON.stringify(x)).join(", "), got: JSON.stringify(v) });

  if (typeof v === "string") {
    if (schema.minLength != null && v.length < schema.minLength) fail("minLength", { min: schema.minLength });
    if (schema.pattern && !new RegExp(schema.pattern, "u").test(v)) fail("pattern", { pattern: schema.pattern, got: v });
  }
  if (typeof v === "number") {
    if (schema.minimum != null && v < schema.minimum) fail("minimum", { min: schema.minimum, got: v });
    if (schema.maximum != null && v > schema.maximum) fail("maximum", { max: schema.maximum, got: v });
  }

  if (Array.isArray(v)) {
    if (schema.minItems != null && v.length < schema.minItems) fail("minItems", { min: schema.minItems, n: v.length });
    if (schema.maxItems != null && v.length > schema.maxItems) fail("maxItems", { max: schema.maxItems, n: v.length });
    if (schema.items) v = v.map((x, i) => check(x, schema.items, join(path, i), ctx));
  }

  if (TYPES.object(v) && (schema.properties || schema.required || "additionalProperties" in schema)) {
    const props = schema.properties || {};
    if (ctx.applyDefaults)
      for (const [k, s] of Object.entries(props)) {
        if (k in v && v[k] !== undefined) continue;
        // A `default` written next to a $ref wins over the target's.
        const sr = s && "default" in s ? s : resolveRef(s, ctx.root);
        if (sr && "default" in sr) v[k] = clone(sr.default);
      }
    for (const r of schema.required || [])
      if (!(r in v) || v[r] === undefined) ctx.errors.push({ path: join(path, r), key: "required", vars: { key: r } });
    for (const [k, x] of Object.entries(v)) {
      if (x === undefined) continue;
      const p = join(path, k);
      if (k in props) v[k] = check(x, props[k], p, ctx);
      else if (schema.additionalProperties === false) {
        const near = closest(k, Object.keys(props));
        ctx.errors.push({
          path: p,
          key: near ? "unknownClose" : "unknown",
          vars: { key: k, closest: near || "", allowed: Object.keys(props).join(", ") },
        });
      } else if (schema.additionalProperties && typeof schema.additionalProperties === "object")
        v[k] = check(x, schema.additionalProperties, p, ctx);
    }
  }
  return v;
}
