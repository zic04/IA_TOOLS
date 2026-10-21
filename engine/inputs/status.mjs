// The state of the sources (ARCHITECTURE.md §6.19, `doc-kit inputs status`, and the `inputs.*` bricks), read from
// what is on disk — the clones and the index of the converted documents — never from a state file of its own.
//   code: a folder `present` or `missing`; a repository `fetched` (a clone of that address is there) or `notFetched`;
//   documents: `fresh` (converted from the file as it is now), `stale` (the file changed since), `notIngested`,
//     `refused` (the kit cannot read it as it is), `missing` (the file is not there), `external` (an address whose
//     page the skill has not saved yet, through the session's connectors, in `page`: then converted like a file).
import fs from "node:fs";
import path from "node:path";
import { hashText } from "../core/hash.mjs";
import { repoFolder, readIndex, pageFile } from "./model.mjs";
import { cloneOrigin } from "./repos.mjs";

/** When a clone was last brought up to date: its last fetch, else its creation (null when unknown). */
function fetchedAt(dir) {
  for (const f of ["FETCH_HEAD", "HEAD"]) {
    try {
      return fs.statSync(path.join(dir, ".git", f)).mtime.toISOString();
    } catch {
      // next
    }
  }
  return null;
}

/**
 * @param {{ root: string, inputs: object, commit: (dir: string) => string|null }} p
 * @returns {{ code: object[], app: object[], documents: object[], workspaces: object[], backlog: object|null }}
 */
export function inputsStatus({ root, inputs, commit }) {
  const code = (inputs.code || []).map((c) => {
    if (c.path !== undefined) {
      const dir = path.resolve(root, c.path);
      const present = fs.existsSync(dir) && fs.statSync(dir).isDirectory();
      return { ...c, state: present ? "present" : "missing", folder: c.path, commit: present ? commit(dir) : null };
    }
    const folder = repoFolder(c.name);
    const dir = path.resolve(root, folder);
    const fetched = cloneOrigin(dir) === c.repo;
    return {
      ...c,
      state: fetched ? "fetched" : "notFetched",
      folder,
      commit: fetched ? commit(dir) : null,
      fetchedAt: fetched ? fetchedAt(dir) : null,
    };
  });
  const index = readIndex(root).documents;
  const documents = (inputs.documents || []).map((d) => {
    const page = d.file ? null : pageFile(d.url);
    const abs = path.resolve(root, d.file ?? page);
    const present = fs.existsSync(abs) && fs.statSync(abs).isFile();
    if (!d.file && !present) return { ...d, state: "external", page };
    if (!present) return { ...d, state: "missing" };
    const entry = index.find((e) => e.source === (d.file ?? d.url));
    if (!entry) return { ...d, ...(page ? { page } : {}), state: "notIngested" };
    const same = entry.hash === hashText(fs.readFileSync(abs));
    const more = page ? { page } : {};
    if (entry.refused) return { ...d, ...more, state: same || !entry.hash ? "refused" : "stale", reason: entry.reason };
    return { ...d, ...more, state: same ? "fresh" : "stale", output: entry.output };
  });
  return {
    code,
    app: inputs.app || [],
    documents,
    workspaces: inputs.workspaces || [],
    backlog: inputs.backlog || null,
  };
}
