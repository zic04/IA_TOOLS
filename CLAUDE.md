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
- `npm run test:security`: the security rules alone.
- `npm run test:e2e`: end-to-end tests, which need Chromium (`npx playwright install chromium`).

## Reviewing a change

Check the diff against RULES.md, security first. A rule broken without a written reason is a blocking finding. So
is a security fix without the test that would have caught it, or a protection promised in SECURITY.md without its
test.
