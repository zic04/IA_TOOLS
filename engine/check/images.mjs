// Image check: what the site embeds compared with what <images>/ holds.
//   errors     a capture cited but not found, or whose image is missing (from the draft build);
//              an orphan image (cited by no page: neither :::screen, ::capture nor ::before-after);
//              a zone file whose image is missing (and that no page cites)
//   warnings   a heavy image (above the threshold, 200 KB by default: `optimize` recompresses it);
//              a capture taken on another version of the application (`version` of its zone file)
// Each problem is { key, vars }: key under `cli.` (e.g. "check.images.orphan", "build.capture.notFound").
import fs from "node:fs";
import path from "node:path";
import { normalizeZones } from "../project/legacy.mjs";

const IMAGE_EXTENSIONS = /\.(webp|png|jpe?g)$/i;

const unescape = (s) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** Ids of the captures embedded in a built site (one <script id="img-<id>"> per image), source only — a
 * language variant (`id="img-<id>@<lang>"`, ARCHITECTURE.md §6.12) is excluded: embeddedLanguageCaptures. */
export function embeddedCaptures(html) {
  return new Set(
    [...String(html).matchAll(/<script type="text\/plain" id="img-([^"@]+)">data:/g)].map((m) => unescape(m[1])),
  );
}

/** Ids of the captures embedded FOR one language (`id="img-<id>@<lang>"`, ARCHITECTURE.md §6.12 §7). */
export function embeddedLanguageCaptures(html, lang) {
  const re = new RegExp(`<script type="text\\/plain" id="img-([^"@]+)@${lang}">data:`, "g");
  return new Set([...String(html).matchAll(re)].map((m) => unescape(m[1])));
}

/** Zone files of one folder (`<images>/[<lang>/]zones/*.json`), normalised like the build does. */
function readZones(root, zonesDir) {
  const zones = {};
  for (const f of fs.existsSync(path.join(root, zonesDir))
    ? fs
        .readdirSync(path.join(root, zonesDir))
        .filter((x) => x.endsWith(".json"))
        .sort()
    : []) {
    try {
      zones[f.slice(0, -5)] = normalizeZones(JSON.parse(fs.readFileSync(path.join(root, zonesDir, f), "utf8"))).value;
    } catch {
      /* reported by the build */
    }
  }
  return zones;
}

/** Image files of one folder (webp/png/jpg), sorted. */
function readImageFiles(root, dir) {
  return fs.existsSync(path.join(root, dir))
    ? fs
        .readdirSync(path.join(root, dir), { withFileTypes: true })
        .filter((d) => d.isFile() && IMAGE_EXTENSIONS.test(d.name))
        .map((d) => d.name)
        .sort()
    : [];
}

/**
 * @param {object} p
 * @param {string} p.root
 * @param {object} p.config
 * @param {string} p.html             site built as a draft (every cited capture that exists is embedded)
 * @param {object[]} p.warnings       warnings of that build (capture.notFound, capture.fileMissing)
 * @param {string} p.version          current version of the application
 * @param {number} [p.threshold]      heavy image threshold, in KB
 * @returns {{ images: number, zones: number, cited: number, errors: object[], warnings: object[] }}
 */
export function checkImages({ root, config, html, warnings: buildWarnings = [], version, threshold = 200 }) {
  const images = config.paths.images;
  const dir = path.join(root, images);
  const rel = (f) => `${images}/${f}`;
  const files = readImageFiles(root, images);
  const zones = readZones(root, `${images}/zones`);
  const cited = embeddedCaptures(html);
  const errors = [];
  const warnings = [];
  for (const w of buildWarnings)
    if (w.key === "capture.notFound" || w.key === "capture.fileMissing")
      errors.push({ key: `build.${w.key}`, vars: w.vars });
  // Cited captures whose image is missing are reported by the build (capture.fileMissing, with the image path).
  const missingFiles = new Set(buildWarnings.filter((w) => w.key === "capture.fileMissing").map((w) => w.vars?.file));
  const citedIds = new Set([
    ...cited,
    ...Object.keys(zones).filter((id) => zones[id]?.file && missingFiles.has(rel(zones[id].file))),
  ]);
  const usedFiles = new Set([...cited].map((id) => zones[id]?.file).filter(Boolean));
  for (const f of files) if (!usedFiles.has(f)) errors.push({ key: "check.images.orphan", vars: { file: rel(f) } });
  for (const [id, z] of Object.entries(zones)) {
    if (z && z.file && !fs.existsSync(path.join(dir, z.file)) && !citedIds.has(id))
      errors.push({
        key: "check.images.zonesWithoutImage",
        vars: { zones: `${images}/zones/${id}.json`, file: rel(z.file) },
      });
  }
  for (const f of files) {
    const kb = Math.round(fs.statSync(path.join(dir, f)).size / 1024);
    if (kb > threshold) warnings.push({ key: "check.images.heavy", vars: { file: rel(f), kb, threshold } });
  }
  for (const [id, z] of Object.entries(zones))
    if (z && z.version && version && z.version !== version)
      warnings.push({
        key: "check.images.outdated",
        vars: { file: `${images}/zones/${id}.json`, captured: z.version, version },
      });

  // Languages (ARCHITECTURE.md §6.12 §7): every <images>/<lang>/ is walked for ORPHANS only — a language image
  // without a source counterpart is never "missing" (it is always optional), so nothing else is checked there.
  let languageImages = 0;
  for (const lang of (config.languages || []).slice(1)) {
    const langImages = `${images}/${lang}`;
    const langFiles = readImageFiles(root, langImages);
    languageImages += langFiles.length;
    const langZones = readZones(root, `${langImages}/zones`);
    const citedLang = embeddedLanguageCaptures(html, lang);
    const usedLangFiles = new Set([...citedLang].map((id) => (langZones[id] || zones[id])?.file).filter(Boolean));
    for (const f of langFiles)
      if (!usedLangFiles.has(f)) errors.push({ key: "check.images.orphan", vars: { file: `${langImages}/${f}` } });
  }
  return {
    images: files.length + languageImages,
    zones: Object.keys(zones).length,
    cited: cited.size,
    errors,
    warnings,
  };
}
