// Which modules a Node process loads: preloaded with `node --import <this file's URL> …`, it registers itself as a
// module hook (node:module register, Node 20.6+), which appends the URL of every module resolved, static or dynamic
// import, one per line, to the file named by DOC_KIT_MODULE_TRACE. The hooks run on a thread of their own: the
// file is written there, synchronously, so that nothing is lost when the process ends. Used by
// test/unit/cli-startup.test.mjs (what `doc-kit --version` loads).
import fs from "node:fs";
import { register } from "node:module";
import { isMainThread } from "node:worker_threads";

if (isMainThread && process.env.DOC_KIT_MODULE_TRACE)
  register(import.meta.url, { data: { file: process.env.DOC_KIT_MODULE_TRACE } });

let file = "";

/** Hook: the file the URLs go to. @param {{ file: string }} data */
export function initialize(data) {
  file = data.file;
}

/** Hook: every resolution, written down once resolved. */
export async function resolve(specifier, context, next) {
  const resolved = await next(specifier, context);
  fs.appendFileSync(file, `${resolved.url}\n`);
  return resolved;
}
