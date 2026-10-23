// Runs the kit's mutants (test/mutations/*.mjs, test/tools/mutation.mjs, RULES.md M16). For developers and the
// review of a pull request — never run by `npm test`, which only checks that every mutant still finds its code.
//
//   npm run mutate                      every mutant, two workers
//   npm run mutate -- --only deps-npm   the files of mutants whose name holds "deps-npm"
//   npm run mutate -- --name markLocal  the mutants whose own name holds "markLocal"
//   npm run mutate -- --workers 4
//   npm run mutate:check                no test run: every mutant finds its code once, its tests exist
//
// Each worker works in a copy of the repository under node_modules/.cache/doc-kit-mutants (bare imports resolve by
// walking up to node_modules: no link, no junction, the real tree never written). It first runs the tests unmutated
// (they must pass, a second chance given for a test that measures time), then takes mutants from a shared queue:
// mutate its copy, run the mutant's tests, restore. A mutant is caught when a test fails or the run times out; one
// that survives, or whose code is gone, makes the exit code 1. Processes are started with an array of arguments,
// never a shell (RULES.md S1).
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { loadMutations, checkMutations, applyMutant, runsHere } from "./mutation.mjs";
import { KIT_ROOT } from "./helpers.mjs";

const COPIES = path.join(KIT_ROOT, "node_modules", ".cache", "doc-kit-mutants");
const NOT_COPIED = new Set(["node_modules", ".git", "dist", ".doc-kit"]);
/** The longest a run of tests may take before the mutant is taken as caught (it hangs). */
const RUN_TIMEOUT_MS = 300_000;

/** Runs `node --test` on `tests` in `dir`: the number of failures (null on a time-out) and the failing tests. */
function runTests(dir, tests) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--test", "--test-concurrency=2", "--test-reporter=tap", ...tests], {
      cwd: dir,
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => child.kill(), RUN_TIMEOUT_MS);
    child.on("close", () => {
      clearTimeout(timer);
      const fail = /^# fail (\d+)/m.exec(out)?.[1];
      const failing = [...new Set([...out.matchAll(/^\s+not ok \d+ - (.+)$/gm)].map((m) => m[1]))];
      resolve({ fail: fail === undefined ? null : Number(fail), failing });
    });
  });
}

/** A copy of the repository for one worker (its node_modules left out: the root's is found by walking up). */
function copyTree(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const entry of fs.readdirSync(KIT_ROOT))
    if (!NOT_COPIED.has(entry))
      fs.cpSync(path.join(KIT_ROOT, entry), path.join(dir, entry), {
        recursive: true,
        filter: (src) => !NOT_COPIED.has(path.basename(src)),
      });
}

/** One worker: its copy, its baseline, then the mutants of the queue; each result pushed on `results`. */
async function worker(id, queue, results) {
  const dir = path.join(COPIES, `w${id}`);
  copyTree(dir);
  const tests = [...new Set(queue.flatMap((job) => job.tests))];
  let baseline = await runTests(dir, tests);
  if (baseline.fail !== 0) baseline = await runTests(dir, tests);
  if (baseline.fail !== 0) {
    console.log(`worker ${id}: the tests fail unmutated (${baseline.fail}): ${baseline.failing.join(" | ")}`);
    results.push({ name: `worker ${id} baseline`, outcome: "baseline" });
    return;
  }
  for (let job = queue.shift(); job; job = queue.shift()) {
    const file = path.join(dir, job.target);
    const original = fs.readFileSync(file, "utf8");
    const mutated = applyMutant(original, job);
    if (mutated === null) {
      results.push({ ...job, outcome: "gone" });
      continue;
    }
    fs.writeFileSync(file, mutated);
    const run = await runTests(dir, job.tests);
    fs.writeFileSync(file, original);
    const outcome = run.fail === null ? "timeout" : run.fail > 0 ? "caught" : "survived";
    results.push({ ...job, outcome, failing: run.failing });
    console.log(`${outcome.padEnd(8)} ${job.file} › ${job.name}${run.failing.length ? `  (${run.failing[0]})` : ""}`);
  }
}

async function main(args) {
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
  const workers = args.includes("--workers") ? Number(args[args.indexOf("--workers") + 1]) : 2;
  const files = (await loadMutations()).filter((f) => !only || f.file.includes(only));
  const problems = checkMutations(files);
  for (const p of problems) console.log(`problem: ${p}`);
  if (args.includes("--check")) {
    const count = files.reduce((n, f) => n + f.mutants.length, 0);
    console.log(problems.length ? `${problems.length} problem(s)` : `${count} mutants in ${files.length} files: ready`);
    return problems.length ? 1 : 0;
  }
  if (problems.length) return 1;
  // `--name` may be given several times: the mutants whose name holds any of them.
  const named = args.flatMap((arg, i) => (arg === "--name" ? [args[i + 1]] : []));
  const all = files.flatMap((f) =>
    f.mutants
      .filter((m) => !named.length || named.some((n) => m.name.includes(n)))
      .map((m) => ({ file: f.file, target: f.target, ...m, tests: m.tests ?? f.tests })),
  );
  // A rule that only POSIX filesystems make matter cannot be caught here: listed, not run.
  const skipped = all.filter((m) => !runsHere(m));
  const queue = all.filter((m) => runsHere(m));
  const results = [];
  await Promise.all(Array.from({ length: Math.max(1, workers) }, (_, i) => worker(i, queue, results)));
  const by = (outcome) => results.filter((r) => r.outcome === outcome);
  console.log(
    `\n${by("caught").length} caught, ${by("timeout").length} timed out (caught), ${by("survived").length} survived, ` +
      `${by("gone").length} whose code is gone, ${skipped.length} not run on ${process.platform}`,
  );
  for (const m of skipped) console.log(`  not run here: ${m.file} › ${m.name} (${m.why})`);
  for (const r of [...by("survived"), ...by("gone"), ...by("baseline")])
    console.log(`  ${r.outcome}: ${r.file} › ${r.name}`);
  fs.rmSync(COPIES, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  return by("survived").length || by("gone").length || by("baseline").length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2));
