## In short

<!-- guidance: the overall exposure in one paragraph: what matters most, in plain language, before any detail. -->

Example: "Authentication is sound; the main gap is a hardcoded fallback secret and one missing security header."

## Scope and method

<!-- guidance: what was checked (code, and a probe of the local or demo instance — never production), on which commit and version, and what was out of scope. -->

Example: "Checked against the code on commit abc1234, version 2.4.0. Facts first (`facts --source api`, `facts --source security`), then a read-only probe of the local or demo instance (`doc-kit probe`); production is never probed."

## Authentication and sessions

<!-- guidance: how a session is established and kept, its lifetime, and how a role or permission change takes effect (immediately, or only at the next sign-in). Each point verified, deduced or unknown. -->

## Access control

<!-- guidance: the static matrix first (generate it with `doc-kit facts --source api`), then the probe results (`doc-kit probe`, local or demo only) — what answered as expected, and what did not. -->

::facts{source="api" columns="method,route,auth,guards,file"}

| Route | Expected | Anonymous | Finding |
|---|---|---|---|
| `GET /path` | Protected | 401 | none |

## Input handling

<!-- guidance: where user input reaches a template, a shell, a query or a redirect without being checked or escaped first; each one a `security` finding (rule, file, line) or its own proof. -->

## Secrets and configuration

<!-- guidance: where secrets live, whether a default value ships in the code, and configuration left in a development state (debug mode, permissive CORS). -->

## Dependencies

<!-- guidance: optional. Known-vulnerable or unmaintained direct dependencies; cross-reference the `dependencies` page rather than repeating it. -->

## HTTP security headers

<!-- guidance: optional. The probe's header findings (Content-Security-Policy, Strict-Transport-Security, X-Content-Type-Options, frame protection, Referrer-Policy, Permissions-Policy) and the cookies' attributes. -->

## Logging and monitoring

<!-- guidance: optional. What a security-relevant event leaves behind (who approved what, failed sign-ins), and what would go unnoticed today. -->

## Findings

<!-- guidance: one entry per finding, each tied to an OWASP Top 10 or ASVS requirement, verified/deduced/unknown, with a proof and a recommendation; generate the facts first: `doc-kit facts --source security`. Candidates for the risk register. -->

| Finding | OWASP | Proof | Recommendation |
|---|---|---|---|
| Example finding | A07:2021 | [[verified path/file.ts:12]] | What to change |
