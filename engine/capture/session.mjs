// The sign-in session, and the authentication adapter that reads it (ARCHITECTURE.md §5; adapters are loaded by
// engine/core/adapter-loader.mjs).
//
// Session: Playwright `storageState` (cookies + localStorage) written by `connect` in .doc-kit/session.json (or
// <PREFIX>_SESSION / DOC_KIT_SESSION, relative to the project). It gives access to the application while it is
// valid: a secret, never copied or committed; `connect --forget` deletes it.
import fs from "node:fs";
import path from "node:path";
import { readEnv } from "../project/env.mjs";
import { KitError, EXIT, firstLine } from "../project/errors.mjs";
import { loadAdapter, LOGIN_PATTERN } from "../core/adapter-loader.mjs";
import { launchBrowser } from "../project/browser.mjs";
import { TIMINGS } from "./timings.mjs";

/**
 * Is this URL a sign-in page? True when it leaves the application's origin (identity provider) or when its path
 * and query match `pattern` (case-insensitive).
 */
export function isSignInUrl(url, appUrl, pattern = LOGIN_PATTERN) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.origin !== new URL(appUrl).origin) return true;
  return new RegExp(pattern, "i").test(u.pathname + u.search);
}

/** Authentication adapter of the project (config.auth). */
export const loadAuth = (root, config) => loadAdapter("auth", config.auth, root, "auth");

/** Browser of an authentication adapter: the `browser` option, else the adapter's own. */
export const authBrowser = (auth) => auth.options.browser || auth.adapter.browser || "chromium";

/** Launch options for the adapter's browser (Chrome: the installed Google Chrome, e.g. for bot challenges). */
export const browserLaunch = (auth, options = {}) => ({
  ...options,
  ...(auth && authBrowser(auth) === "chrome" ? { channel: "chrome" } : {}),
});

/** Absolute path of the session file: <PREFIX>_SESSION / DOC_KIT_SESSION, else .doc-kit/session.json. */
export function sessionFile(root, config, env = process.env) {
  const found = readEnv("SESSION", config.env.prefix, env);
  return path.resolve(root, found ? found.value : path.join(".doc-kit", "session.json"));
}

/** A role's name (ARCHITECTURE.md §6.13, `connect --as` / `probe`): letters, digits and dashes, starting with a letter. */
export const ROLE_PATTERN = /^[a-z][a-z0-9-]*$/i;

/**
 * Session file of a role (ARCHITECTURE.md §6.13): always `.doc-kit/session-<role>.json`, regardless of
 * `<PREFIX>_SESSION` / `DOC_KIT_SESSION` — a role session is additional, never the one the other commands read
 * by default.
 */
export function roleSessionFile(root, role) {
  return path.resolve(root, ".doc-kit", `session-${role}.json`);
}

/** Deletes the session file. @returns {boolean} whether there was one */
export function forgetSession(file) {
  if (!fs.existsSync(file)) return false;
  fs.rmSync(file, { force: true });
  return true;
}

/** Writes the session (storageState); a .doc-kit/ folder gets a .gitignore that ignores everything. */
async function saveSession(context, file) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  if (path.basename(dir) === ".doc-kit" && !fs.existsSync(path.join(dir, ".gitignore")))
    fs.writeFileSync(path.join(dir, ".gitignore"), "*\n");
  writePrivateFile(file, JSON.stringify(await context.storageState(), null, 2));
}

/**
 * Writes a secret file (a session) readable by its owner only, from its first byte (SECURITY.md): the text goes to a
 * new file created with mode 0600 next to it, then replaces it in one rename, so that the file is never readable by
 * others, even for a moment, and an older file with wider rights is replaced rather than rewritten in place. Windows
 * ignores the mode: the file takes the rights of its folder there (SECURITY.md says so).
 */
export function writePrivateFile(file, text) {
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  try {
    fs.writeFileSync(temp, text, { mode: 0o600, flag: "wx" });
    fs.renameSync(temp, file);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

/** localStorage of the application's origin in a session file, as an object (empty without a session). */
export function sessionStorageOf(file, origin) {
  if (!file || !fs.existsSync(file)) return {};
  try {
    const state = JSON.parse(fs.readFileSync(file, "utf8"));
    const o = (state.origins || []).find((x) => x.origin === origin);
    return Object.fromEntries((o?.localStorage || []).map(({ name, value }) => [name, value]));
  } catch {
    return {};
  }
}

/** Asks the adapter whether the page is signed in; navigation errors count as "not yet". */
async function readSession(page, auth, appUrl) {
  try {
    return (await auth.adapter.session(page, auth.options, { appUrl, isSignInUrl })) || null;
  } catch {
    return null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NEVER = new Promise(() => {});

/**
 * Opens the application in a browser so that a person signs in, then saves the session.
 * @param {object} p
 * @param {string} p.url                 application URL (without trailing slash)
 * @param {{ adapter, options }} p.auth   loaded authentication adapter
 * @param {string} p.file                session file
 * @param {boolean} [p.headless]         false for people (visible window); true in the tests
 * @param {string} [p.locale]
 * @param {(page) => Promise<void>} p.waitForUser   resolves when the person says they are signed in (Enter);
 *                                       rejects when nobody can answer (no terminal)
 * @param {(event: string) => void} [p.onStatus]   "notYet": the person pressed Enter but is not signed in
 * @param {number} [p.timeout]           how long to wait for the sign-in (ms)
 * @param {number} [p.poll]              interval between two checks of the sign-in (ms)
 * @param {Function} [p.launch]          opens the browser (test seam; default: launchBrowser)
 * @returns {Promise<{ who?, details?, expires?, file: string }>}
 */
export async function connect({
  url,
  auth,
  file,
  headless = false,
  locale,
  waitForUser,
  onStatus = () => {},
  timeout = TIMINGS.signIn,
  poll = TIMINGS.signInPoll,
  launch = launchBrowser,
}) {
  const browser = await launch(browserLaunch(auth, { headless, ...(headless ? {} : { args: ["--start-maximized"] }) }));
  try {
    const context = await browser.newContext({
      viewport: headless ? { width: 1280, height: 800 } : null,
      ...(locale ? { locale } : {}),
    });
    const page = await context.newPage();
    try {
      await page.goto(url + auth.options.start, { waitUntil: "domcontentloaded", timeout: TIMINGS.start });
    } catch (e) {
      throw new KitError(EXIT.ENVIRONMENT, "connect.unreachable", { url, error: firstLine(e) }, { cause: e });
    }
    const deadline = Date.now() + timeout;
    let user = false;
    let failed = false;
    let pending;
    const arm = () => {
      pending = Promise.resolve()
        .then(() => waitForUser(page))
        .then(
          () => (user = true),
          () => {
            failed = true;
            pending = NEVER;
          },
        );
    };
    arm();
    let session = null;
    const open = () => context.pages().filter((p) => !p.isClosed());
    const minutes = Math.round(timeout / 60_000);
    while (!session) {
      if (Date.now() > deadline) throw new KitError(EXIT.ENVIRONMENT, "connect.timeout", { minutes, n: minutes });
      if (!browser.isConnected() || !open().length) throw new KitError(EXIT.ENVIRONMENT, "connect.closed");
      await Promise.race([pending, sleep(poll)]);
      if (failed && !auth.adapter.detects) throw new KitError(EXIT.USAGE, "connect.noTerminal");
      if (!user && !auth.adapter.detects) continue;
      // The person may have signed in in another tab: any open tab of the window will do.
      for (const p of open()) if ((session = await readSession(p, auth, url))) break;
      if (!session && user) {
        onStatus("notYet");
        user = false;
        arm();
      }
    }
    await saveSession(context, file);
    return { ...session, file };
  } finally {
    await browser.close().catch(() => {});
  }
}

/**
 * Renews a short-lived session before a capture run (capture.sessionRefresh, ARCHITECTURE.md §6.3a): the only
 * request of a run that is not GET/HEAD/OPTIONS, sent once, outside any page, from a context that loads the
 * session; the cookies it sets are written back to the session file. Nothing else is sent.
 * @param {{ file: string, appUrl: string, refresh: { method?: string, path: string, json?: any }, launch?: Function }} p
 * @returns {Promise<{ ok: boolean, status: number|null, error?: string }>}
 */
export async function refreshSession({ file, appUrl, refresh, launch = launchBrowser }) {
  const browser = await launch({ headless: true });
  try {
    const context = await browser.newContext({ storageState: file });
    let response;
    try {
      response = await context.request.fetch(appUrl + refresh.path, {
        method: refresh.method || "POST",
        ...(refresh.json ? { data: refresh.json } : {}), // sent as JSON (Content-Type: application/json)
        failOnStatusCode: false,
        maxRedirects: 0,
        timeout: TIMINGS.start,
      });
    } catch (e) {
      return { ok: false, status: null, error: firstLine(e) };
    }
    if (!response.ok()) return { ok: false, status: response.status() };
    await saveSession(context, file);
    return { ok: true, status: response.status() };
  } finally {
    await browser.close();
  }
}

/**
 * Checks a session before a capture run: opens the start page (in a context that already loads the session),
 * then asks the adapter. A 401 answer or a sign-in page means the session has expired.
 * @returns {Promise<object|null>} the adapter's answer, null when expired
 * @throws {KitError} exit code 3 when the application cannot be reached
 */
export async function checkSession(page, { url, auth }) {
  let response;
  try {
    response = await page.goto(url + auth.options.start, { waitUntil: "load", timeout: TIMINGS.start });
  } catch (e) {
    throw new KitError(EXIT.ENVIRONMENT, "capture.unreachable", { url, error: firstLine(e) }, { cause: e });
  }
  await page.waitForLoadState("networkidle", { timeout: TIMINGS.sessionIdle }).catch(() => {});
  if (response && response.status() === 401) return null;
  return readSession(page, auth, url);
}
