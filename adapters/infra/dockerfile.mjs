// Infra adapter of the Dockerfiles (ARCHITECTURE.md §5, §6.9): each stage of a Dockerfile or a Containerfile —
// `FROM image[:tag] [AS name]` — with the ports it exposes, whether it runs as root (a stage does until a `USER`
// that is not root), and the names of its `ENV` and `ARG` variables (never their values). Line continuations (`\`)
// joined, comments and parser directives (`# syntax=…`) left out; nothing is built or run.
import { textIndex } from "../../engine/facts/behaviour-common.mjs";
import { imageOf } from "../../engine/facts/infra-common.mjs";

/** The files read: a Dockerfile or a Containerfile (Dockerfile.prod too), a `.dockerfile`. */
const FILES = /(?:^|\/)(?:Dockerfile|Containerfile)(?:\.[\w.-]{1,40})?$|\.dockerfile$/i;
/** An instruction at the start of a logical line, its argument after it. */
const INSTRUCTION = /^\s{0,40}([A-Za-z]{2,12})\s{1,40}(.{0,4000})$/;
/** `FROM [--platform=…] image[:tag][@digest] [AS name]`. */
const FROM = /^(?:--\w{1,20}=\S{1,200}\s{1,20}){0,3}(\S{1,300})(?:\s{1,20}[Aa][Ss]\s{1,20}([\w.-]{1,64}))?/;
/** A port of EXPOSE: `8080`, `8080/tcp`. */
const PORT = /^(\d{1,5})(?:\/(?:tcp|udp))?$/;
/** A variable of ENV or ARG: `NAME=value` or `NAME value` (the old form: one per instruction). */
const VARIABLE = /^([A-Za-z_][\w]{0,63})(?:=|\s|$)/;

/** A comment line (and a parser directive: `# syntax=…`), and the blanks between words. */
const COMMENT = /^\s{0,40}#/;
const BLANKS = /\s{1,40}/;

/** The expressions of this adapter (test/tools/redos-worker.mjs, RULES.md S5). */
export const DOCKERFILE_PATTERNS = Object.freeze({ FILES, INSTRUCTION, FROM, PORT, VARIABLE, COMMENT, BLANKS });

/** The logical lines of a Dockerfile (continuations joined), each with the index of its first character. */
function logicalLines(text) {
  const out = [];
  let parts = [];
  let start = 0;
  let index = 0;
  for (const raw of text.split("\n")) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const at = index;
    index += raw.length + 1;
    if (!parts.length && COMMENT.test(line)) continue;
    if (!parts.length) start = at;
    if (line.endsWith("\\")) parts.push(line.slice(0, -1));
    else {
      parts.push(line);
      out.push({ text: parts.join(" ").slice(0, 4000), index: start });
      parts = [];
    }
  }
  if (parts.length) out.push({ text: parts.join(" ").slice(0, 4000), index: start });
  return out;
}

/** The variables an ENV or ARG instruction declares. */
function variablesOf(argument, instruction) {
  const words = argument.trim();
  if (instruction === "ARG" || !words.includes("=")) {
    const m = VARIABLE.exec(words);
    return m ? [m[1]] : [];
  }
  const out = [];
  for (const w of words.split(BLANKS)) {
    const m = VARIABLE.exec(w);
    if (m && w.includes("=")) out.push(m[1]);
  }
  return out;
}

/** The stages of one Dockerfile. */
function stagesOf(text, file) {
  const index = textIndex(text);
  const stages = [];
  let stage = null;
  for (const l of logicalLines(text)) {
    const m = INSTRUCTION.exec(l.text);
    if (!m) continue;
    const instruction = m[1].toUpperCase();
    const argument = m[2];
    if (instruction === "FROM") {
      const from = FROM.exec(argument.trim());
      if (!from) continue;
      const { image, tag } = imageOf(from[1]);
      stage = {
        kind: "image",
        provider: "docker",
        type: "stage",
        name: from[2] ?? image,
        image,
        tag,
        file,
        line: index.lineOf(l.index),
        ports: [],
        root: true,
        variables: [],
      };
      stages.push(stage);
    } else if (!stage) continue;
    else if (instruction === "EXPOSE") {
      for (const p of argument.trim().split(BLANKS)) {
        const port = PORT.exec(p);
        if (port) stage.ports.push(Number(port[1]));
      }
    } else if (instruction === "USER") {
      // `USER $APP_USER`: a build argument decides, which the file does not tell (its ARG's default may be overridden).
      const user = argument.trim().split(":")[0];
      stage.root = user.startsWith("$") ? undefined : user === "root" || user === "0";
    } else if (instruction === "ENV" || instruction === "ARG")
      stage.variables.push(...variablesOf(argument, instruction));
  }
  return stages;
}

export default {
  name: "dockerfile",
  files: FILES,
  infra({ sources }) {
    const items = [];
    for (const [file, text] of sources) items.push(...stagesOf(text, file));
    return items;
  },
};
