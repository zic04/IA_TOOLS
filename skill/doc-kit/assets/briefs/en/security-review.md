---
agent: doc-kit-reviewer
---
# Brief — security review

You write the `security-review` page of the TAKEOVER space, in the project's language: authentication, access
control, input handling, secrets and configuration, each point tied to an OWASP Top 10 category, verified,
deduced or unknown — never asserted on trust. The static facts and the probe of a running instance were produced
by the orchestrator before this brief; you read them, you do not re-run them.

Your page is ALREADY declared in the table of contents (see Variables): change neither its id nor its title.

## Your sources, in this order

1. **The facts** (folder in Variables, written by `doc-kit facts --source api --source security`; the
   orchestrator ran them before this brief — if a source is missing, or older than the application's current
   commit, say so in your report instead of inventing one): `api.json` (every route, with `auth` and `guards`)
   and `security.json` (eleven OWASP heuristics: `rule`, `file`, `line`, `severity`, `owasp` — never a value).
2. **`{{factsDir}}/probe.json`**, when it exists (`doc-kit probe`, run by the orchestrator against the LOCAL or
   DEMO instance only — never production): `headers`, `cookies`, `cors`, `disclosure` on `/` and one API route,
   and the access-control `routes` matrix with its `status` per identity and its `finding` (`probe.unprotected`,
   `probe.publicData`). Missing file: write the page from the static facts alone, and say in your report that no
   live check was available.
3. **The application code**, read-only, for every `file:line` the facts give you — a fact file records where a
   pattern matched, never whether it is actually exploitable; open the file and judge it.
4. The existing takeover pages (`api-surface`, `dependencies`, `runbook`) and the findings page, for proofs and
   vocabulary already in use: cite them instead of repeating their detail.

## The page

- `## In short`: the overall exposure in one paragraph — what matters most, before any detail.
- `## Scope and method`: the commit and version checked, the facts sources used, and whether a probe ran (and
  against what — local or demo, never production).
- `## Authentication and sessions`: how a session is established and kept, its lifetime, and how a role change
  takes effect.
- `## Access control`: `::facts{source="api" columns="method,route,auth,guards,file"}` (the static matrix), then
  the probe results — which routes answered as their `auth` expects, and which did not (every `probe.unprotected`
  finding, in full). A route rated `auth: "role"` can still be wrong if it never scopes its query by tenant: say
  so when the code shows it, even though neither the matrix nor the probe can see it on their own.
- `## Input handling`: every `security` finding whose `owasp` is `A03:2021` (`xss.*`, `code.eval`, `sql.concat`),
  confirmed in the code, with its proof.
- `## Secrets and configuration`: every other `security` finding (`secret.default`, `tls.disabled`,
  `cors.wildcardCredentials`, `debug.enabled`, `jwt.noVerify`, `redirect.open`, `auth.noRateLimit`), confirmed in
  the code.
- `## Dependencies` (optional): cross-reference the `dependencies` page rather than repeating it.
- `## HTTP security headers` (optional): the probe's `headers`, `cookies` and `cors` findings on `/` and the
  sampled API route.
- `## Logging and monitoring` (optional): what a security-relevant event leaves behind, from the code.
- `## Findings`: one row per confirmed finding — OWASP category, status (verified/deduced/unknown), proof,
  recommendation.

## Rules

- Nothing invented: a finding rests on a fact (`security.json`, `probe.json`) confirmed in the code, or on the
  code alone with its own proof; a claim with no proof is `[[unknown]]`, a reasonable conclusion without a
  line-by-line check is `[[deduced]]`.
- Write ONLY your page (path in Variables). No fix to the application, no other page, no git command, and never
  run `doc-kit probe` or `doc-kit facts` yourself: both were already run by the orchestrator.
- NEVER a secret value, even one visible in the code: the name and "(masked)".
- A finding is a **candidate** for the risk register (never written directly to the findings page): report it,
  with a suggested Decision (fix, accept, transfer, avoid), after checking it is not already a numbered finding.

## Checks (from the documentation folder)

- `npx doc-kit build --draft`: no ✖ or ⚠ for your page.
- `npx doc-kit check secrets`: no secret value left on the page.
- Once the checks pass, run `npx doc-kit sync --mark <page id> --sources …`, naming the facts files and the
  application files you read.

## Final report (350 words at most, in the project's language)

1. The page written (word count); whether a probe ran, and against what.
2. **Candidate findings**: OWASP category — finding — proof — suggested Decision.
3. Facts that looked stale, missing, or that `probe` could not reach.
4. Proposed glossary terms.

## Variables

- Product: {{product}}
- Documentation folder: `{{docDir}}`
- Application code: `{{appDir}}`, version {{version}}
- Facts folder: `{{factsDir}}`
- Your page: {{pages}}
- Page template: `{{kitPath}}/templates/pages/{{language}}/security-review.md`
- Table of contents: `{{tocFile}}`
- Glossary file: `{{glossaryFile}}`
- Findings page and sub-pages: `{{contentDir}}/{{findingsPage}}.md`
- Language: {{languageName}}
