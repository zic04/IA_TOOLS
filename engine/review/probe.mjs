// `doc-kit probe` (ARCHITECTURE.md §6.13): checks a running LOCAL or DEMO instance, GET and HEAD only, never more
// than `maxPerSecond` requests, never a response body stored. Security headers, cookies, CORS and version
// disclosure on "/" and on one API route; the access control of every GET route of facts/api.json, against its
// `auth` (ARCHITECTURE.md §6.9/§6.13: "none" | "user" | "role" | "unknown"), for anonymous and every `--as <role>`.
import { LOGIN_PATTERN } from "../capture/session.mjs";

const SECURITY_HEADERS = Object.freeze([
  "content-security-policy",
  "strict-transport-security",
  "x-content-type-options",
  "x-frame-options",
  "referrer-policy",
  "permissions-policy",
]);
const ALLOWED_METHODS = new Set(["GET", "HEAD"]);

/** A loopback host: localhost, *.localhost, 127.x, [::1] (ARCHITECTURE.md §6.13). */
export function isLoopbackUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return host === "localhost" || host.endsWith(".localhost") || /^127(\.\d{1,3}){3}$/.test(host) || host === "::1";
}

/**
 * Is `probe` allowed on this configuration (ARCHITECTURE.md §6.13)? Refused with capture.target "production", or
 * when the application URL is not a loopback address and capture.target is not "demo". No option overrides it.
 */
export function probeAllowed(config) {
  if (config.capture.target === "production") return false;
  if (config.capture.target === "demo") return true;
  return isLoopbackUrl(config.app.url || "");
}

/** `Cookie:` header value from a Playwright storageState, for the cookies that apply to `url` and are not expired. */
export function cookieHeaderFromStorageState(state, url) {
  if (!state?.cookies?.length) return "";
  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return "";
  }
  const now = Date.now() / 1000;
  const matches = state.cookies.filter((c) => {
    if (c.expires && c.expires > 0 && c.expires < now) return false;
    const domain = String(c.domain || "").replace(/^\./, "");
    return domain === hostname || hostname.endsWith(`.${domain}`);
  });
  return matches.map((c) => `${c.name}=${c.value}`).join("; ");
}

/** Path parameter names of a route: `{name}`, `:name`, `[name]`, `[...name]`. */
export function routeParams(route) {
  const names = new Set();
  for (const m of route.matchAll(/\{(\w+)\}|:(\w+)|\[(?:\.\.\.)?(\w+)\]/g)) names.add(m[1] || m[2] || m[3]);
  return [...names];
}

/** `route` with every parameter replaced by its example value of `params` (caller checks none is missing). */
export function fillRoute(route, params) {
  return route
    .replace(/\{(\w+)\}/g, (_, n) => params[n])
    .replace(/:(\w+)/g, (_, n) => params[n])
    .replace(/\[\.\.\.(\w+)\]/g, (_, n) => params[n])
    .replace(/\[(\w+)\]/g, (_, n) => params[n]);
}

/** `{ name, secure, httpOnly, sameSite }` of one `Set-Cookie` header value (never its value). */
export function parseSetCookie(raw) {
  const parts = String(raw)
    .split(";")
    .map((p) => p.trim());
  const eq = parts[0].indexOf("=");
  const name = eq >= 0 ? parts[0].slice(0, eq) : parts[0];
  const lower = parts.slice(1).map((p) => p.toLowerCase());
  const sameSite = parts.slice(1).find((p) => /^samesite=/i.test(p));
  return {
    name,
    secure: lower.includes("secure"),
    httpOnly: lower.includes("httponly"),
    sameSite: sameSite ? sameSite.split("=")[1] : null,
  };
}

/** Every `Set-Cookie` value of a response (Node ≥ 20's `getSetCookie()`, else the single combined header). */
function setCookiesOf(res) {
  if (typeof res.headers.getSetCookie === "function") return res.headers.getSetCookie();
  const raw = res.headers.get("set-cookie");
  return raw ? [raw] : [];
}

/** `{ <header>: value|null }` of the security headers of a response (ARCHITECTURE.md §6.13). */
function headerSnapshot(res) {
  const out = {};
  for (const h of SECURITY_HEADERS) out[h] = res.headers.get(h) || null;
  return out;
}

/**
 * A paced caller: never more than `maxPerSecond` calls, spaced evenly. `now`/`sleep` are test seams (a virtual
 * clock), so the tests measure the pacing without a real delay.
 */
export function createThrottle(
  maxPerSecond = 4,
  { now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {},
) {
  const minInterval = 1000 / maxPerSecond;
  let last = -Infinity;
  return async function throttle() {
    const elapsed = now() - last;
    if (elapsed < minInterval) await sleep(minInterval - elapsed);
    last = now();
  };
}

/**
 * One request, GET or HEAD only (ARCHITECTURE.md §6.13 — a safety rule, never relaxed), manual redirects (so a
 * 3xx is observable), a timeout, and the response is never read into a stored value by this function.
 * @throws {Error} an unsupported method, or whatever `fetchImpl` throws (network error, abort)
 */
export async function probeFetch(fetchImpl, url, { method = "GET", headers = {} } = {}, timeoutMs = 5000) {
  if (!ALLOWED_METHODS.has(method)) throw new Error(`probe: method not allowed: ${method}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { method, headers, redirect: "manual", signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Does an anonymous response count as "protected" (401, 403, or a redirection to a sign-in page)? */
export function isProtectedResponse(status, location, baseUrl) {
  if (status === 401 || status === 403) return true;
  if (status >= 300 && status < 400 && location) {
    try {
      const target = new URL(location, baseUrl);
      return (
        target.origin !== new URL(baseUrl).origin ||
        new RegExp(LOGIN_PATTERN, "i").test(target.pathname + target.search)
      );
    } catch {
      return false;
    }
  }
  return false;
}

/** A 2xx JSON array of objects holding an `email` field (ARCHITECTURE.md §6.13 `probe.publicData`, a heuristic). */
async function looksLikePublicData(res) {
  if (res.status < 200 || res.status >= 300) return false;
  let data;
  try {
    data = await res.json();
  } catch {
    return false;
  }
  return Array.isArray(data) && data.length > 0 && data.every((x) => x && typeof x === "object" && "email" in x);
}

/** The first GET route whose parameters are all given in `params`, filled — or null (none found). */
function sampleApiPath(getRoutes, params) {
  for (const item of getRoutes) {
    const needed = routeParams(item.route);
    if (needed.every((n) => n in params)) return fillRoute(item.route, params);
  }
  return null;
}

/** Thrown when the first request (to "/") cannot reach the instance at all: the CLI turns this into exit code 3. */
export class ProbeUnreachableError extends Error {}

/**
 * Runs the probe (ARCHITECTURE.md §6.13).
 * @param {object} p
 * @param {string} p.url                      application URL, no trailing slash
 * @param {string[]} [p.roles]                `--as` roles, besides anonymous
 * @param {(role: string) => object|null} [p.sessionOf]   storageState of a role's session file, or null
 * @param {Array<{method,route,auth}>} [p.apiItems]       facts/api.json items
 * @param {object} [p.params]                 review.params: path parameter name → example value
 * @param {(url: string, init?: object) => Promise<Response>} [p.fetch]
 * @param {number} [p.maxPerSecond]
 * @param {number} [p.timeoutMs]
 * @param {() => number} [p.now]              rate limiter test seam
 * @param {(ms: number) => Promise<void>} [p.sleep]   rate limiter test seam
 * @returns {Promise<object>} facts/probe.json (ARCHITECTURE.md §6.13)
 * @throws {ProbeUnreachableError} the instance cannot be reached at all
 */
export async function runProbe({
  url,
  roles = [],
  sessionOf = () => null,
  apiItems = [],
  params = {},
  fetch: fetchImpl = fetch,
  maxPerSecond = 4,
  timeoutMs = 5000,
  now,
  sleep,
}) {
  const throttle = createThrottle(maxPerSecond, { now, sleep });
  const identities = [
    { name: "anonymous", cookie: "" },
    ...roles.map((r) => ({ name: r, cookie: cookieHeaderFromStorageState(sessionOf(r), url) })),
  ];

  async function get(target, identity) {
    await throttle();
    return probeFetch(
      fetchImpl,
      url + target,
      { method: "GET", headers: identity.cookie ? { Cookie: identity.cookie } : {} },
      timeoutMs,
    );
  }

  const getRoutes = apiItems.filter((i) => i.method === "GET");
  const sample = sampleApiPath(getRoutes, params);
  const targets = sample ? ["/", sample] : ["/"];

  const headers = {};
  const cookies = {};
  const cors = {};
  const disclosure = {};
  for (const target of targets) {
    let res;
    try {
      res = await get(target, identities[0]);
    } catch (e) {
      if (target === "/") throw new ProbeUnreachableError(e.message);
      continue; // the sample API route is best-effort: a failure here never aborts the run
    }
    headers[target] = headerSnapshot(res);
    cookies[target] = setCookiesOf(res).map(parseSetCookie);
    disclosure[target] = {
      server: res.headers.get("server") || null,
      poweredBy: res.headers.get("x-powered-by") || null,
    };
    try {
      await throttle();
      const corsRes = await probeFetch(
        fetchImpl,
        url + target,
        { method: "GET", headers: { Origin: "https://probe.invalid" } },
        timeoutMs,
      );
      cors[target] = {
        allowOrigin: corsRes.headers.get("access-control-allow-origin") || null,
        allowCredentials: corsRes.headers.get("access-control-allow-credentials") || null,
      };
    } catch {
      cors[target] = null;
    }
  }

  const routes = [];
  const skipped = [];
  for (const item of getRoutes) {
    const needed = routeParams(item.route);
    const missing = needed.filter((n) => !(n in params));
    if (missing.length) {
      skipped.push({ method: item.method, route: item.route, params: missing });
      continue;
    }
    const target = fillRoute(item.route, params);
    const status = {};
    let anonLocation = null;
    let publicData = false;
    let failed = false;
    for (const identity of identities) {
      try {
        const res = await get(target, identity);
        status[identity.name] = res.status;
        if (identity.name === "anonymous") {
          anonLocation = res.headers.get("location");
          if (item.auth === "none") publicData = await looksLikePublicData(res);
        }
      } catch {
        status[identity.name] = null;
        failed = true;
      }
    }
    const expected = item.auth === "user" || item.auth === "role" ? "protected" : "open";
    let finding;
    if (!failed) {
      if (expected === "protected" && !isProtectedResponse(status.anonymous, anonLocation, url))
        finding = "probe.unprotected";
      else if (item.auth === "none" && publicData) finding = "probe.publicData";
    }
    routes.push({
      method: item.method,
      route: item.route,
      auth: item.auth,
      expected,
      status,
      ...(finding ? { finding } : {}),
    });
  }

  return {
    url,
    date: new Date().toISOString(),
    identities: identities.map((i) => i.name),
    headers,
    cookies,
    cors,
    disclosure,
    routes,
    skipped,
  };
}
