# Pitfalls met and their fixes

Each pitfall cost time on a real project. Form: **pitfall** — what you observe. → What to do.

Contents: [Vibe-coded applications](#vibe-coded-applications) · [Windows and shell](#windows-and-shell) ·
[Captures](#captures) · [Production](#production) · [Writing](#writing) · [Orchestration](#orchestration) ·
[Delivery](#delivery)

## Vibe-coded applications

A vibe-coded application — written largely by an AI assistant from natural-language prompts — tends to fail the
same way twice. A 2025 study of AI-generated coding tasks found an OWASP Top 10 vulnerability in 45 % of them;
none of that is specific to one model or one tool, so check for it on every takeover, whatever generated the
code. The `code-health` brief (ARCHITECTURE.md §6.9, `doc-kit facts`) exists to make these checks routine rather
than a one-off review.

- **Access control missing, or only on the client** — a page hides a button with CSS or a client-side `if`, but
  the API behind it accepts the same request from anyone signed in. → For every route in `facts/api.json`,
  open the handler: is there a server-side check, not just a UI one? List the gaps on `api-surface`'s "Gaps"
  section, each a numbered finding.
- **Row-level security absent** — a multi-tenant table with no RLS policy: any authenticated query can read
  every tenant's rows, only the application's own (often incomplete) filters stand in the way. Frequent on
  Supabase and Lovable projects, where RLS is opt-in and easy to forget enabling. → `facts/db.json` records
  `rls` and `policies` per table; a tenant-scoped table with neither is a candidate finding on `api-surface`'s
  "Database access rules".
- **A secret in the code, or sent to the browser** — an API key hard-coded instead of read from the environment,
  or a server-only secret included in a client bundle because a framework's "public" prefix convention was
  misunderstood. → `facts/secrets.json` and `facts/env.json` (never a value); check a browser-sent variable
  against the server/client boundary of the framework in use.
- **A package that does not exist ("slopsquatting")** — an assistant invents a plausible package name that was
  never published; an attacker can register it later and ship anything. → `doc-kit facts --source dependencies
  --network` checks each direct dependency against its public registry; list every `exists: false` on
  `dependencies`'s "Packages that do not exist", and anything the facts could not check (no `--network`) as "to
  confirm".
- **Code duplicated** — the same validation or calculation copied into three handlers instead of shared, each
  one drifting a little further from the others. → `code-map`'s "Duplicated or dead code"; cite each copy by
  `file:line`.
- **Tests absent or misleading** — an assistant asked to "add tests" sometimes writes ones that always pass: an
  assertion on a constant, a mocked call never checked, no assertion at all. → `facts/tests.json` counts tests,
  it does not judge them; open a sample, cite a test that tests nothing on `tests-quality`'s "Tests that test
  nothing", and check that the critical flows (payment, approval, sign-in) have one that could actually fail.
- **Agent instructions as a hidden specification, sometimes with invisible characters** — `AGENTS.md`,
  `CLAUDE.md` or a `.cursorrules` file can carry a real behavioural rule that exists nowhere else, or, more
  rarely, characters invisible to a human reviewer (zero-width joiners, bidi overrides) that steer an agent
  without a human noticing — a known prompt-injection technique. → `doc-kit facts --source agents` lists every
  file and flags `hidden` characters by codepoint; check each rule against the code (confirmed, obsolete,
  contradicted) on `agent-instructions`.
- **Dependencies out of date** — a framework or library several major versions behind, often because an
  assistant pinned whatever version it was trained on and nothing since has prompted an upgrade. →
  `dependencies`'s "Out of date", from `facts/dependencies.json` and the registry's current version.
- **No owner of the accounts** — the domain, the database, the hosting account and the AI tool subscriptions
  were set up by whoever was experimenting that week, with nobody formally responsible. → the `access-ownership`
  brief and page: every asset gets an Owner or an explicit "to ask", and a question list for the real owner.

## Windows and shell

## Windows and shell

- **Git Bash and ids starting with "/"** — an argument like `/use/orders` becomes `C:/Program Files/Git/use/orders`.
  → Pass page ids without a leading "/" (they have none: `use/orders/list`); for a route, prefix the command with
  `MSYS_NO_PATHCONV=1`.
- **A space in the path** — paths cut in two, a dynamic `import()` that fails. → Always quote paths; in code, use
  `pathToFileURL` for every dynamic import, never a hand-built `file://` URL.
- **Apostrophes in labels** — a target `{ text: "Approve the customer's order" }` finds nothing: the labels file mixes
  straight and typographic apostrophes (on one real project, 502 straight and 7 typographic in the same file). → Copy
  the exact character from the labels file, or target with a regular expression (`/customer.s order/`).
- **Apostrophes and backslashes in a command** — `node -e '…'` or a single-quoted heredoc stops at the first apostrophe
  of a text; the backslashes of a Windows path or a regular expression (`\s`) can vanish on the way (seen while writing
  this skill: a version pattern and a kit path came out truncated). → Write files and scripts with the file-writing
  tool, then run them; do not pass code through the shell.
- **Environment variables** — `ACME_SESSION=… node …` works in Git Bash, not in PowerShell. → Prefer `doc-kit` options
  and `doc.config.mjs`; in PowerShell, `$env:NAME = "…"`.

## Captures

- **Maps, streams and `networkidle`** — the wait never ends: a tile or event stream never stops. → Wait for `load`
  then a delay (`delay: 7000` for a map).
- **Map framing not reproducible** — the mouse wheel is fragile as soon as the view changes. → Frame through URL
  parameters (`capture.map: { x, y, z }`, plan field `view`); the app may need an option, turned on by the setup
  script, to honour them.
- **Zones overwritten in parallel** — one shared zones file cannot take two simultaneous captures. → One file per
  capture (`images/zones/<id>.json`): that is what the engine does; never merge them.
- **Number badges hiding text** — the badge sits left of the zone; when the zone touches the left edge of the frame
  (less than 32 px), it moves to the inner corner and hides the start of the text. → Give the frame some margin
  (`margin`, 34 px by default), target an element that leaves room, check with `doc-kit view <page> --tour 2`.
- **Legend and zones out of step** — the build refuses ("N zone(s) captured but M item(s) in the legend"). → After
  each recapture, recount the `:::screen` list. `::capture` is refused for a capture with zones: use `:::screen`.
- **Zone on the wrong element** — several "Save" buttons, a label repeated in the menu. → `exact: true`, `within`
  (parent target), `nth`, `up`; look at each `.zones.png`.
- **Panel cut off** — the screen is taller than the window. → `viewport: { height: 2200 }` and `frame` on the panel; the
  `main` target for the area without the menu.
- **Editor that auto-saves** — changing a value to show it writes it to the database. → Change nothing; show the
  existing state, or prepare the value in the demo setup.
- **AI assistant missing in the demo** — the floating assistant does not appear without a key. → In the demo setup,
  point the AI at a fake provider.
- **A defect visible on screen** (for example third-party map tiles watermarked because an API key is missing) — the
  temptation to hide it. → Capture it as is and document it as a finding.

## Production

- **Server-side write while rendering** — opening an order's detail page created its approval chain despite the lock.
  → Read the page's server code before opening a detail page; `capture.forbidden`; list the pages already opened in
  the maintaining-the-docs page.
- **Empty page in read-only mode** — its data comes through a server action (`POST`), which is blocked. → Describe it
  from the code; do not bypass the lock (dashboard counters, directory synchronisation).
- **Expired session** — redirect to sign-in or 401, captures of the sign-in page. → Stop, report; the person runs
  `doc-kit connect` again.
- **Permission system refusal** — reading administration endpoints refused as "secret exploration". → Do not change
  the means; read the values on screen; write the refusal in the report.
- **Incomplete masking** — a gateway URL or a database host visible: masking only knows the local `.env`. → Review
  every image, add `masks`.
- **Shared platform** — bursts of captures. → 3 to 8 captures per command.

## Writing

- **Outdated existing documentation** — a roles document (8 roles, 11 permissions; the code: 9 and 17), a screen
  inventory of the mock-up, a product guide describing 9 tabs instead of 15. → Cite it as a source to stop following,
  never copy it; re-check everything in the code.
- **Wrong code comment** — a comment said that uploading a file starts the processing; the code does not. → The code
  that runs is authoritative; the gap becomes a finding.
- **Permissions in the database different from the code** — the matrix is editable on screen; in production a role
  held 13 permissions instead of 6. → Document the code's defaults and, separately, what was observed in production.
- **"Hidden" is not "removed"** — an amount hidden on screen may still be sent to the browser. → Write "removed on the
  server" only after seeing it in the server code.
- **Assumed error page** — in a Next.js app, `app/(app)/error.tsx` does not catch errors thrown by
  `app/(app)/layout.tsx`; a disabled account saw the framework's generic error page. → For a symptom, check which
  error boundary really catches it.
- **Pages too long** — unreadable, owner's feedback. → Sub-pages beyond about 2,000 words, while writing rather than
  afterwards (37 sub-pages were added after the fact on one site).
- **Links after a split** — "below" now pointing to another page, anchors not found. → Replace with a link; the build
  reports anchors.
- **Anchor to another writer's page** — their headings change during parallel writing. → Link without an anchor to
  other writers' pages; anchors only to your own pages.
- **Tables overflowing** — at 1,440 px, code columns push the page. → `doc-kit check tables`; shorten cells, split the
  table.
- **Line numbers drifting** — proofs age with the code. → State the checked version on the findings page ("line numbers
  of version 2.3.1"); re-check at each release.
- **Diagrams unreadable in dark mode** — hard-coded colour. → The site's `d-*` diagram classes only (table in
  `{{KIT_PATH}}/standard/writing.md`), `<marker>` ids prefixed by the diagram, text from 11 to 14 px, review in light and dark.

## Orchestration

- **Central files edited in parallel** — two agents writing the toc or the glossary at the same time lose one's work.
  → Reserved files; proposals through the report.
- **Duplicates between writers** — the same defect found by two agents from two angles (5 duplicates out of 37
  candidates on one round). → `consolidation.mjs duplicates`, written decision.
- **Instruction discovered during a wave** — agents already running do not know it. → Add it to the brief and send it
  to the running agents.
- **Explore agent cannot write** — the inventory stays in the report. → The orchestrator saves it in
  `.doc-kit/inventory-<slug>.md`.
- **Report too long** — the consolidation becomes unreadable. → Bounded report (300 to 350 words), details in a fact
  sheet `.doc-kit/<code>.md` when needed.

## Delivery

- **File too heavy** — 34 MB on one site, impossible to e-mail. → `doc-kit optimize` (re-encodes images above the
  threshold, keeps the new version only if it saves at least 20 %); share through the repository or a file share.
- **Forgotten session** — a production session file left on the machine gives access to the application while it is
  valid (30 days on one site). → `doc-kit connect --forget`, an item of the delivery checklist.
- **Production export in the repository** — a production configuration export had been committed. → Git-ignore it
  before producing it.
- **Unknown capture date** — the version shown is the build's, not the campaign's. → The kit writes `version` and
  `captured` in `images/zones/<id>.json`; record the campaign on the maintaining-the-docs page.
