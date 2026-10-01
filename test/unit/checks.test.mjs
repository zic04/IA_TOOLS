// Checks and commands of batch L2 without a browser: check coverage | images | secrets, inventory, and the
// command paths that stop before any browser opens (connect --forget, connect without URL or sign-in, capture
// without session, forbidden routes, unknown patterns, demo).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runCli } from "../../cli/doc-kit.mjs";
import { checkImages, embeddedCaptures } from "../../engine/check/images.mjs";
import { scanText, detectors, redact, isStorageState, isLocalAddress, isUrlTemplate, ignoreRules } from "../../engine/check/secrets.mjs";
import { DEMO, demoCopy } from "../tools/helpers.mjs";

async function cli(args, env = {}) {
  let out = "";
  let err = "";
  const code = await runCli(args, { stdout: { write: (s) => (out += s) }, stderr: { write: (s) => (err += s) }, env: { ...env } });
  return { code, out, err };
}

/** Copy of the demo project with a modified configuration (written as JSON). */
async function project(modify = (c) => c) {
  const dir = demoCopy();
  // The demo's own plans import "doc-kit/targets", which a copy outside the kit cannot resolve.
  fs.rmSync(path.join(dir, "captures", "plans"), { recursive: true, force: true });
  const raw = structuredClone((await import(pathToFileURL(path.join(DEMO, "doc.config.mjs")).href)).default);
  // Neutral base: the demo is configured to run against the demo app (URL, sign-in, setup script, forbidden route);
  // each test declares only what it checks, and never reaches a real server by accident.
  delete raw.app;
  delete raw.auth;
  delete raw.capture;
  fs.writeFileSync(path.join(dir, "doc.config.mjs"), `export default ${JSON.stringify(modify(raw), null, 2)};\n`);
  return dir;
}
const write = (dir, rel, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text);
};
const rm = (dir) => fs.rmSync(dir, { recursive: true, force: true });

describe("check coverage and inventory", () => {
  test("per family n/N and the missing items, exit code 1; inventory lists what the adapters see", async () => {
    const dir = await project((c) => ({ ...c, coverage: [{ adapter: "next-app-router", app: "app" }, { adapter: "glob", family: "Specs", base: "specs", pattern: "*.md" }, { adapter: "react-router", file: "nope.tsx" }] }));
    try {
      for (const p of ["app/orders/page.tsx", "app/settings/page.tsx", "app/(admin)/audit/page.tsx", "app/orders/[id]/page.tsx"]) write(dir, p, "x");
      write(dir, "specs/refunds.md", "x");
      const r = await cli(["check", "coverage", "--project", dir]);
      assert.equal(r.code, 1);
      // /orders and /settings are in toc.json (routes); /orders/[id] is covered by its static prefix "/orders/",
      // cited by the link #/use/orders/detail: the rule of the original engine, tolerant by design.
      assert.match(r.out, /✖ Routes: 3\/4\n {4}missing: \/audit\n✖/);
      assert.match(r.out, /✖ Specs: 0\/1\n {4}missing: refunds\.md\n/);
      assert.match(r.out, /⚠ react-router: check skipped \(not found: nope\.tsx\)/);
      assert.match(r.out, /3\/5 elements covered\.\n$/);
      assert.match(r.err, /→ cite each missing element/);

      fs.appendFileSync(path.join(dir, "content/use/settings.md"), "\nAudit: [[route /audit]]; one order: /orders/:id; refunds.\n");
      const ok = await cli(["check", "coverage", "--project", dir]);
      assert.equal(ok.code, 0, ok.out + ok.err);
      assert.match(ok.out, /✔ Routes: 4\/4/);

      const inv = await cli(["inventory", "--project", dir, "--json"]);
      assert.equal(inv.code, 0);
      const j = JSON.parse(inv.out);
      assert.deepEqual(j.adapters.map((a) => [a.adapter, a.available]), [["next-app-router", true], ["glob", true], ["react-router", false]]);
      assert.deepEqual(j.adapters[0].families[0].items.map((i) => i.id), ["/audit", "/orders", "/orders/[id]", "/settings"]);
      const text = await cli(["inventory", "--project", dir, "--lang", "fr"]);
      assert.match(text.out, /next-app-router › Routes : 4 éléments, 4 déjà cité\(s\)\n {2}✔ \/audit\n/);
    } finally {
      rm(dir);
    }
  });

  test("no adapter: check coverage and inventory → exit code 2; check all skips it", async () => {
    const r = await cli(["check", "coverage", "--project", DEMO]);
    assert.equal(r.code, 2);
    assert.match(r.err, /✖ no coverage adapter configured\n {2}→ add for example coverage:/);
    assert.equal((await cli(["inventory", "--project", DEMO])).code, 2);
  });
});

describe("check images", () => {
  test("the demo passes", async () => {
    const r = await cli(["check", "images", "--project", DEMO]);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /^2 images checked \(2 cited\) — 0 error\(s\), 0 warning\(s\)\.\n$/);
  });

  test("orphan image, zone file without image, missing capture, heavy image, outdated capture", async () => {
    const dir = await project();
    try {
      const img = path.join(dir, "images");
      fs.copyFileSync(path.join(img, "orders-list.webp"), path.join(img, "unused.webp"));
      write(dir, "images/zones/gone.json", JSON.stringify({ file: "gone.webp", width: 10, height: 10, zones: [] }));
      const z = JSON.parse(fs.readFileSync(path.join(img, "zones/orders-list.json"), "utf8"));
      fs.writeFileSync(path.join(img, "zones/orders-list.json"), JSON.stringify({ ...z, version: "1.3.0" }));
      fs.appendFileSync(path.join(dir, "content/use/orders/detail.md"), '\n::capture{id="nowhere" title="x"}\n');
      const r = await cli(["check", "images", "--project", dir, "--threshold", "0.001"]);
      assert.equal(r.code, 1);
      assert.match(r.err, /✖ orphan image, cited by no page: images\/unused\.webp\n {2}→ cite it/);
      assert.match(r.err, /✖ zone file without its image: images\/zones\/gone\.json \(expects images\/gone\.webp\)/);
      assert.match(r.err, /✖ \[use\/orders\/detail\] screenshot not found: “nowhere”/);
      assert.match(r.err, /⚠ heavy image: images\/orders-list\.webp \(\d+ KB, threshold 0\.001 KB\)/);
      assert.match(r.err, /⚠ images\/zones\/orders-list\.json: captured on version 1\.3\.0, the application is at version 1\.4\.0/);
      assert.match(r.err, /3 images checked \(2 cited\) — 3 error\(s\), 4 warning\(s\)\./);
      assert.equal((await cli(["check", "images", "--project", dir, "--threshold", "0"])).code, 2);
    } finally {
      rm(dir);
    }
  });

  test("embedded captures are read from the image blocks only", () => {
    assert.deepEqual([...embeddedCaptures('<script type="text/plain" id="img-a&amp;b">data:x</script> id="img-ID"> <script type="text/plain" id="img-ID"> (comment)')], ["a&b"]);
    const r = checkImages({ root: DEMO, config: { paths: { images: "images" } }, html: "", warnings: [], version: "1.4.0" });
    assert.equal(r.errors.filter((e) => e.key === "check.images.orphan").length, 2);
  });
});

describe("check secrets", () => {
  test("the demo passes", async () => {
    const r = await cli(["check", "secrets", "--project", DEMO]);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /^✔ No secret found \(\d+ source files, \d+ places of the site\)\.\n$/);
  });

  test(".env values, GUIDs, patterns, tokens in the sources and the site; the value itself is never printed", async () => {
    const dir = await project((c) => ({ ...c, masking: { env: ["app.env"], patterns: ["ACME-\\d{6}"] } }));
    try {
      write(dir, "app.env", "API_URL=https://orders.internal.example/api\nPORT=3000\n");
      fs.appendFileSync(path.join(dir, "content/use/settings.md"), "\nThe API is https://orders.internal.example/api; tenant 7d3c5a1e-9b2f-4c6d-8e1a-2f3b4c5d6e7f; nil 00000000-0000-0000-0000-000000000000.\n");
      fs.appendFileSync(path.join(dir, "content/use/orders.md"), "\nLicence ACME-123456. api_key: abcdefghijklmnop1234\n");
      const r = await cli(["check", "secrets", "--project", dir]);
      assert.equal(r.code, 1);
      assert.match(r.err, /✖ content\/use\/settings\.md:\d+: value of API_URL \(app\.env\) \(http… \(35\)\)/);
      assert.match(r.err, /✖ content\/use\/settings\.md:\d+: GUID/);
      assert.match(r.err, /✖ site › use\/settings: value of API_URL/);
      assert.match(r.err, /✖ content\/use\/orders\.md:\d+: masking pattern no\. 1/);
      assert.match(r.err, /value of a key, token or password/);
      assert.doesNotMatch(r.err + r.out, /orders\.internal\.example|7d3c5a1e-9b2f|ACME-123456|abcdefghijklmnop/);
      assert.doesNotMatch(r.err, /00000000/);
      assert.match(r.err, /secrets found\.\n$/);
    } finally {
      rm(dir);
    }
  });

  test("not secrets: local addresses, URL templates, masking.exclude, masking.allow; GUIDs, credentials and real values stay reported", async () => {
    // A fictional public browser key, built at run time (key-shaped strings are kept out of the sources).
    const publicKey = ["AI", "za", "SyDemoPublicMapKey".padEnd(35, "0")].join("");
    const dir = await project((c) => ({
      ...c,
      masking: { env: ["app.env"], exclude: "^ACME-0+$", patterns: ["ACME-\\d{6}"], allow: [`^${publicKey}$`, "^7d3c5a1e-9b2f-4c6d-8e1a-2f3b4c5d6e7f$"] },
    }));
    try {
      write(dir, "app.env", "API_HOST=0.0.0.0\nDB_HOST=192.168.10.20:5432\nCACHE_URL=http://[::1]:6379\nTILES_URL=https://tiles.example.org/{z}/{x}/{y}.png?key=pk.demo42\nAPI_URL=https://orders.internal.example/api\n");
      fs.appendFileSync(
        path.join(dir, "content/use/settings.md"),
        [
          "",
          "| Variable | Default |",
          "|---|---|",
          "| `API_HOST` | `0.0.0.0` |",
          "| `DB_HOST` | `192.168.10.20:5432` |",
          "| `CACHE_URL` | `http://[::1]:6379` |",
          "",
          "Tiles: `https://tiles.example.org/{z}/{x}/{y}.png?key=pk.demo42`, or `https://maps.example.org/{z}/{x}/{y}.png?key=" + publicKey + "`.",
          `Public map key, documented by its provider: ${publicKey}. Public tenant: 7d3c5a1e-9b2f-4c6d-8e1a-2f3b4c5d6e7f.`,
          "Licences ACME-000000 (none) and ACME-123456. Other tenant 1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d.",
          "API: https://orders.internal.example/api. Database: postgres://app:pa55word@10.0.0.5/orders.",
          "",
        ].join("\n")
      );
      const r = await cli(["check", "secrets", "--project", dir, "--json"]);
      assert.equal(r.code, 1, r.err);
      const res = JSON.parse(r.out).secrets;
      const sources = res.findings.filter((f) => !f.where.startsWith("site"));
      assert.deepEqual(sources.map((f) => f.kind + (f.key ? `:${f.key}` : "")).sort(), ["credentialsUrl", "env:API_URL", "guid", "pattern"]);
      assert.deepEqual(res.ignored, { local: 6, template: 4, exclude: 2, allow: 4 }, "each one in the sources and in the site");
      assert.doesNotMatch(r.out, /orders\.internal\.example|pa55word|1b2c3d4e/);
    } finally {
      rm(dir);
    }
    const bad = await project((c) => ({ ...c, masking: { allow: ["("] } }));
    try {
      const r = await cli(["check", "secrets", "--project", bad]);
      assert.equal(r.code, 2);
      assert.match(r.err, /› masking\.allow\[0\]: /);
    } finally {
      rm(bad);
    }
  });

  test("local addresses and URL templates", () => {
    for (const v of ["0.0.0.0", "0.0.0.0:8000", "::", "::1", "[::1]:6379", "localhost:3000", "127.0.0.1", "10.1.2.3", "172.20.0.4:5432", "192.168.1.10", "169.254.169.254", "10.0.0.0/8", "http://0.0.0.0:8000/api", "https://192.168.1.10/admin"])
      assert.ok(isLocalAddress(v), v);
    for (const v of ["8.8.8.8", "172.32.0.1", "192.169.0.1", "https://orders.internal.example/api", "postgres://app:pw@10.0.0.5/x", "0.0.0.0.example.org", "10.0.0.5.nip.io", ""])
      assert.ok(!isLocalAddress(v), v);
    assert.ok(isUrlTemplate("https://tiles.example.org/{z}/{x}/{y}.png?key=abc"));
    assert.ok(isUrlTemplate("url=https://a.example.org/wmts?TILEMATRIX={z}&TILEROW={y}"));
    assert.ok(!isUrlTemplate("https://tiles.example.org/7/64/42.png?key=abc") && !isUrlTemplate("{z}/{x}/{y}"));
    const rules = ignoreRules({ exclude: "localhost", allow: ["^pk\\.public$"] });
    assert.equal(rules("0.0.0.0"), "local");
    assert.equal(rules("abc123", "https://t.example.org/{z}/{x}/{y}.png?key=abc123"), "template");
    assert.equal(rules("dev.localhost.example"), "exclude");
    assert.equal(rules("pk.public"), "allow");
    assert.equal(rules("pk.public2"), null);
    assert.throws(() => ignoreRules({ allow: ["["] }), (e) => e.code === 2 && e.details[0].path === "masking.allow[0]");
  });

  test("a session file outside the session folder is reported", async () => {
    const dir = await project();
    try {
      write(dir, "old-session.json", JSON.stringify({ cookies: [{ name: "s", value: "v" }], origins: [] }));
      write(dir, ".doc-kit/session.json", JSON.stringify({ cookies: [], origins: [] }));
      const r = await cli(["check", "secrets", "--project", dir]);
      assert.equal(r.code, 1);
      assert.match(r.err, /✖ session file outside the session folder: old-session\.json\n {2}→ delete it: .*connect keeps it in \.doc-kit\//);
      assert.doesNotMatch(r.err, /\.doc-kit\/session\.json/);
    } finally {
      rm(dir);
    }
  });

  test("only actual secret values: a PEM header, placeholders and variable names are documentation", () => {
    const list = detectors(DEMO, { env: [], exclude: null, guid: true, patterns: [] });
    const kinds = (t) => scanText(t, list).map((f) => f.kind);
    // A page that explains the format of a key: header lines, an elided body, no key material.
    assert.deepEqual(kinds("The file starts with `-----BEGIN PRIVATE KEY-----` and ends with `-----END PRIVATE KEY-----`."), []);
    assert.deepEqual(kinds("```\n-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----\n```"), []);
    assert.deepEqual(kinds("-----BEGIN RSA PRIVATE KEY-----\n-----END RSA PRIVATE KEY-----"), []);
    // A block holding base64 material (random, fictional) is a secret, encrypted headers included.
    const material = "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ejAxMjM0NTY3";
    assert.deepEqual(kinds(`-----BEGIN PRIVATE KEY-----\n${material}\n${material.slice(0, 20)}==\n-----END PRIVATE KEY-----`), ["privateKey"]);
    assert.deepEqual(kinds(`-----BEGIN RSA PRIVATE KEY-----\nProc-Type: 4,ENCRYPTED\n\n${material}\n-----END RSA PRIVATE KEY-----`), ["privateKey"]);
    assert.deepEqual(kinds(`-----BEGIN EC PRIVATE KEY-----\nProc-Type: 4,ENCRYPTED\n${material}\n-----END EC PRIVATE KEY-----`), ["privateKey"]);
    // Placeholders and names of variables.
    assert.deepEqual(kinds("client_secret = AZURE_CLIENT_SECRET · token: process.env.API_TOKEN_VALUE · Password=<secret> · Password=******** · api_key: your-api-key-goes-here"), []);
    assert.deepEqual(kinds("postgres://app:password@db.example.org/x · https://user:${PASS}@host"), []);
    // French placeholders (the kit documents projects in English and French).
    assert.deepEqual(kinds("postgresql://utilisateur:motdepasse@hote:5432/base · Password=mot_de_passe · https://u:VotreSecret@exemple.org"), []);
    assert.deepEqual(kinds("api_key: aaaaaaaaaaaaaaaaaaaa"), []);
  });

  test("detectors and redaction", () => {
    const list = detectors(DEMO, { env: [], exclude: null, guid: true, patterns: [] });
    const kinds = (t) => scanText(t, list).map((f) => f.kind);
    assert.deepEqual(kinds("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abcdefghijkl"), ["jwt"]);
    assert.deepEqual(kinds("Server=db;Password=hunter22;"), ["connectionString"]);
    assert.deepEqual(kinds("postgres://app:pa55word@db.example.org/x"), ["credentialsUrl"]);
    assert.deepEqual(kinds("AKIAABCDEFGHIJKLMNOP"), ["cloudKey"]);
    assert.deepEqual(kinds("https://x.example.org/f?sv=1&sig=abcdefghijklmnopqrstuvwxyz"), ["signedUrl"]);
    assert.deepEqual(kinds("password: (masked) · Password=<your password> · postgresql://<user>:<password>@<host>"), []);
    assert.equal(scanText("a\nb\n7d3c5a1e-9b2f-4c6d-8e1a-2f3b4c5d6e7f", list)[0].line, 3);
    assert.equal(redact("https://orders.internal.example/api"), "http… (35)");
    assert.ok(isStorageState('{"cookies":[],"origins":[]}') && !isStorageState('{"cookies":[]}') && !isStorageState("x"));
  });
});

describe("commands that stop before opening a browser", () => {
  test("connect --forget; connect for a public app; connect without URL", async () => {
    const dir = await project();
    try {
      let r = await cli(["connect", "--forget", "--project", dir]);
      assert.equal(r.code, 0);
      assert.match(r.out, /^No session to delete \(.*session\.json\)\.\n$/);
      write(dir, ".doc-kit/session.json", "{}");
      r = await cli(["connect", "--forget", "--project", dir, "--lang", "fr"]);
      assert.match(r.out, /^✔ Session supprimée : /);
      assert.ok(!fs.existsSync(path.join(dir, ".doc-kit/session.json")));
      r = await cli(["connect", "--project", dir]);
      assert.equal(r.code, 2);
      assert.match(r.err, /✖ no application URL\n {2}→ set app\.url in doc\.config\.mjs, or pass --url/);
    } finally {
      rm(dir);
    }
    const pub = await project((c) => ({ ...c, auth: { adapter: "none" } }));
    try {
      const r = await cli(["connect", "--project", pub]);
      assert.equal(r.code, 0);
      assert.match(r.out, /needs no sign-in/);
    } finally {
      rm(pub);
    }
  });

  test("capture: no session → exit code 3; forbidden route → exit code 1 before anything opens; unknown pattern, plans, context → 2", async () => {
    const dir = await project((c) => ({ ...c, app: { url: "http://127.0.0.1:9" }, capture: { forbidden: ["^/settings$"] } }));
    try {
      write(dir, "captures/plans/a.mjs", 'export const CAPTURES = [{ id: "a-orders", route: "/orders" }, { id: "a-settings", route: "/settings?tab=1" }, { id: "b-tall", route: "/x", context: "tablet" }];');
      let r = await cli(["capture", "a-orders", "--project", dir]);
      assert.equal(r.code, 3);
      assert.match(r.err, /✖ no session: .*session\.json\n {2}→ sign in with doc-kit connect; for a public application/);
      r = await cli(["capture", "a-*", "--project", dir, "--no-session"]);
      assert.equal(r.code, 1);
      assert.match(r.err, /✖ a-settings: the route \/settings\?tab=1 is forbidden \(capture\.forbidden: \^\/settings\$\)\n {2}→ a write made by the server while it renders a page cannot be blocked by the browser/);
      r = await cli(["capture", "zzz-*", "--project", dir]);
      assert.equal(r.code, 2);
      assert.match(r.err, /no capture matches “zzz-\*” \(3 in the plans\)/);
      r = await cli(["capture", "b-*", "--project", dir]);
      assert.equal(r.code, 2);
      assert.match(r.err, /b-tall: unknown context “tablet”\n {2}→ known contexts \(capture\.viewports\): desktop, mobile/);
      r = await cli(["capture", "--project", dir, "--plans", "captures/nope"]);
      assert.equal(r.code, 2);
      assert.match(r.err, /plans folder not found: captures\/nope/);
      write(dir, "captures/plans/c.mjs", 'export const CAPTURES = [{ id: "a-orders", route: "/o" }];');
      r = await cli(["capture", "--project", dir]);
      assert.equal(r.code, 2);
      assert.match(r.err, /duplicate capture id “a-orders” \(a\.mjs and c\.mjs\)/);
      // Invalid entries: all of them, in every file, each one named by file › id (index) › path.
      write(dir, "captures/plans/c.mjs", 'export const CAPTURES = [{ id: "c-ok", route: "/" }, { id: "c-bad", route: "/", zones: [{ css: "a", margn: 2 }] }];');
      write(dir, "captures/plans/d.mjs", 'export const CAPTURES = [{ id: "d-bad", route: "/", actions: [{ wheel: { x: 1, y: 1, direction: 0 } }] }];');
      r = await cli(["capture", "a-orders", "--project", dir]);
      assert.equal(r.code, 2);
      assert.match(r.err, /^✖ capture plans captures\/plans: 2 errors\n {2}→ fix the entries listed below \(file › id \(CAPTURES\[index\]\) › field\): one invalid entry stops the command/);
      assert.match(r.err, /\n✖ captures\/plans\/c\.mjs › c-bad \(CAPTURES\[1\]\) › zones\[0\]\.margn: unknown key\n {2}→ did you mean “margin”\?/);
      assert.match(r.err, /\n✖ captures\/plans\/d\.mjs › d-bad \(CAPTURES\[0\]\) › actions\[0\]\.wheel\.direction: /);
    } finally {
      rm(dir);
    }
  });

  test("capture: no URL → exit code 2; invalid auth option → exit code 2 with its path", async () => {
    // One project per configuration: a configuration module is imported once per process.
    const typo = await project((c) => ({ ...c, auth: { adapter: "manual", loginPatern: "x" } }));
    const noUrl = await project((c) => ({ ...c, auth: { adapter: "manual", loginPattern: "x" } }));
    try {
      for (const dir of [typo, noUrl]) write(dir, "captures/plans/a.mjs", 'export const CAPTURES = [{ id: "a", route: "/" }];');
      let r = await cli(["capture", "--project", typo]);
      assert.equal(r.code, 2);
      assert.match(r.err, /› auth\.loginPatern: unknown key\n {2}→ did you mean “loginPattern”\?/);
      r = await cli(["capture", "--project", noUrl]);
      assert.equal(r.code, 2);
      assert.match(r.err, /✖ no application URL/);
    } finally {
      rm(typo);
      rm(noUrl);
    }
  });

  test("demo: without setup → 2; the script receives the configuration; a failing script → 1", async () => {
    const bare = await project();
    try {
      assert.equal((await cli(["demo", "--project", bare])).code, 2);
    } finally {
      rm(bare);
    }
    const dir = await project((c) => ({ ...c, app: { url: "http://127.0.0.1:9" }, capture: { setup: "setup.mjs" } }));
    try {
      write(dir, "setup.mjs", 'export default async ({ config, root, url }) => { console.log(`ready ${config.product.name} ${url} ${root === process.cwd()}`); };');
      let r = await cli(["demo", "--project", dir]);
      assert.equal(r.code, 0, r.err);
      assert.match(r.out, /^Preparing the demo data: setup\.mjs…\n {2}ready Acme Orders http:\/\/127\.0\.0\.1:9 true\n✔ Demo data ready \(setup\.mjs\)\.\n$/);
      write(dir, "setup.mjs", 'console.error("cannot reach the app"); process.exit(4);');
      r = await cli(["demo", "--project", dir]);
      assert.equal(r.code, 1);
      assert.match(r.err, / {2}cannot reach the app\n✖ the setup script failed: setup\.mjs \(exit code 4\)/);
    } finally {
      rm(dir);
    }
  });
});
