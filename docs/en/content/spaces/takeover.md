## In short

The takeover dossier is what a team needs to take over an application — especially one written largely by AI
assistants ("vibe-coded"), whose usual risks are:

| Risk | Where it usually hides |
|---|---|
| Missing access control | A route without a tenant or row-level check, filtering left to the UI alone |
| Secrets in the code or the client | A key committed, or sent to the browser instead of read on the server |
| Packages that do not exist | A name an assistant invented, imported but never published |
| Duplicated or dead code | The same logic copied instead of shared, or kept after it stopped being called |
| Missing or misleading tests | A test that asserts nothing, or a critical flow with none |
| Agent instruction files as a hidden specification | `AGENTS.md`, `CLAUDE.md` and the like, never read by the team that takes over |

Its pages live in the Develop space — architecture, journeys, security, risks, maintenance — but for the operating
ones, read by operators: the technical architecture document, the runbook, variables, resources, access and
ownership sit in the Operate part of the Administer space. Every claim of the dossier is backed by a proof
(`file:line`), or marked as deduced or unknown — never asserted on trust; the audit expects those proofs on the
pages of the Develop space.

## Where to start

:::steps
1. **Run `doc-kit facts`**: it reads the code once, costs no judgement, and gives every other page something to
   build on.
2. **Write the access and ownership page**: who owns what is often the longest thread to pull (a registrar
   account, a payment provider), and the handover cannot close until it is.
3. **Build the pages the facts prefill**: API surface, data model, dependencies, agent instructions — `doc-kit new
   --prefill` does the mechanical part.
4. **Add what facts cannot see**: the code map, the tests review, the threat model — read the code, then write.
5. **Consolidate the risk register last**: once the other pages exist, their gaps become numbered findings.
:::

## Reading the code automatically: `doc-kit facts`

```bash
doc-kit facts                      # all nine sources
doc-kit facts --source dependencies --network
doc-kit facts --tools              # also gitleaks, osv-scanner, syft, knip, when installed
```

| Source | What it reads | Never |
|---|---|---|
| `dependencies` | Every manifest and lock file found under the application, up to 4 folders deep | — |
| `env` | Names read by the code, and by an example `.env` file | A value |
| `api` | Route handlers: Next.js, FastAPI, Express — with `auth` and `guards` (see below) | — |
| `db` | Tables, columns, row-level security and policies: Prisma, SQLAlchemy, SQL migrations | — |
| `behaviours` | How a search, a filter, an order, a page, a form behave: hints read in the code of every stack (array filters, Prisma, SQL, Django, SQLAlchemy, zod, pydantic, HTML forms, OpenAPI), for the feature sheets | A string as written, a test, a comment |
| `agents` | `AGENTS.md`, `CLAUDE.md` and the like: size, and any hidden Unicode character | — |
| `secrets` | File and rule of a likely secret | The value |
| `security` | Eleven OWASP Top 10 heuristics: rule, file, line, severity | A value |
| `quality` | Functions, complexity, duplication, TODOs, per file; A-to-E ratings overall | — |
| `tests` | A rough count per file, and a coverage report when one exists | — |

`api`'s `auth` (`"none"` \| `"user"` \| `"role"` \| `"unknown"`) and `guards` (the guard names found) feed the
security review's static access matrix, and what `doc-kit probe` expects from each route when it checks a running
local or demo instance: see [Security and maintainability reviews](#/spaces/reviews).

Each source writes `facts/<source>.json` in the documentation project, **never in the application**; the same code
run against the same commit writes the same file, so it is safe to commit alongside the pages it feeds.
`--network` only sends a public dependency's name to its registry, to check it exists and how far behind it is —
never the name of a private package (one of the application's own packages, a scope with its own registry, a
private index, a workspace, local or privately hosted package), read from the application, its lock files, every
folder down to each manifest, and your own npm, yarn, bun, pip and uv configuration;
`--tools` runs whichever of `gitleaks`, `osv-scanner`, `syft` and `knip` are on the `PATH`, each into its own
`facts/tool-<name>.json` with a status (`ok`, `findings`, `failed`, `missing`) and only the fields that matter
(rule, file, line, package, version…), never a secret or a line of code. `osv-scanner` runs offline: its database
is downloaded only with `--network`. Without `app.dir` configured, `doc-kit facts` refuses to run.

## Citing facts without re-typing them: `::facts`

```markdown
::facts{source="api" columns="method,route,file"}
```

Builds a table from `facts/<source>.json` at build time — one row per item, the listed columns, a caption with the
generation date and the application's commit. An unknown source or column fails a strict build; the ten takeover
page types are built around this directive: [Example · API surface](#/examples/api-surface) and the other
takeover examples show it completed by hand with authentication, role and tenant isolation.

## Say what you know, what you infer, what remains open

```markdown
The route accepts any signed-in user, from any region ([[verified lib/orders.ts:42]]); whether every caller
actually goes through it first is [[unknown]].
```

| Badge | Means |
|---|---|
| `[[verified …]]` | Checked directly in the code; the proof after the word is optional |
| `[[deduced …]]` | Follows from what was read, without a line-by-line check |
| `[[unknown …]]` | Nobody could tell, inside the time available |

`doc-kit audit` tallies them across the written takeover pages (`claims`: verified, deduced, unknown, and the
verified ratio) and flags a facts file whose recorded commit no longer matches the application's HEAD (`facts`:
stale) — both informative, never blocking a level on their own.

## The risk register

`findings` becomes a **risk register**: besides the numbered finding and its recommendation, each row carries one
combined "Follow-up" column — owner, decision (fix, accept, transfer, avoid), status (open, in progress, done,
accepted), due date. Severity still comes from the finding's family:

| Family | Meaning |
|---|---|
| **C** Critical | A current risk to data security, confidentiality or the product's core promise |
| **I** Important | A real defect, a possible bypass, a broken or misleading feature |
| **M** Minor | Debt, inconsistency, display or hygiene |
| **P** Production | The real configuration differs from what the code expects |
| **N** No effect (**R** in French) | A setting saved, or a screen shown, without the announced effect |

A number never changes once given: [Example · Findings](#/examples/findings) shows the full register, with its
"Follow-up" column, for Acme Orders.

## Access and ownership, first

The `access-ownership` page lists every asset that must change hands — domain, repository, hosting, database,
payment provider, e-mail, **the AI tool accounts used while building the application** — with its owner, where it
lives, how to hand it over, and its status. The page is complete when "Unknown owners" is empty:
[Example · Access and ownership](#/examples/access-ownership) still has two.

## Pitfalls and observed gaps

> [!WARNING] Never fix the application from the documentation folder
> A gap found while writing a takeover page becomes a numbered finding, cited by the pages that found it — never a
> change to the application's code.

> [!NOTE] The AI tools are assets too
> A shared `ci-claude@example.org` login, or a developer's personal Copilot seat with repository write access, are
> ownership rows like any other: the handover checklist is not done while they are still shared.

## Further reading

- [Four spaces, one source](#/spaces/overview): declaring `develop` and `admin`, the export, `counterpart`.
- [Documenting each feature](#/spaces/business): the Product space, the counterpart of this one.
- [Keeping up with the application](#/publish/sync): what to do once the facts and the findings exist.
- [Example · API surface](#/examples/api-surface), [Example · Dependencies](#/examples/dependencies), [Example ·
  Agent instruction files](#/examples/agent-instructions).
