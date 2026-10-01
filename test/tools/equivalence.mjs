#!/usr/bin/env node
// Equivalence of two builds of the same project (ARCHITECTURE.md §9): non-regression of migrated projects.
// Real projects stay OUTSIDE the kit: their configurations, copies and reports live in a working folder.
//
// 1) Prepare (work copies only; the source project is NEVER modified):
//      node test/tools/equivalence.mjs prepare --source <project dir> --name <n> --config <doc.config.mjs>
//           --work <work dir> [--date 2026-10-01] [--overlay <dir copied over the kit copies>]
//    → <work>/<n>-old/       copy built by its own pre-kit engine (generer.mjs), clock frozen (fixed-date.mjs)
//    → <work>/<n>-kit/       copy without that engine + doc.config.mjs, built by the kit (legacy files as is)
//    → <work>/<n>-migrated/  same, after `migrate`, built by the kit
//    → <work>/<n>-step4.html the kit copy built with the old engine's site assets (template, app.js, style.css
//                            converted to the kit's markers): byte comparison of the build pipeline itself
//
// 2) Compare:
//      node test/tools/equivalence.mjs compare --reference <a.html> --candidate <b.html>
//           [--levels bytes,1,2,3,4] [--report <dir>] [--tolerance 0.001]
//    bytes : identical HTML, ignoring <meta generator>, meta.generator and i18n (test/tools/diff-html.mjs)
//    1     : identical site data (JSON), ignoring meta.generator, meta.screenshots and i18n
//    2     : identical images (same ids, same SHA-256)
//    3     : identical visible text (main, menu, table of contents) for the home page, every section, every page
//    4     : screenshots of a sample (home, 1 section, 10 pages, 1 guided tour, search; light and dark)
//            differing by at most 0.1 % of pixels
// Exit code: 0 when every requested level passes, 1 otherwise.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { parseArgs } from "node:util";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { diffHtml } from "./diff-html.mjs";

const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OLD_ENGINE_FILES = ["generer.mjs", "config.mjs", "modele", "outils", "verifier-couverture.mjs", "node_modules", "package-lock.json"];
const NOT_COPIED = new Set(["node_modules", "dist", ".captures-tmp", ".doc-kit"]);

// ─── Extraction ──────────────────────────────────────────────────────────────
export function extractData(html) {
  const m = /<script type="application\/json" id="donnees">([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error("site data not found");
  return JSON.parse(m[1]);
}
export function extractImages(html) {
  const images = {};
  // Only blocks holding a data URI (the header comment of app.js quotes an example).
  for (const m of html.matchAll(/<script type="text\/plain" id="img-([^"<>]+)">\s*(data:[^<]*)<\/script>/g))
    images[m[1]] = crypto.createHash("sha256").update(m[2].trim()).digest("hex");
  return images;
}

/** Paths (at most `max`) where two JSON values differ. */
export function differences(a, b, at = "", max = 20, out = []) {
  if (out.length >= max || a === b) return out;
  const ta = Array.isArray(a) ? "array" : typeof a;
  const tb = Array.isArray(b) ? "array" : typeof b;
  if (ta === "array" && tb === "array") {
    if (a.length !== b.length) out.push(`${at}: length ${a.length} ≠ ${b.length}`);
    for (let i = 0; i < Math.min(a.length, b.length); i++) differences(a[i], b[i], `${at}[${i}]`, max, out);
    return out;
  }
  if (ta !== tb || ta !== "object" || a === null || b === null) {
    const short = (v) => (v === undefined ? "(absent)" : JSON.stringify(v).slice(0, 120));
    out.push(`${at || "(root)"}: ${short(a)} ≠ ${short(b)}`);
    return out;
  }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) differences(a[k], b[k], at ? `${at}.${k}` : k, max, out);
  return out;
}

// ─── Preparation ─────────────────────────────────────────────────────────────
function copy(source, target) {
  removeDir(target);
  fs.cpSync(source, target, { recursive: true, filter: (src) => !(path.dirname(src) === source && NOT_COPIED.has(path.basename(src))) });
}
function removeDir(dir) {
  if (!fs.existsSync(dir)) return;
  // Caution: a link (junction) is unlinked, never walked.
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.lstatSync(p).isSymbolicLink()) {
      try {
        fs.unlinkSync(p);
      } catch {
        fs.rmdirSync(p);
      }
    }
  }
  fs.rmSync(dir, { recursive: true, force: true });
}
/** Environment without the variables that would change the version or the paths. */
function cleanEnv(prefixes) {
  return Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("DOC_KIT_") && !prefixes.some((p) => k.startsWith(p + "_"))));
}

/** Converts the site assets of the pre-kit engine (modele/) to the kit's template markers. */
export function convertOldSite(modelDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  const template = fs
    .readFileSync(path.join(modelDir, "gabarit.html"), "utf8")
    .replace(/<html lang="[^"]*">/, '<html lang="{{LANG}}">')
    .replace(/<meta name="generator" content="[^"]*">/, '<meta name="generator" content="{{GENERATOR}}">')
    .replace(/localStorage\.getItem\("[^"]+"\)/, 'localStorage.getItem("{{THEME_KEY}}")')
    .replace(/\{\{TITRE\}\}/g, "{{TITLE}}")
    .replace(/\{\{PRODUIT\}\}/g, "{{PRODUCT}}")
    .replace(/\{\{DONNEES\}\}/g, "{{DATA}}")
    .replace(/\{\{ICONE_([A-Z]+)\}\}/g, (m, name) => `{{ICON:${name.toLowerCase()}}}`);
  fs.writeFileSync(path.join(targetDir, "template.html"), template);
  const app = fs.readFileSync(path.join(modelDir, "app.js"), "utf8").replace(/memo\.ecrire\("[^"]+", t\)/, 'memo.ecrire("__THEME_KEY__", t)');
  fs.writeFileSync(path.join(targetDir, "app.js"), app);
  fs.copyFileSync(path.join(modelDir, "style.css"), path.join(targetDir, "style.css"));
}

function runKit(args, env) {
  return spawnSync(process.execPath, [path.join(KIT_ROOT, "cli/doc-kit.mjs"), ...args], { env, encoding: "utf8" });
}

export async function prepare({ source, name, config, work, date = "2026-10-01", overlay = null }) {
  source = path.resolve(source);
  work = path.resolve(work);
  fs.mkdirSync(work, { recursive: true });
  const old = path.join(work, `${name}-old`);
  const kit = path.join(work, `${name}-kit`);
  const migrated = path.join(work, `${name}-migrated`);
  const conf = (await import(pathToFileURL(path.resolve(config)).href)).default;
  const env = cleanEnv([conf.env?.prefix || name.toUpperCase().replace(/-/g, "_")]);
  const log = (label, r) => process.stdout.write(`[${label}] ${r.stdout || ""}${r.stderr || ""}`);

  // Reference: the pre-kit engine, frozen clock. Its dependencies are copied, never linked.
  copy(source, old);
  fs.cpSync(path.join(source, "node_modules"), path.join(old, "node_modules"), { recursive: true });
  const fixedDate = pathToFileURL(path.join(KIT_ROOT, "test/tools/fixed-date.mjs")).href;
  const r1 = spawnSync(process.execPath, ["--import", fixedDate, "generer.mjs"], { cwd: old, env: { ...env, DOC_KIT_FIXED_DATE: date }, encoding: "utf8" });
  log("old", r1);
  if (r1.status !== 0) throw new Error(`old engine build failed (${r1.status})`);

  // Candidates: copies without the old engine, an equivalent doc.config.mjs (+ overlay), built by the kit.
  for (const dir of [kit, migrated]) {
    copy(source, dir);
    for (const f of OLD_ENGINE_FILES) fs.rmSync(path.join(dir, f), { recursive: true, force: true });
    fs.copyFileSync(path.resolve(config), path.join(dir, "doc.config.mjs"));
    if (overlay) fs.cpSync(path.resolve(overlay), dir, { recursive: true });
  }
  const r2 = runKit(["build", "--project", kit, "--date", date], env);
  log("kit", r2);
  if (r2.status !== 0) throw new Error(`kit build failed (${r2.status})`);
  const r3 = runKit(["migrate", "--project", migrated], env);
  log("migrate", r3);
  if (r3.status !== 0) throw new Error(`migrate failed (${r3.status})`);
  const r4 = runKit(["build", "--project", migrated, "--date", date], env);
  log("migrated", r4);
  if (r4.status !== 0) throw new Error(`build after migrate failed (${r4.status})`);

  // Step 4: the build pipeline of the kit with the old engine's site assets.
  const legacySite = path.join(work, `${name}-site-old`);
  convertOldSite(path.join(source, "modele"), legacySite);
  const { loadProject } = await import(pathToFileURL(path.join(KIT_ROOT, "engine/project/load.mjs")).href);
  const { build } = await import(pathToFileURL(path.join(KIT_ROOT, "engine/build/build.mjs")).href);
  const loaded = await loadProject({ project: kit, env });
  const step4 = build({ ...loaded, options: { date, siteDir: legacySite } });
  if (!step4.html) throw new Error("step-4 build failed");
  const step4File = path.join(work, `${name}-step4.html`);
  fs.writeFileSync(step4File, step4.html);

  const output = conf.output || `dist/${conf.product.name}-Documentation.html`;
  return { reference: path.join(old, output), kit: path.join(kit, output), migrated: path.join(migrated, output), step4: step4File };
}

// ─── Comparison ──────────────────────────────────────────────────────────────
async function routes(page) {
  return page.evaluate(() => {
    const D = JSON.parse(document.getElementById("donnees").textContent);
    return ["", ...D.sections.map((s) => s.id), ...D.ordre];
  });
}
async function go(page, route) {
  await page.evaluate(
    (h) =>
      new Promise((r) => {
        if (location.hash === h || (h === "#/" && !location.hash)) return r();
        window.addEventListener("hashchange", () => setTimeout(r, 20), { once: true });
        location.hash = h;
      }),
    "#/" + route
  );
}
async function texts(page) {
  return page.evaluate(() => ({
    main: document.getElementById("contenu-principal").innerText,
    menu: document.getElementById("lateral").innerText,
    toc: document.getElementById("toc").innerText,
  }));
}

async function level3(browser, reference, candidate) {
  const open = async (f) => {
    const p = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await p.goto(pathToFileURL(f).href);
    await p.waitForTimeout(300);
    return p;
  };
  const [pa, pb] = await Promise.all([open(reference), open(candidate)]);
  const ra = await routes(pa);
  const rb = await routes(pb);
  const gaps = [];
  if (JSON.stringify(ra) !== JSON.stringify(rb)) gaps.push("different route lists");
  for (const r of ra) {
    await Promise.all([go(pa, r), go(pb, r)]);
    const [ta, tb] = await Promise.all([texts(pa), texts(pb)]);
    for (const k of ["main", "menu", "toc"])
      if (ta[k] !== tb[k]) {
        let i = 0;
        while (i < ta[k].length && ta[k][i] === tb[k][i]) i++;
        gaps.push(`#/${r} › ${k}: «…${ta[k].slice(Math.max(0, i - 40), i + 60)}…» ≠ «…${tb[k].slice(Math.max(0, i - 40), i + 60)}…»`);
      }
  }
  await Promise.all([pa.context().close(), pb.context().close()]);
  return { routes: ra.length, gaps };
}

/** Level-4 sample: home, 1 section, 10 pages, 1 guided tour, search. */
function sample(D) {
  const n = D.ordre.length;
  const pages = [];
  for (let i = 0; i < 10 && i < n; i++) pages.push(D.ordre[Math.floor((i * n) / Math.min(10, n))]);
  const tour = D.ordre.find((id) => D.pages[id].html.includes('data-action="visite"'));
  const section = (D.sections.find((s) => s.vedette) || D.sections[0]).id;
  const word = (D.pages[D.ordre[0]].titre.split(/\s+/).find((w) => w.length > 4) || "page").toLowerCase();
  return [
    { name: "home", route: "" },
    { name: "section", route: section },
    ...pages.map((p, i) => ({ name: `page-${String(i + 1).padStart(2, "0")}`, route: p })),
    ...(tour ? [{ name: "tour", route: tour, tour: true }] : []),
    { name: "search", route: "", search: word },
  ];
}

async function screenshot(browser, file, c, theme) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(pathToFileURL(file).href + (c.route ? "#/" + c.route : ""));
  await p.waitForTimeout(400);
  await p.evaluate(async () => {
    document.querySelectorAll("img[loading=lazy]").forEach((i) => (i.loading = "eager"));
    await Promise.all([...document.images].map((i) => (i.decode ? i.decode().catch(() => {}) : null)));
  });
  let options = { animations: "disabled", caret: "hide" };
  if (c.tour) {
    await p.locator("[data-action=visite]").first().click();
    await p.waitForTimeout(1300);
  } else if (c.search) {
    await p.keyboard.press("Control+k");
    await p.keyboard.type(c.search);
    await p.waitForTimeout(300);
  } else {
    const height = await p.evaluate(() => document.documentElement.scrollHeight);
    options = { ...options, fullPage: true, clip: { x: 0, y: 0, width: 1440, height: Math.min(height, 5000) } };
  }
  const png = await p.screenshot(options);
  await ctx.close();
  return { png, errors };
}

async function comparePixels(page, a, b) {
  return page.evaluate(
    async ([a, b]) => {
      const load = async (b64) => {
        const img = new Image();
        img.src = "data:image/png;base64," + b64;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const x = c.getContext("2d");
        x.drawImage(img, 0, 0);
        return x.getImageData(0, 0, c.width, c.height);
      };
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      if (ia.width !== ib.width || ia.height !== ib.height)
        return { total: ia.width * ia.height, different: ia.width * ia.height, sizes: `${ia.width}×${ia.height} ≠ ${ib.width}×${ib.height}` };
      let different = 0;
      for (let i = 0; i < ia.data.length; i += 4)
        if (ia.data[i] !== ib.data[i] || ia.data[i + 1] !== ib.data[i + 1] || ia.data[i + 2] !== ib.data[i + 2] || ia.data[i + 3] !== ib.data[i + 3])
          different++;
      return { total: ia.width * ia.height, different };
    },
    [a.toString("base64"), b.toString("base64")]
  );
}

async function level4(browser, reference, candidate, D, tolerance, report) {
  const tool = await (await browser.newContext()).newPage();
  const results = [];
  for (const theme of ["light", "dark"])
    for (const c of sample(D)) {
      const a = await screenshot(browser, reference, c, theme);
      const b = await screenshot(browser, candidate, c, theme);
      const r = await comparePixels(tool, a.png, b.png);
      const ratio = r.different / r.total;
      const ok = ratio <= tolerance && !b.errors.length;
      results.push({ theme, case: c.name, route: c.route, ratio, ...r, jsErrors: b.errors, ok });
      if (report && (!ok || ratio > 0)) {
        fs.mkdirSync(report, { recursive: true });
        fs.writeFileSync(path.join(report, `${theme}-${c.name}-reference.png`), a.png);
        fs.writeFileSync(path.join(report, `${theme}-${c.name}-candidate.png`), b.png);
      }
    }
  await tool.context().close();
  return results;
}

export async function compare({ reference, candidate, levels = ["bytes", "1", "2", "3", "4"], tolerance = 0.001, report = null }) {
  const ha = fs.readFileSync(reference, "utf8");
  const hb = fs.readFileSync(candidate, "utf8");
  const summary = {};
  if (levels.includes("bytes")) {
    const d = diffHtml(ha, hb);
    summary.bytes = d.identical ? { ok: true } : { ok: false, position: d.position, reference: d.reference, candidate: d.candidate };
  }
  const Da = extractData(ha);
  const Db = extractData(hb);
  if (levels.includes("1")) {
    const clean = (D) => {
      const c = structuredClone(D);
      delete c.i18n;
      // meta.screenshots (dates and versions of the screenshots, read from the zone files) did not exist before
      // the kit: a project captured again with the kit gains it, without any change to its content.
      if (c.meta) {
        delete c.meta.generator;
        delete c.meta.screenshots;
      }
      return c;
    };
    const d = differences(clean(Da), clean(Db));
    summary.level1 = { ok: d.length === 0, differences: d };
  }
  if (levels.includes("2")) {
    const ia = extractImages(ha);
    const ib = extractImages(hb);
    const d = [...new Set([...Object.keys(ia), ...Object.keys(ib)])].filter((k) => ia[k] !== ib[k]);
    summary.level2 = { ok: d.length === 0 && JSON.stringify(Object.keys(ia)) === JSON.stringify(Object.keys(ib)), images: Object.keys(ia).length, differences: d };
  }
  if (levels.includes("3") || levels.includes("4")) {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    try {
      if (levels.includes("3")) {
        const r = await level3(browser, reference, candidate);
        summary.level3 = { ok: r.gaps.length === 0, routes: r.routes, gaps: r.gaps };
      }
      if (levels.includes("4")) {
        const r = await level4(browser, reference, candidate, Da, tolerance, report);
        summary.level4 = {
          ok: r.every((x) => x.ok),
          tolerance,
          worst: Math.max(...r.map((x) => x.ratio)),
          screenshots: r.map((x) => ({
            theme: x.theme,
            case: x.case,
            route: x.route,
            ratio: +x.ratio.toFixed(6),
            ok: x.ok,
            ...(x.sizes ? { sizes: x.sizes } : {}),
            ...(x.jsErrors.length ? { jsErrors: x.jsErrors } : {}),
          })),
        };
      }
    } finally {
      await browser.close();
    }
  }
  summary.ok = Object.values(summary).every((x) => x.ok);
  return summary;
}

// ─── Command line ────────────────────────────────────────────────────────────
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values: v, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      source: { type: "string" },
      name: { type: "string" },
      config: { type: "string" },
      work: { type: "string" },
      date: { type: "string" },
      overlay: { type: "string" },
      reference: { type: "string" },
      candidate: { type: "string" },
      levels: { type: "string" },
      report: { type: "string" },
      tolerance: { type: "string" },
    },
  });
  if (positionals[0] === "prepare") {
    console.log(JSON.stringify(await prepare({ source: v.source, name: v.name, config: v.config, work: v.work, date: v.date, overlay: v.overlay }), null, 2));
  } else if (positionals[0] === "compare") {
    const summary = await compare({
      reference: v.reference,
      candidate: v.candidate,
      levels: (v.levels || "bytes,1,2,3,4").split(","),
      tolerance: v.tolerance ? Number(v.tolerance) : 0.001,
      report: v.report || null,
    });
    console.log(JSON.stringify(summary, null, 2));
    process.exitCode = summary.ok ? 0 : 1;
  } else {
    console.error("usage: node test/tools/equivalence.mjs prepare|compare [options] (see the header of this file)");
    process.exitCode = 2;
  }
}
