# Capture safety

Read in full before any capture of a real application. These rules come from two real production campaigns (213 and
143 captures). The kit's standard repeats them: `{{KIT_PATH}}/standard/captures.md`.

## 1. Before the campaign

- **Ask where the screenshots are taken** (AskUserQuestion when available): local or demo application, production
  read-only, or none. Production is declared in the configuration, `capture.target: "production"` (`doc-kit init
  --target production --url <address>`): read-only is then mandatory (`readOnly: false` and `<PREFIX>_READONLY=0` are
  refused), `doc-kit demo` is refused, and every `doc-kit capture` prints "PRODUCTION — read-only · N screenshots ·
  <url>" and asks (default No; `--yes` without a terminal, only for a batch the user approved).
- **A written decision by the owner**: capture production, and with which data (real in clear, masked). Example of a
  decision: "every capture on production, without any change, real data in clear". Another: "customer table cells
  masked, users and groups screens in clear". Without a written decision: a demo, or nothing.
- **An authorised person signs in themselves**: ask them whether to open the browser now; `doc-kit connect` opens a
  visible browser; they go through SSO and MFA, then press Enter; the session is written in `.doc-kit/` (ignored by
  git). An agent never types credentials.
- **The session never leaves `.doc-kit/`**: never copied, displayed, quoted in a report, or committed.
  `doc-kit doctor` checks the `.gitignore` and the session's age.
- **Forbidden routes**: read the code of detail pages (see §3) and fill `capture.forbidden` before launching writers.
  `doc-kit doctor` warns while a production target has none.

## 2. The read-only lock

- With a session, or always with `capture.target: "production"`, `doc-kit capture` runs read-only: in the browser, every request other
  than `GET`, `HEAD` or `OPTIONS` is aborted and counted. The last line of the run gives the count of blocked write
  requests. Blocking presence pings or data-loading server actions is normal.
- **No session, no lock** on a local or demo target: never capture a production that is not declared as such
  (`capture.target: "production"` keeps the lock on even with `--no-session`).
- The lock is no licence to click. **Navigation only**: pages, tabs, menus, opening a dialog or an assistant then
  Escape, hover. **Never**: Save, Create, Approve, Delete, Sign, Send, Import, Synchronise, Reindex, Sign out, nor typing
  in a field that saves on its own (editors that auto-save every setting).
- A page that loads its data through a server action or an RPC (a `POST`) shows up incomplete: describe it, do not
  work around it.
- **The only declared exception:** `capture.sessionRefresh` sends one `POST` that renews a short-lived session,
  outside any page, before this lock is checked — accept it only on the owner's written decision (`reason`, at
  least 20 characters) that the endpoint writes nothing else (ARCHITECTURE.md §6.3a).

## 3. Server-side writes while rendering

The lock only filters the browser. A write made **by the server while rendering** a `GET` still happens.
- Real case, generalised: opening an order's detail page created its approval chain when it had none
  (`ensureApprovalChain()` called in `app/(app)/orders/[id]/page.tsx`). The function being idempotent, reopening a
  record that already has a chain writes nothing: the records already opened were listed in the maintaining-the-docs
  page, and only those could be reopened.
- Another case: an administration page started a directory synchronisation when opened; it went through a server
  action (a `POST`), so the lock blocked it.

Procedure, for any detail or administration page:
1. Read its rendering code (page component, loader, controller, the server route that renders it).
2. If a `create…`, `ensure…`, `upsert…`, `update…`, `insert…`, `save…`, `sync…` function is called while rendering: do not
   open the page; describe it from the code; add the route to `capture.forbidden`; report it.
3. If the write is only discovered afterwards: stop at once, record it (which page, which object, which effect), warn the
   orchestrator, who passes the instruction on to every running agent.

## 4. Reading the API to prepare captures

- Only through a Playwright context that loads the session **and** aborts everything but `GET`:

  ```js
  await ctx.route("**/*", (r) =>
    ["GET", "HEAD", "OPTIONS"].includes(r.request().method()) ? r.continue() : r.abort());
  ```
- No `curl`, no script outside this context.
- **A refusal by the agent's permission system is not worked around.** Real case: reading administration endpoints
  (`GET /api/admin/...`) was refused as "secret exploration"; it was not attempted another way, the values were read on
  the administration screens, and the refusal was written in the report.

## 5. Data and secrets in images

- The engine masks GUIDs and the values of the application's local `.env` whose name suggests a URL, tenant, client,
  account or user (`masking.env`), plus the capture's `masks` targets and `masking.patterns`.
- It **does not know production-only values** (gateway URL, index name, partly displayed key, database host). Only a
  review of each image guarantees it: open each `<id>.zones.png` preview and add `masks` when needed. Typical masks:
  database and map-server hosts, internal AI gateways, storage accounts, truncated directory ids.
- Real data visible only if the written decision allows it; never a key, password or token.
- In reports and pages, a secret value is written "(masked)".

## 6. During the campaign

- **Session expired** (redirect to the identity provider's sign-in page or `/login`, a 401): stop, say so in the
  report; the person runs `doc-kit connect` again. `doc-kit capture` checks the session before starting and exits with
  code 3 when it has expired.
- **Shared platform**: 3 to 8 captures per command, no needless loop, no burst of reloads.
- Any surprise (unexpected write, sensitive data visible) stops the agent concerned until a decision is made.

## 7. After the campaign

- `doc-kit connect --forget`: the session is deleted.
- The maintaining-the-docs page: date and version of the campaign, detail pages already opened, forbidden routes.
- `doc-kit check secrets` on the site (values of the `.env`, GUIDs).

## 8. Portal screenshots and infrastructure code (phase 8)

- Portal screenshots (Azure, AWS, GCP…) are provided by the owner; the agent reads them, it never signs in to the
  portal.
- No secret value copied (connection strings, keys, signed URLs): the variable name and "(masked)"; a secret-store
  reference (Azure Key Vault, AWS Secrets Manager, GCP Secret Manager…) is cited by its secret name, never its value.
- Infrastructure code read-only: no `terraform`, `bicep`, `az`, `aws`, `gcloud` or `pulumi` command that plans or
  applies, and no state file opened (`*.tfstate` or equivalent). On a real project, reading the code showed that the
  state holds in clear the secrets it generates (generated passwords, vault secrets): that became a production finding.
