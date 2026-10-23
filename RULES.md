# Rules of the kit

*[Version française](RULES.fr.md)*

These rules apply to every change and every release. They come from the audit of 2026-10-03 (AUDIT.md): each
problem fixed then has a rule here and, wherever a machine can check it, a test that fails if it comes back. A
change that breaks a rule needs a written reason in its pull request, and the rule or its test is updated in the
same change.

**Enforced by:**
- `test/unit/security.test.mjs`, run by `npm test` and on its own by `npm run test:security`;
- `.github/workflows/ci.yml`: tests on Linux, Windows and macOS, the security rules, and `npm audit`;
- the checklist of `.github/pull_request_template.md`;
- the review instructions in `CLAUDE.md`, and the `kit-reviewer` agent (`.claude/agents/`).

## Security

| # | Rule | Checked by |
|---|---|---|
| S1 | **Never a shell.** Processes are started with `spawn`/`spawnSync` and an array of arguments. Never `shell: true`, `exec`, `execSync`, `eval` or `new Function`. The one exception is `npm install` with no outside argument, on Windows. | `security.test.mjs` › source rules |
| S2 | **git only through `engine/util/safe-git.mjs`.** Use `ctx.exec` (hardened by `defaultExec`) or `safeGitArgs` + `riskyGitConfig` + `resolveOnPath`. Never `spawnSync("git", …)` directly. git stays read-only: `rev-parse`, `show`, `diff`, `log`, `ls-files`, `check-ignore` — with one exception, the shared repositories of the sources (`doc-kit inputs fetch`, ARCHITECTURE.md §6.19): `clone`, `fetch` and `checkout` only in `engine/inputs/repos.mjs`, into `.doc-kit/inputs/repos/`, the address checked by `isSafeRepoUrl` (https without credentials, ssh) and every clone hardened from its creation (no hook, links as files, no `ext`/`file` transport, no submodule, objects checked, no password prompt, the name of the clone checked before its folder is ever removed). | source rules, git tests, `inputs.test.mjs` |
| S3 | **A git reference from a file or an option is checked** with `isSafeRef` and placed after `--end-of-options`. | `sync.test.mjs`, `security.test.mjs` |
| S4 | **The application folder is untrusted.** Binaries are resolved on the `PATH`, never in the folder read. Nothing from the application is executed, imported or `require`d. A new external tool is documented in SECURITY.md with what it executes. | review, SECURITY.md |
| S5 | **Every expression that scans untrusted text stays linear.** No nested quantifiers on overlapping classes, such as `(\s*x?\s*)+`. A new detector, heuristic or extractor is added to `test/tools/redos-worker.mjs`, which must finish under 300 ms per check. The files that measure time run after the others, one at a time, and one that fails runs once more alone (`test/tools/run-plan.mjs`): a real growth fails twice, a noisy measure does not. | ReDoS test |
| S6 | **Read-only captures.** A request the kit lets through is `GET`/`HEAD`/`OPTIONS`. A navigation is checked hop by hop before redirects are followed, and `capture.forbidden` is tested on every form of the path (`pathForms`). Any new way to open a URL (pop-up, new page, action) goes through the guard. | `capture.test.mjs`, e2e `capture.test.mjs` |
| S7 | **A secret is never stored, printed or exported.** `facts` keeps names and places, never values. Reports show at most a redacted prefix. Third-party reports are kept through an allowlist of fields (`--redact`, `NORMALISE` in `engine/facts/tools.mjs`). `export` leaves out sessions, keys, credentials and environment files at any depth. | `security.test.mjs` › export, `export.test.mjs`, `facts.test.mjs` › allowlist of the tools |
| S8 | **The local server only answers itself.** It binds to `127.0.0.1` and checks `Host` (`isLocalHost`). It has no write endpoint and serves no file from disk. | `security.test.mjs` › dev server |
| S9 | **Generated HTML escapes everything it takes from content or data** (`esc`, and `<` escaped in inline JSON). Raw HTML and SVG from the content stay the author's responsibility (SECURITY.md). | snapshot tests, review |
| S10 | **Supply chain.** Runtime dependencies are pinned exactly and kept to the strict minimum; a new one needs a reason in the pull request. Install with `npm ci --ignore-scripts`. Actions are pinned by commit SHA. `npm audit --omit=dev --audit-level=high` stays clean. | CI › security |
| S11 | **SECURITY.md tells the truth.** Each protection it promises has a test. Each known limit is written there. | review |
| S12 | **One network gateway.** Every request the kit itself sends to a package registry goes through `createRegistryClient` (`engine/facts/network.mjs`), the only file that builds their URLs or sends a request to them (the dependency readers only recognise those hosts in lock files); it refuses a private package (`isPrivatePackage`) whatever the caller did, and its timeout covers the whole answer. A private name is never sent (AUDIT.md S13). The one exception is an external tool: with `--tools --network`, osv-scanner downloads its own database (public files, no name sent). | `security.test.mjs` › source rules, `facts.test.mjs` › network |

## Maintainability

| # | Rule |
|---|---|
| M1 | `engine/` never imports `cli/`, never calls `process.exit`, never writes to the console. Errors are `KitError` with an exit code and an i18n key. The import, exit and console parts are checked by `test/unit/layers.test.mjs`. |
| M2 | Every message exists in English and in French (`i18n/en`, `i18n/fr`). The parity test passes. |
| M3 | Every feature or fix comes with its test; a security fix comes with the test that would have caught it. Never skip, disable or weaken a test to get to green. |
| M4 | Tests do not depend on the machine: no real network, no real git, no installed Chromium in unit tests; use the context seams (`exec`, `fetch`, `launch`, `commit`, `chromium`). |
| M5 | A new function stays under about 80 lines; a JavaScript file of `engine/`, `cli/`, `adapters/` or `skill/` has at most 600 lines (tests are exempt). Past that, split it. Do not add to `build()`, `runAudit()` or `runCaptures()`: extract a step. The files already over 600 lines are held at their size by `test/unit/sizes.test.mjs`: they only shrink. |
| M6 | One helper per job. Before writing a parser, a toc reader or a git call, look for the existing one (`engine/project`, `engine/util`). |
| M7 | No magic delay: a Playwright timeout or wait is a named constant, and waiting on a condition beats a fixed sleep. |
| M8 | References point to versioned documents (ARCHITECTURE.md §, RULES.md), never to a document outside the repository. |
| M9 | Every change gets a CHANGELOG entry under `[Unreleased]`; a release bumps `package.json`, moves the entries under its version and is tagged `vX.Y.Z`. Commits are small and say what they change. |
| M10 | No dead surface: a name is exported only when another file imports it (the public entry points of `package.json` `exports` aside). Checked by `test/unit/exports.test.mjs`. |
| M11 | The JavaScript is formatted by Prettier (`npm run format`, 120 columns); `npm run format:check` passes before every commit and in the CI. A commit that only reformats is listed in `.git-blame-ignore-revs`. |
| M12 | `npm run lint` (ESLint, `eslint.config.mjs`) passes: no error, and no more warnings than its `--max-warnings` ceiling. The ceiling counts the functions still over the size rules of M5; it only ever goes down, with the functions split. |
| M13 | `npm run typecheck` (TypeScript on the JSDoc, `tsconfig.json`, nothing compiled) passes with no error. A JSDoc that no longer matches the code is fixed, never silenced: no `@ts-ignore`; a `@ts-expect-error` only with its reason. |
| M14 | The folders of `engine/` import one another without a cycle: from the bottom up, `core`, `capture`, `check`, `facts`, `sync`, `build`. A module two folders share moves to `engine/core/`. Checked by `test/unit/layers.test.mjs`. |
| M15 | The skill stays coherent: every brief exists in English and French with the same front matter and placeholders; every agent type is used and its description names the briefs it runs; `DEFAULT_ROUTING` names real briefs and matches the model table of `SKILL.md`. Checked by `test/unit/skill-briefs.test.mjs`. |
| M16 | A rule of a reader of untrusted manifests (`engine/facts/deps/`, `engine/facts/declarations.mjs`, `engine/facts/network.mjs`) has its mutant in `test/mutations/<module>.mjs`: the rule taken out, which its tests must catch. A fix there adds the mutant of what it fixes. `npm run mutate` reports no surviving mutant before the pull request; `npm test` checks that every mutant still finds, once, the code it changes (`test/unit/mutations.test.mjs`): a refactor moves its mutants with the code. |

## Before every release

1. `npm test`, `npm run test:e2e` and `npm run test:security` pass on Linux, Windows and macOS (CI is green).
2. `npm audit --omit=dev --audit-level=high` is clean; dependency updates have been read, not just accepted.
3. AUDIT.md: findings marked fixed in this version have their test; open ones are still listed.
4. SECURITY.md matches the code (protections and limits).
5. CHANGELOG: `[Unreleased]` moved under the new version, with a **Security** section when one applies.
6. `package.json` version bumped, and the tag `vX.Y.Z` pushed.
