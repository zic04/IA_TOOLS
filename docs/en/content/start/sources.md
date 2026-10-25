## The goal

Give the kit everything a team already has about the application, besides the code of `app.dir`: other code
(services, libraries, the **infrastructure code**), its **shared repositories** (GitHub, GitLab, Azure Repos), the
application **online** by environment, the documents (a **technical architecture document** in Word or PDF,
specifications, diagrams), the **collaborative spaces** (Confluence, SharePoint, Teams, Notion) and the
**backlog**. The kit reads them so that the documentation starts from what is known — and checks it against the
code.

The sources live in `inputs.json`, at the root of the documentation project. `doc-kit init` asks for them (all
optional), `doc-kit inputs add` declares one at any time, `doc-kit inputs` shows their state.

## Who does what

| Who | Does |
|---|---|
| You | Declare the sources (`init` or `inputs add`); keep your git access (credential manager, SSH key) |
| The kit | Clones or updates the repositories (`inputs fetch`), converts the documents (`inputs ingest`), says what is out of date (`inputs`, `bricks`) |
| The skill's agents | Read the converted documents and, through the connectors of the session (Claude Code, Claude Cowork), the pages you gave by their address — every statement checked against the code |

## Step 1 — Declare the sources

```text
doc-kit inputs add code https://github.com/acme/orders-infra.git --role infra
doc-kit inputs add code ../payments-service --role lib
doc-kit inputs add app https://orders.acme.example --env prod --read-only
doc-kit inputs add document docs/DAT-orders-v2.docx --kind dat --title "DAT v2.3"
doc-kit inputs add document https://acme.atlassian.net/wiki/spaces/ORD/pages/123 --kind spec
doc-kit inputs add workspace https://acme.sharepoint.com/sites/orders
doc-kit inputs add backlog https://dev.azure.com/acme/Orders/_backlogs
```

A repository address is **https without any user or token** (git asks your credential manager), `ssh://…` or
`git@host:path`. The tool of a space or a backlog is guessed from its address (`--tool` to say it).

## Step 2 — Fetch the repositories

```text
doc-kit inputs fetch
```

Each repository is cloned into `.doc-kit/inputs/repos/<name>` (the work folder, never committed), or brought up to
date when it is already there. git uses your own credentials: the kit never sees a token. When the application's
own code comes from a repository, point `app.dir` to its clone in `doc.config.mjs` — the command says so.

## Step 3 — Convert the documents

```text
doc-kit inputs ingest
```

Word, Markdown, text, HTML and diagrams (draw.io, PlantUML, Mermaid) become text in `.doc-kit/inputs/docs/`, the
secrets removed; a PDF is indexed and read by the agents page by page. A page given by its address is never fetched
by the kit: the skill reads it through the connectors of the session, with your consent.

### Then, with a DAT: the reconciliation

Once the DAT is converted and `doc-kit facts` has run, `doc-kit inputs reconcile` compares what the DAT names with
what the code shows: technologies found in the code, said by the DAT without a trace, in the code but not in the
DAT, and the hosts of its addresses. It is a first pass, in `.doc-kit/inputs/reconcile.json`: a trace is evidence,
never proof. The skill then runs the brief `architecture-reconcile`, which checks each item and writes the page of
the gaps between the DAT and reality.

## How to check it works

`doc-kit inputs` lists each source with its state: a folder **here**, a repository **fetched**, a document
**converted, up to date**. `doc-kit bricks` shows the bricks `inputs.repos` and `inputs.docs`: `bricks run --stale
--network` fetches and converts what is out of date before the facts are read again (`--network` also lets
`facts` ask the public package registries, for the public packages `facts.network.allow` lists only: see SECURITY.md).

## Common errors and fixes

| Symptom | Cause | Fix |
|---|---|---|
| "“…” is not an address the kit gives git" | A user or a token in the address, `http://`, or a form git would read as an option | Use `https://host/path` without credentials, `ssh://` or `git@host:path` |
| "git ended with exit code 128: fatal: Authentication failed" | No access, or no credential stored | Sign in once with git itself (credential manager, SSH key); the kit never prompts |
| "refused — not a ZIP archive" | A `.docx` that is not one (an old `.doc`, a renamed file) | Save it again as `.docx`, or give the PDF |
| "the kit does not read .xlsx files" | A format the kit does not convert | Export it as PDF, `.docx` or Markdown |

## Pitfalls and limits

- A document is **information to check**, never the truth: an architecture document often describes what was
  planned. The agents cite it ("Source: DAT v2.3 § 4.1") and report every difference with the code.
- A clone is a full copy of the repository: it stays in the work folder; delete `.doc-kit/inputs/` when the
  documentation is handed over.
- The kit's readers refuse what they cannot read safely (an encrypted or oversized archive, a ZIP bomb): see
  SECURITY.md.

## Required permissions

Read access to each repository with your own git account, and to the documents. Nothing else: no token is given to
the kit, and the kit writes nothing in the repositories.
