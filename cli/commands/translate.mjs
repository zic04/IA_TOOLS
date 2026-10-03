// translate status [--check] | translate --mark <page…> | translate --mark --all | translate --fix-anchors [page…]
// The state of the translations (ARCHITECTURE.md §6.12). Global --lang limits to one language; without it, every
// language but the source. Never runs without `languages` declared (translate.noLanguages, exit code 2).
import fs from "node:fs";
import path from "node:path";
import { createMarkdownEngine } from "../../engine/build/markdown.mjs";
import { checkLanguageOption } from "../../engine/build/languages.mjs";
import { statusOf, markFiles, resolveItems } from "../../engine/translate/status.mjs";
import { fixAnchors } from "../../engine/translate/anchors.mjs";
import { readToc } from "../../engine/project/toc.mjs";
import { KitError, EXIT } from "../../engine/project/errors.mjs";
import { numbers } from "../../engine/build/format.mjs";

export const options = {
  mark: { type: "boolean" },
  all: { type: "boolean" },
  "fix-anchors": { type: "boolean" },
  check: { type: "boolean" },
};

/** The table of contents (current or legacy file name); throws like `build` when it cannot be read. */
function readProjectToc(root, config) {
  const r = readToc(root, config.paths.content);
  if (!r.toc) throw new KitError(EXIT.CHECK, "new.noToc", { file: r.file });
  return r.toc;
}

/** The target languages of this run: `--lang` (checked, never the source), else every language but the source. */
function targetLanguages(config, ctx) {
  const languages = config.languages;
  if (!languages) throw new KitError(EXIT.USAGE, "translate.noLanguages");
  if (!ctx.globals.lang) return languages.slice(1);
  const lang = checkLanguageOption({ languages, lang: ctx.globals.lang, t: ctx.t });
  if (lang === languages[0]) throw new KitError(EXIT.USAGE, "translate.sourceLang", { lang });
  return [lang];
}

/** A throwaway Markdown engine, just to get a page's outline (render().toc): no capture, no diagram, nothing
 * reported (ARCHITECTURE.md §6.12, `translate --fix-anchors`: the source and target outlines of every page). */
function tocEngine() {
  return createMarkdownEngine({
    captures: {},
    exists: () => false,
    read: () => "",
    report: () => {},
    t: (k) => k,
    icon: () => "",
  });
}

/** Every page and section id of the table of contents, with the relative file read for its outline. */
function tocEntries(toc) {
  const entries = [];
  for (const sec of toc.sections || []) {
    entries.push({ id: sec.id, file: `${sec.id}/index.md` });
    for (const g of sec.groups || [])
      for (const p of g.pages || []) entries.push({ id: p.id, file: p.file || `${p.id}.md` });
  }
  return entries;
}

/** `tocs(pageId) => { source, target }` of every page/section (ARCHITECTURE.md §6.12 §5), rendered once. */
function outlinesOf(root, config, toc, lang) {
  const { content, translations } = config.paths;
  const engine = tocEngine();
  const source = {};
  const target = {};
  for (const e of tocEntries(toc)) {
    const srcAbs = path.join(root, content, e.file);
    if (fs.existsSync(srcAbs)) source[e.id] = engine.render(fs.readFileSync(srcAbs, "utf8"), e.id).toc;
    const trAbs = path.join(root, translations, lang, e.file);
    if (fs.existsSync(trAbs)) target[e.id] = engine.render(fs.readFileSync(trAbs, "utf8"), e.id).toc;
  }
  return (id) => ({ source: source[id] || null, target: target[id] || null });
}

/** @param {{ ctx: any, values: any, positionals?: string[], config: any, root: string, toc: any }} p */
async function runStatus({ ctx, values, config, root, toc }) {
  const results = targetLanguages(config, ctx).map((lang) => statusOf({ root, config, toc, lang }));
  const failed = results.some((r) => r.counts.stale > 0 || r.counts.missing > 0);
  if (ctx.json) {
    ctx.print(JSON.stringify({ languages: results }, null, 2));
    return !values.check || !failed ? EXIT.OK : EXIT.CHECK;
  }
  for (const r of results) {
    ctx.print(ctx.t("cli.translate.status.title", { lang: r.id }));
    ctx.print(`  ${ctx.t("cli.translate.status.counts", r.counts)}`);
    for (const f of r.files.filter((x) => x.state !== "current"))
      ctx.print(
        `  ${ctx.t("cli.translate.status.file", { file: f.file, state: ctx.t(`cli.translate.status.state.${f.state}`) })}`,
      );
  }
  const n = results.reduce((s, r) => s + r.counts.stale + r.counts.missing, 0);
  ctx.print(n ? numbers(ctx.i18n).count("cli.translate.status.failed", n) : ctx.t("cli.translate.status.ok"));
  return values.check && failed ? EXIT.CHECK : EXIT.OK;
}

async function runMark({ ctx, values, positionals, config, root, toc }) {
  if (!values.all && !positionals.length) throw new KitError(EXIT.USAGE, "translate.markNothing");
  const items = values.all ? [] : resolveItems({ toc, root, content: config.paths.content, items: positionals });
  let failed = false;
  const out = [];
  for (const lang of targetLanguages(config, ctx)) {
    const { written, missing } = markFiles({ root, config, toc, lang, items, all: !!values.all });
    for (const file of missing) {
      ctx.error("translate.missingFile", { lang, file });
      failed = true;
    }
    if (written.length) out.push({ lang, n: written.length, file: written.join(", ") });
  }
  if (ctx.json) {
    ctx.print(JSON.stringify({ marked: out, failed: failed ? true : undefined }, null, 2));
  } else for (const o of out) ctx.print(ctx.t("cli.translate.mark.written", o));
  return failed ? EXIT.CHECK : EXIT.OK;
}

async function runFixAnchors({ ctx, values, positionals, config, root, toc }) {
  const items = positionals.length
    ? resolveItems({ toc, root, content: config.paths.content, items: positionals })
    : tocEntries(toc)
        .filter(
          (e) =>
            toc.sections.some((s) => s.id === e.id) ||
            toc.sections.some((s) => (s.groups || []).some((g) => (g.pages || []).some((p) => p.id === e.id))),
        )
        .map((e) => ({ file: e.file, page: e.id }));
  /** @type {any[]} */
  const out = [];
  let anyUnmapped = false;
  for (const lang of targetLanguages(config, ctx)) {
    const tocs = outlinesOf(root, config, toc, lang);
    for (const item of items) {
      const trAbs = path.join(root, config.paths.translations, lang, item.file);
      if (!fs.existsSync(trAbs)) continue; // nothing to fix in a file that is not translated
      const raw = fs.readFileSync(trAbs, "utf8");
      const eol = raw.includes("\r\n") ? "\r\n" : "\n";
      const bom = raw.charCodeAt(0) === 0xfeff;
      const body = bom ? raw.slice(1) : raw;
      const { text, changed, unmapped } = fixAnchors({ markdown: body.replace(/\r\n/g, "\n"), tocs });
      if (unmapped.length) {
        anyUnmapped = true;
        for (const u of unmapped) out.push({ lang, file: item.file, kind: "unmapped", ...u });
      }
      if (changed.length) {
        const written = (bom ? "﻿" : "") + (eol === "\r\n" ? text.replace(/\n/g, "\r\n") : text);
        fs.writeFileSync(trAbs, written);
        out.push({ lang, file: item.file, kind: "changed", n: changed.length, changed });
      }
    }
  }
  if (ctx.json) {
    ctx.print(
      JSON.stringify(
        {
          languages: targetLanguages(config, ctx).map((lang) => ({
            id: lang,
            files: out.filter((o) => o.lang === lang),
          })),
        },
        null,
        2,
      ),
    );
  } else {
    const changedOut = out.filter((o) => o.kind === "changed");
    if (!changedOut.length) ctx.print(ctx.t("cli.translate.anchors.none"));
    for (const o of changedOut) ctx.print(ctx.t("cli.translate.anchors.file", { lang: o.lang, file: o.file, n: o.n }));
    for (const o of out.filter((o) => o.kind === "unmapped"))
      ctx.printErr(
        `⚠ ${ctx.t("cli.translate.anchorUnmapped", { lang: o.lang, file: o.file, link: o.link, reason: ctx.t(`cli.translate.anchors.reason.${o.reason}`) })}`,
      );
  }
  return anyUnmapped ? EXIT.CHECK : EXIT.OK;
}

export async function run({ ctx, values, positionals }) {
  const { project, config } = await ctx.loadProject();
  const root = project.root;
  if (!config.languages) throw new KitError(EXIT.USAGE, "translate.noLanguages");
  const toc = readProjectToc(root, config);
  if (positionals[0] === "status")
    return runStatus({ ctx, values, positionals: positionals.slice(1), config, root, toc });
  if (values.mark) return runMark({ ctx, values, positionals, config, root, toc });
  if (values["fix-anchors"]) return runFixAnchors({ ctx, values, positionals, config, root, toc });
  throw new KitError(EXIT.USAGE, "translate.usage");
}
