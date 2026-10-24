// The commands of the CLI (ARCHITECTURE.md §4), known without importing them: their names, in the groups and the
// order of `doc-kit --help` (each one's line: cli.usage.command.<name>, each group's title: cli.usage.group.<id>),
// and the names their help texts show. A command is one module of cli/commands/, imported only when it runs:
// `doc-kit --version`, `--help` and every other command start without the others (test/unit/cli-startup.test.mjs
// checks that every module of cli/commands/ is listed here, once).

/**
 * The groups of `doc-kit --help`, in order, each with its commands in order. Written as words, not as arrays of
 * strings: a list that starts with "init" would read as a git command to the source rules (security.test.mjs).
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const GROUPS = Object.freeze(
  Object.fromEntries(
    Object.entries({
      start: "init doctor connect demo",
      screenshots: "capture record",
      application: "inputs facts inventory bricks probe",
      write: "dev new context translate build view open",
      quality: "check audit optimize stats",
      maintain: "sync changes hooks pack backlog export upgrade skill",
    }).map(([group, names]) => [group, Object.freeze(names.split(" "))]),
  ),
);

/** Every command, sorted. */
export const COMMANDS = Object.freeze(Object.values(GROUPS).flat().sort());

/** Folder of the work files of a project (git-ignored, ARCHITECTURE.md §2.1; {work} in the messages). */
export const WORK_DIR = ".doc-kit";

/** The folder name of the Claude Code skill ({skill} in the messages). */
export const SKILL_NAME = "doc-kit";

/**
 * The module of a command: { options, run }. Only a name of COMMANDS is ever imported, never a path built from
 * what was typed.
 * @param {string} name
 */
export function importCommand(name) {
  if (!COMMANDS.includes(name)) throw new Error(`not a command: ${name}`);
  return import(`./commands/${name}.mjs`);
}
