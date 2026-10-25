# doc-kit: instructions for agents

doc-kit is a Node.js 20+ CLI (ES modules, no build step) that turns a web application into one self-contained HTML
documentation file, and extracts facts for a takeover dossier. Read ARCHITECTURE.md for the contract and
SECURITY.md for the threat model.

## Rules (RULES.md)

Every change follows **RULES.md**; a change that breaks one of its rules says so and why in the pull request. In
short:

- never a shell, `exec`, `eval` or `new Function`; git only through `engine/util/safe-git.mjs` (or `ctx.exec`);
  git references checked with `isSafeRef`;
- the application folder is untrusted: nothing from it is executed; binaries come from the `PATH`;
- a regular expression that scans untrusted text stays linear, and a new one is added to
  `test/tools/redos-worker.mjs`;
- read-only captures: only `GET`/`HEAD`/`OPTIONS`, redirects checked, `capture.forbidden` never requested;
- a secret is never stored, printed or exported;
- `engine/` never imports `cli/`; every message in English and French; every fix with its test; never skip a test.

## Commands

- `npm test`: unit, snapshot and security tests. Run it before every commit.
- `npm run format` (then `npm run format:check`): Prettier, on the kit's JavaScript. Run it before every commit.
- `npm run lint`: ESLint (M12). Run it before every commit; never raise its `--max-warnings` ceiling.
- `npm run typecheck`: TypeScript on the JSDoc (M13). Run it before every commit.
- `npm run mutate` (M16): the mutants of `test/mutations/`, each a rule of the dependency readers, the capture
  guard, the secret detectors or the git hardening taken out, run against their tests (minutes; `-- --only <file>`
  for one file). Run it before a pull request that touches `engine/facts/deps/`, `declarations.mjs`, `network.mjs`,
  `engine/capture/guard.mjs`, `engine/capture/plans.mjs`, `engine/check/secret-values.mjs` or
  `engine/util/safe-git.mjs`; none may survive. `npm test` checks they still apply.
- `npm run test:security`: the security rules alone.
- `npm run test:e2e`: end-to-end tests, which need Chromium (`npx playwright install chromium`).

## Reviewing a change

Check the diff against RULES.md, security first. A rule broken without a written reason is a blocking finding. So
is a security fix without the test that would have caught it, or a protection promised in SECURITY.md without its
test.

## Agents of this repository

Three agents in `.claude/agents/` help keep the kit's code clean; their names start with `kit-` so they never hide
the skill's own `doc-kit-*` agents (installed by `doc-kit skill install`).

- `kit-reviewer` (read-only): reviews a change against RULES.md and the ARCHITECTURE.md contract, security first.
  Run it on the diff before every commit or pull request that touches `engine/`, `cli/`, `adapters/`, `skill/`,
  `schemas/`, `i18n/`, `standard/` or SECURITY.md.
- `kit-test-author`: writes the tests a change needs, following the repository's patterns (writes only under
  `test/`). Use it when a change has no test, or when `kit-reviewer` reports one missing.
- `kit-skill-editor`: applies a change to the skill's texts everywhere they live (briefs in English and French,
  SKILL.md, references, agent definitions, docs).

What a machine can check is a test rather than an agent: `test/unit/layers.test.mjs` (M1, M14),
`test/unit/seams.test.mjs` (M4), `test/unit/sizes.test.mjs` (M5), `test/unit/skill-briefs.test.mjs` (M15),
`test/unit/timing-files.test.mjs` (M17).
