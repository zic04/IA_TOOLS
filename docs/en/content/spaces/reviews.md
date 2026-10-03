## In short

Two reviews, on demand, written the same way as the rest of the takeover space: deterministic facts first, no
guesswork, then an agent writes the page from them.

1. **`security-review`**: authentication, access control, input handling, secrets and configuration, findings
   tied to the OWASP Top 10 — built from the `api` and `security` facts, completed by a read-only check of a
   running instance (`doc-kit probe`).
2. **`maintainability-review`**: ratings (A to E) for duplication, complexity, size and tests, the hotspots that
   combine them, and recommendations ordered by effort — built from the `quality` facts alone, no probe involved.

Both are optional: ask for them at scoping, the same way as any other takeover page.

## The facts behind a security review

```bash
doc-kit facts --source api --source security
```

- `api` now also reports `auth` and `guards` for every route: `"none"` (no guard found), `"user"` (a guard that
  looks like a session check), `"role"` (a guard that looks like a role or permission check, checked first), or
  `"unknown"` (a guard is there, but matches neither pattern — worth a human look). `review.guards.role` and
  `review.guards.user` ([Configuration](#/reference/configuration)) replace the built-in patterns when a project's
  own naming does not match them.
- `security` runs eleven deterministic heuristics over the application's files — never a value, only where a
  pattern was found: `rule`, `file`, `line`, `severity`, `owasp`. `xss.dangerouslySetInnerHTML`, `code.eval`,
  `sql.concat`, `tls.disabled`, `cors.wildcardCredentials`, `debug.enabled`, `jwt.noVerify`, `secret.default`,
  `redirect.open`, and the heuristic `auth.noRateLimit` (severity `info`): a sign-in route with no rate-limit
  decorator or middleware nearby. `::facts{source="api" columns="method,route,auth,guards,file"}` is the static
  access matrix; [Example · Security review](#/examples/security-review) shows it completed by hand.

## The facts behind a maintainability review

```bash
doc-kit facts --source quality
```

Functions, their length and an approximate complexity (1 + branches), duplicated lines (6-line windows, hashed,
found twice or more), and TODOs, per file; a project-wide summary with the four ratings and the tooling found
(linter, types, formatter, CI). [Example · Maintainability review](#/examples/maintainability-review) shows a
function that is both the most complex in the project and the subject of an access-control finding — the usual
story: complexity and risk tend to land in the same place.

## Checking a running instance: `doc-kit probe`

```bash
doc-kit probe                 # anonymous only
doc-kit probe --as manager    # also as a saved role
```

`probe` is a safety-checked GET: security headers, cookies and CORS on `/` and on one API route, then every `GET`
route of `facts/api.json`, once per identity (anonymous, plus one per `--as <role>`, whose session was saved by
[`connect --as <role>`](#/capture/sessions)). Comparing a route's `auth` with what it actually answers gives two
kinds of finding: `probe.unprotected` (a `user` or `role` route answers an anonymous caller with a plain 2xx
instead of 401, 403 or a redirect to sign in) and `probe.publicData` (a `none` route hands an anonymous caller a
list of objects that carry an `email` field — a heuristic, not a certainty). Everything is written to
`facts/probe.json`; the command is informative, exit code 0 whatever it finds.

Three rules are never relaxed by any option:

- **GET and HEAD only.** `probe` never sends a request that could change anything.
- **At most 4 requests a second.** A review is a quick look, not a load test.
- **No response body is ever stored.** A body is read only long enough to decide `probe.publicData`, then
  discarded; `facts/probe.json` never holds what a route actually returned.

## Why `probe` never touches production

`probe` refuses to run (exit code 2) unless the application URL is a loopback address (`localhost`, `127.x`,
`[::1]`) or `capture.target` is `"demo"`; `capture.target: "production"` is refused outright, and no option
overrides it. A security review is exactly the moment someone is most tempted to point a scanner at the real
thing — and exactly the moment a mistake is most expensive: an access-control probe that accidentally exercises a
write path, a rate limit that trips a real alert, a response body that happens to hold a real customer's data. The
kit would rather be checked against a local copy or a prepared demo, same as every screenshot it takes
([Demo or production: capturing safely](#/capture/safety)) — the facts sources (`api`, `security`, `quality`) have
no such restriction, since they only ever read files, never a network.

## Pitfalls and observed gaps

> [!WARNING] `auth` is about authentication, not about tenant isolation
> A route rated `auth: "role"` can still leak another tenant's data if it never scopes its query — `probe` cannot
> see this either, since it has no second tenant to call from. [Example · Security review](#/examples/security-review)
> shows exactly this: a correctly role-guarded route with a missing scope check underneath.

> [!NOTE] A review's findings feed the risk register
> A finding written on a `security-review` or `maintainability-review` page is a candidate for
> [the risk register](#/spaces/takeover~the-risk-register) — move it there once it is confirmed, instead of
> tracking it in two places.

## Further reading

- [Taking over a vibe-coded application](#/spaces/takeover): the other takeover pages, and `doc-kit facts`.
- [Connect and sessions](#/capture/sessions): `connect --as <role>`, the session file.
- [Example · Security review](#/examples/security-review), [Example · Maintainability review](#/examples/maintainability-review).
