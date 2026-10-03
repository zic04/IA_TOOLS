#!/usr/bin/env node
// Acme Orders, VERSION 2 (examples/demo-app-v2; demo-docs is written against examples/demo-app, unchanged).
// Fixture of the update cycle (doc-kit sync, ARCHITECTURE.md §6.10): a renamed label ("Approval chain" →
// "Approvals", category `labels`), a modified screen (Settings gains "Notifications", category `captures`),
// an added route (GET /invoices, category `new`) — same line numbers below as demo-app on purpose, so that
// demo-docs' `file:line` proofs still resolve, unmoved, when read against this file instead.
//   node serve.mjs [--port 4173]     then open http://127.0.0.1:4173 and sign in with any e-mail and password
// API: /api/me, /api/auth/session, /api/orders[/<id>], /api/profile, /api/presence, /api/settings, /reset.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SEED = JSON.parse(fs.readFileSync(path.join(DIR, "data.json"), "utf8"));
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };
const PAGES = [[/^\/orders$/, "orders.html"], [/^\/orders\/\d+$/, "order.html"], [/^\/orders\/\d+\/approval$/, "approval.html"], [/^\/settings$/, "settings.html"], [/^\/invoices$/, "invoices.html"]];

export function serve({ port = 4173, host = "127.0.0.1" } = {}) {
  const sessions = new Map();
  const state = { data: structuredClone(SEED), writes: [] };
  const server = http.createServer(async (req, res) => {
    const p = new URL(req.url, "http://demo").pathname;
    const cookie = /(?:^|;\s*)acme_session=(\w+)/.exec(req.headers.cookie || "")?.[1];
    const user = sessions.get(cookie);
    const send = (code, body = "", type = "application/json", headers = {}) => {
      res.writeHead(code, { "content-type": type, "cache-control": "no-store", ...headers });
      res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
    };
    const file = (f) => send(200, fs.readFileSync(path.join(DIR, "public", f)), TYPES[path.extname(f)]);
    const body = req.method === "POST" ? await new Promise((r) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => r(b)); }) : "";
    if (req.method === "POST" && p === "/login") {
      const form = new URLSearchParams(body);
      const token = randomBytes(16).toString("hex");
      sessions.set(token, { id: "u-1", name: state.data.profile.name, email: form.get("email") || state.data.profile.email });
      const next = /^\/[\w/-]*$/.test(form.get("next") || "") ? form.get("next") : "/orders";
      return send(302, "", "text/plain", { location: next, "set-cookie": `acme_session=${token}; Path=/; HttpOnly; SameSite=Lax` });
    }
    if (req.method === "POST" && p === "/api/demo/reset") return (state.data = structuredClone(SEED)), send(200, { ok: true });
    if (p === "/login") return file("login.html");
    if (p === "/logout") return sessions.delete(cookie), send(302, "", "text/plain", { location: "/login" });
    if (p === "/style.css" || p === "/app.js") return file(p.slice(1));
    if (p === "/") return send(302, "", "text/plain", { location: "/orders" });
    if (p === "/api/auth/session") return send(200, user ? { user: { name: user.name, email: user.email, role: "admin" }, expires: new Date(Date.now() + 864e5).toISOString() } : {});
    if (!user) return p.startsWith("/api/") ? send(401, { error: "unauthorized" }) : send(302, "", "text/plain", { location: `/login?next=${encodeURIComponent(p)}` });
    if (req.method === "POST") {
      state.writes.push(`POST ${p}`);
      if (p === "/api/settings") Object.assign(state.data.profile, JSON.parse(body || "{}"));
      return send(204);
    }
    if (p === "/api/me") return send(200, user);
    if (p === "/api/profile") return send(200, state.data.profile);
    if (p === "/api/orders") return send(200, state.data.orders);
    const order = /^\/api\/orders\/(\d+)$/.exec(p);
    if (order) return send(200, state.data.orders.find((o) => o.id === Number(order[1])) || null);
    const page = PAGES.find(([re]) => re.test(p));
    if (!page) return send(404, "Not found", "text/plain");
    if (page[1] === "approval.html") state.writes.push(`approval chain created for order ${p.split("/")[2]}`);
    return file(page[1]);
  });
  return new Promise((resolve) =>
    server.listen(port, host, () => resolve({ server, state, url: `http://${host}:${server.address().port}`, close: () => new Promise((r) => server.close(r)) }))
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf("--port");
  const { url } = await serve({ port: Number(i > 0 ? process.argv[i + 1] : process.env.PORT || 4173) });
  console.log(`Acme Orders (demo, version 2) on ${url} — sign in with any e-mail and password. Ctrl+C to stop.`);
}
