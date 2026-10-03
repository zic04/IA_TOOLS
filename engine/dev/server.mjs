// Development server of `doc-kit dev`: draft build in memory, served on localhost, rebuilt when a source changes,
// pages reloaded through Server-Sent Events, build errors shown in an overlay of the page.
//   GET /                    the site (last successful build) + the live-reload client (engine/dev/client.js)
//   GET /space/<id>          with spaces (ARCHITECTURE.md §6.1a), the export of that space, with the same client
//   GET /__doc-kit/events    SSE stream: event "build" { id, errors[], warnings } after every build
//   GET /__doc-kit/state     the same state, as JSON (tests, tools)
// Watched: <content>/, <images>/, <diagrams>/, theme/ (recursive) and doc.config.mjs. Nothing is written to disk.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "../build/build.mjs";
import { CONFIG_FILE } from "../project/find.mjs";

const CLIENT = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "client.js"), "utf8");
const EVENTS_PATH = "/__doc-kit/events";
export const STATE_PATH = "/__doc-kit/state";

const escapeHtml = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Inserts the live-reload client before </body> (or at the end). `</script` cannot appear in the JSON. */
export function injectClient(html, settings) {
  const json = JSON.stringify(settings).replace(/</g, "\\u003c");
  const tag = `<script id="doc-kit-dev">window.__DOC_KIT_DEV__=${json};\n${CLIENT}</script>`;
  const i = html.lastIndexOf("</body>");
  return i < 0 ? html + tag : html.slice(0, i) + tag + "\n" + html.slice(i);
}

/** Folders and files that trigger a rebuild, relative to the project, from the configuration. */
export function watchedPaths(config) {
  return {
    // Languages (ARCHITECTURE.md §6.12): paths.translations too, so that editing a translated page rebuilds
    // the draft site, like editing the source.
    folders: [...new Set([config.paths.content, config.paths.images, config.paths.diagrams, "theme", ...(config.languages ? [config.paths.translations] : [])])],
    files: [CONFIG_FILE],
  };
}

/**
 * Starts the server.
 * @param {object} p
 * @param {string} p.root                         documentation project folder
 * @param {() => Promise<object>} p.loadConfig    fresh, validated configuration (throws on error)
 * @param {(problem: object) => { what: string, help?: string }} p.describe   text of a build problem
 * @param {(error: Error) => { what: string, help?: string }} p.describeError  text of a configuration error
 * @param {{ title: string, hint: string, close: string, waiting: string, language: string }} p.texts  overlay texts
 * @param {number} [p.port=0]        0: any free port
 * @param {string} [p.host="127.0.0.1"]
 * @param {number} [p.debounce=150]  ms between the last change and the rebuild
 * @param {(event: object) => void} [p.onEvent]  { type: "build", ok, ms, stats, errors, warnings, changed } | { type: "error", error }
 * @returns {Promise<{ url: string, port: number, state: object, spaces: string[], rebuild: () => Promise<object>, close: () => Promise<void> }>}
 *   spaces: the ids of the exports served at /space/<id> (last successful build)
 */
export async function startDevServer({ root, loadConfig, describe, describeError, texts, port = 0, host = "127.0.0.1", debounce = 150, onEvent = () => {} }) {
  const clients = new Set();
  const watchers = [];
  let html = null; // last successful build
  let spaces = {}; // its exports, by space id
  let buildId = 0;
  let config = null;
  const state = { id: 0, errors: [], warnings: 0, building: false };

  const send = (res, payload) => res.write(`event: build\ndata: ${JSON.stringify(payload)}\n\n`);
  const publicState = () => ({ id: state.id, errors: state.errors, warnings: state.warnings });
  const broadcast = () => {
    for (const res of clients) send(res, publicState());
  };

  async function rebuild(changed = []) {
    const started = Date.now();
    state.building = true;
    let event;
    try {
      config = await loadConfig();
      const r = build({ project: { root }, config, options: { draft: true } });
      const ok = !!r.html && !r.errors.length;
      if (ok) {
        html = r.html;
        spaces = Object.fromEntries(r.sites.map((x) => [x.space, x.html]));
        state.id = ++buildId;
      }
      state.errors = r.errors.map(describe);
      state.warnings = r.warnings.length;
      event = { type: "build", ok, ms: Date.now() - started, stats: r.stats, errors: r.errors, warnings: r.warnings, changed };
    } catch (e) {
      state.errors = [describeError(e)];
      event = { type: "error", ok: false, error: e, changed, ms: Date.now() - started };
    } finally {
      state.building = false;
    }
    // Without a valid configuration yet, the default folders are watched (so that fixing it rebuilds).
    watch(config || { paths: { content: "content", images: "images", diagrams: "diagrams" } });
    broadcast();
    onEvent(event);
    return event;
  }

  // ─── Watching ──────────────────────────────────────────────────────────────
  let timer = null;
  let pending = new Set();
  let running = Promise.resolve();
  const schedule = (file) => {
    pending.add(file);
    clearTimeout(timer);
    timer = setTimeout(() => {
      const changed = [...pending];
      pending = new Set();
      running = running.then(() => rebuild(changed));
    }, debounce);
  };
  let watchedKey = "";
  function watch(cfg) {
    const { folders, files } = watchedPaths(cfg);
    const key = JSON.stringify([folders, files]);
    if (key === watchedKey) return;
    watchedKey = key;
    for (const w of watchers.splice(0)) w.close();
    for (const folder of folders) {
      const dir = path.join(root, folder);
      if (!fs.existsSync(dir)) continue;
      try {
        const w = fs.watch(dir, { recursive: true }, (type, name) => schedule(`${folder}/${String(name || "").split(path.sep).join("/")}`));
        w.on("error", () => {});
        watchers.push(w);
      } catch {
        // a folder that cannot be watched (permissions): ignored
      }
    }
    // The configuration: the folder is watched (editors often replace the file instead of writing it).
    const w = fs.watch(root, (type, name) => {
      if (name && files.includes(String(name))) schedule(String(name));
    });
    w.on("error", () => {});
    watchers.push(w);
  }

  // ─── HTTP ──────────────────────────────────────────────────────────────────
  const settings = () => ({ id: state.id, events: EVENTS_PATH, texts });
  const placeholder = () =>
    `<!doctype html>\n<html lang="${escapeHtml(texts.language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(texts.title)}</title></head><body><p style="font:15px system-ui;margin:40px">${escapeHtml(texts.waiting)}</p></body></html>`;

  const server = http.createServer((req, res) => {
    // DNS rebinding (SECURITY.md): a page of another site whose name resolves to 127.0.0.1 sends its own Host.
    if (!isLocalHost(req.headers.host, server.address().port, host)) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("403");
      return;
    }
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === EVENTS_PATH) {
      res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", Connection: "keep-alive" });
      res.write("retry: 1000\n\n");
      send(res, publicState());
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    if (url.pathname === STATE_PATH) {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      res.end(JSON.stringify(publicState()));
      return;
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(injectClient(html || placeholder(), settings()));
      return;
    }
    const space = /^\/space\/([a-z][a-z0-9-]*)\/?(?:index\.html)?$/.exec(url.pathname);
    if (space && Object.hasOwn(spaces, space[1])) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(injectClient(spaces[space[1]], settings()));
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404");
  });
  const heartbeat = setInterval(() => {
    for (const res of clients) res.write(": ping\n\n");
  }, 15000);
  heartbeat.unref();

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const actual = server.address().port;
  await rebuild([]);

  return {
    url: `http://${host}:${actual}/`,
    port: actual,
    state,
    get spaces() {
      return Object.keys(spaces);
    },
    rebuild: () => (running = running.then(() => rebuild(["(manual)"]))),
    async close() {
      clearTimeout(timer);
      clearInterval(heartbeat);
      for (const w of watchers.splice(0)) w.close();
      for (const res of clients) res.end();
      clients.clear();
      await running.catch(() => {});
      const closed = new Promise((resolve) => server.close(() => resolve()));
      server.closeAllConnections?.();
      await closed;
    },
  };
}

/**
 * Is a request's Host header this local server (localhost, 127.0.0.1, [::1] or the address it listens on, with
 * its port)? Anything else, a missing header included, is refused: protection against DNS rebinding.
 */
export function isLocalHost(header, port, host = "127.0.0.1") {
  if (typeof header !== "string") return false;
  const names = new Set(["localhost", "127.0.0.1", "[::1]", host.includes(":") ? `[${host}]` : host]);
  const m = /^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/.exec(header.trim().toLowerCase());
  return !!m && names.has(m[1]) && Number(m[2]) === port;
}

/** Is a TCP port free on the host? */
export function portFree(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const s = http.createServer();
    s.once("error", () => resolve(false));
    s.listen(port, host, () => s.close(() => resolve(true)));
  });
}
