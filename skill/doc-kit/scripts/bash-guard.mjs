#!/usr/bin/env node
// The agents' Bash guard: the Claude Code hook (PreToolUse, matcher Bash) of the skill's agents that have Bash —
// doc-kit-writer, doc-kit-analyst, doc-kit-reviewer. Their definitions name this file in Claude Code's exec form,
// `command: node` and `args: ["<skill>/scripts/bash-guard.mjs"]` (no shell parses the path), with `onFailure: block`;
// `doc-kit skill install` writes the skill's path in them. What it lets through and why: bash-decision.mjs.
//
// This file is the hook's entry, and nothing else: it exports nothing and checks nothing of how it was started.
// However node is given it — its path, through a link or a junction, a file URL with a query, an import — it reads
// Claude Code's input on stdin, decides, and exits: 0 lets the command through, 2 refuses it (the reason on stderr).
// The tests import the decision's module, never this one. Claude Code blocks a command on exit code 2, so the hook
// fails closed: it imports nothing before it runs, and loads its decision inside a try (a module missing, broken or
// that throws: 2, with the words below, in both languages, since the skill's messages may be what failed); the
// decision refuses what it cannot read or load, and an unexpected error, with 2. What this file cannot catch (no node,
// this file missing or broken: node ends with 1) the agents' `onFailure: block` refuses. A decision that never comes
// (a module or the decision that never settles: node's event loop empties) refuses too: the exit code is 2 from the
// first line, only the decision's explicit 0 ends with 0, and every decision ends the process itself (process.exit),
// so that node's `beforeExit` means none was made.

// First of all: a process that ends without a decision ends with 2, never with node's 0.
process.exitCode = 2;

const LOAD_FAILED =
  "✖ doc-kit guard: command refused — the guard could not load its files: reinstall the skill (doc-kit skill install)\n" +
  "✖ garde de doc-kit : commande refusée — la garde n'a pas pu charger ses fichiers : réinstallez le skill (doc-kit skill install)\n";
const CRASHED =
  "✖ doc-kit guard: command refused — an unexpected error in the guard: refused, to be safe\n" +
  "✖ garde de doc-kit : commande refusée — une erreur inattendue dans la garde : refusé, par prudence\n";
const UNDECIDED =
  "✖ doc-kit guard: command refused — the guard ended without a decision: refused, to be safe\n" +
  "✖ garde de doc-kit : commande refusée — la garde s'est arrêtée sans décision : refusé, par prudence\n";

/** Refuses with `text`, exit code 2. @param {string} text */
const refuse = (text) => () => {
  process.stderr.write(text);
  process.exit(2);
};

/** The decision's hook on Claude Code's input (bash-decision.mjs guard): its exit code, 2 when it cannot load. */
async function decide(/** @type {string} */ raw) {
  let guard;
  try {
    ({ guard } = await import("./bash-decision.mjs"));
  } catch {
    guard = null;
  }
  if (typeof guard !== "function") return refuse(LOAD_FAILED)();
  // Only an explicit 0 lets the command through: anything else the decision returns refuses.
  return process.exit((await guard(raw)) === 0 ? 0 : 2);
}

process.on("uncaughtException", refuse(CRASHED));
process.on("unhandledRejection", refuse(CRASHED));
process.on("beforeExit", refuse(UNDECIDED));
let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("error", refuse(CRASHED));
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => decide(raw).catch(refuse(CRASHED)));
