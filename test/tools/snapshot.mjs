// The snapshot machinery of test/snapshot/ (RULES.md M3): which files exist, when one may be written, how a result is
// compared. Pure: the file system comes in through the caller (test/snapshot/demo-docs.test.mjs), the rules are
// tested in test/unit/snapshot-tools.test.mjs. A snapshot is written only on purpose, with UPDATE=1; a missing one
// is a failure, never a silent first write that would make the test pass whatever the output is.

/** The languages of the demo project that have a snapshot. */
export const SNAPSHOT_LANGUAGES = ["en", "fr"];

/** The file name of the demo project's snapshot in a language. */
export const snapshotName = (language) => `demo-docs.${language}.html`;

/** Every snapshot file the tests of test/snapshot/ use: any other file in __snapshots__ is an orphan. */
export const SNAPSHOT_FILES = SNAPSHOT_LANGUAGES.map(snapshotName);

/** Regeneration is asked for with exactly UPDATE=1 (not UPDATE=0, not an empty or a stray value). */
export const isUpdate = (env) => env.UPDATE === "1";

/**
 * What to do with a result against its snapshot.
 * @param {{ name: string, actual: string, expected: string|null, update: boolean }} p   `expected`: null when the file is missing
 * @returns {{ action: "write"|"ok"|"fail", message?: string }}
 */
export function compareSnapshot({ name, actual, expected, update }) {
  if (update) return { action: "write" };
  if (expected === null) {
    return {
      action: "fail",
      message: `snapshot ${name} is missing (UPDATE=1 to create it, on purpose, and review it)`,
    };
  }
  if (actual === expected) return { action: "ok" };
  let i = 0;
  while (i < actual.length && actual[i] === expected[i]) i++;
  const around = (s) => s.slice(Math.max(0, i - 60), i + 60);
  return {
    action: "fail",
    message: `snapshot ${name} differs at ${i}:\n  expected «${around(expected)}»\n  actual   «${around(actual)}»\n(UPDATE=1 to accept)`,
  };
}

/** What a snapshot must never hold: a path of the machine that built it, or of the person who did. */
export function machineTraces({ roots }) {
  // Each root as the machine writes it and with slashes; a short one ("/", "/tmp") would match plain text.
  const forms = roots.filter((r) => r && r.length >= 5).flatMap((r) => [r, r.replace(/\\/g, "/")]);
  const escaped = forms.map((r) => r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return [
    ...escaped.map((r) => new RegExp(r, "i")),
    /\b[A-Za-z]:\\(?:Users|Windows|Program Files|devops)\b/,
    /(?:^|[\s"'(=])\/(?:home|Users|tmp|var\/folders)\/[\w.-]+/,
  ];
}
