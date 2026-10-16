// Migration 0.4.0 — the four spaces (ARCHITECTURE.md §6.1a): a table of contents that declares the spaces of 0.3
// (`business`, `takeover`, spaces of the project's own without a kind) is rewritten with those of 0.4 (`use`,
// `product`, `admin`, `develop`), its translations with it (same structure, §6.12); the rules are in
// engine/migrations/0.4.0/spaces.mjs. A translated table of contents that was up to date stays up to date: its
// fingerprint in `.sources.json` follows the new source. A table of contents still in the format of kit 0.1
// (French keys, content/sommaire.json) is refused: `doc-kit migrate` rewrites it first. Idempotent.
import path from "node:path";
import { planSpaces, applySpaces } from "./0.4.0/spaces.mjs";
import { hashText } from "../core/hash.mjs";
import { stripBom } from "../project/toc.mjs";
import { normalizeToc, LEGACY_FILES, CURRENT_FILES } from "../project/legacy.mjs";
import { KitError, EXIT } from "../project/errors.mjs";

export const version = "0.4.0";

const json = (value) => JSON.stringify(value, null, 2) + "\n";

/** A folder of doc.config.mjs (raw: `upgrade` passes the configuration as written) as a relative posix path. */
function folder(value, fallback) {
  let p = path.posix.normalize(
    String(value || fallback)
      .split("\\")
      .join("/"),
  );
  while (p.endsWith("/") && p.length > 1) p = p.slice(0, -1);
  return p.startsWith("./") ? p.slice(2) : p;
}

export async function migrate({ files, config }) {
  const content = folder(config?.paths?.content, "content");
  const translations = folder(config?.paths?.translations, "translations");
  const tocFile = `${content}/${CURRENT_FILES.toc}`;
  const legacyFile = `${content}/${LEGACY_FILES.toc}`;
  const language = config?.language || "en";
  const file = files.exists(tocFile) ? tocFile : files.exists(legacyFile) ? legacyFile : null;
  if (!file) return;
  const before = files.read(file);
  const source = JSON.parse(stripBom(before));
  const normal = normalizeToc(source);
  // A table of contents of kit 0.1 is refused only when it has spaces to migrate: `doc-kit migrate` rewrites it
  // first (one that declares none upgrades as before).
  if (file === legacyFile || normal.legacy) {
    if (planSpaces(normal.value, language)) throw new KitError(EXIT.CHECK, "migration.legacyToc", { file });
    return;
  }
  const plan = planSpaces(source, language);
  if (!plan) return;
  const after = json(applySpaces(source, plan, language));
  files.write(tocFile, after);
  const langs = files
    .list(translations)
    .map((f) => f.slice(translations.length + 1).split("/"))
    .filter((parts) => parts.length === 2 && parts[1] === CURRENT_FILES.toc)
    .map((parts) => parts[0]);
  for (const lang of langs) {
    const file = `${translations}/${lang}/${CURRENT_FILES.toc}`;
    const translated = JSON.parse(stripBom(files.read(file)));
    files.write(file, json(applySpaces(translated, plan, lang, { source: false })));
    const sourcesFile = `${translations}/${lang}/.sources.json`;
    if (!files.exists(sourcesFile)) continue;
    const sources = JSON.parse(stripBom(files.read(sourcesFile)));
    if (sources["toc.json"] !== hashText(before)) continue; // not up to date before: it stays as it was
    sources["toc.json"] = hashText(after);
    const sorted = Object.fromEntries(
      Object.keys(sources)
        .sort()
        .map((k) => [k, sources[k]]),
    );
    files.write(sourcesFile, json(sorted));
  }
}
