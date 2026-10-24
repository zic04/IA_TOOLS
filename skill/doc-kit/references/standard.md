# The standard (summary)

The full standard is in the kit, `{{KIT_PATH}}/standard/`, in English (`.md`) and French (`.fr.md`):

| File | Content |
|---|---|
| `structure` | recommended site structure |
| `templates` (and `templates.json` + fragments `templates/business.json`, `templates/takeover.json`) | the 31 page types (see `references/templates.md`) |
| `writing` | writing rules |
| `captures` | capture safety (see `references/capture-safety.md`) |
| `quality` | blocking gates and warnings |
| `maturity` | levels 1 to 4 and their criteria, measured by `audit` (also by space, when `spaces` is declared) |
| `delivery` | handover checklist |
| `config` | commented configuration examples, all fictional |

## Structure

- Four **spaces**, one per audience (`{{KIT_PATH}}/ARCHITECTURE.md` §6.1a): **Use** (`use`: how to do each task, screen by
  screen — users, key users, support), **Product** (`product`: what each feature does, for whom, by which rule —
  product owners, business analysts, key users), **Administer** (`admin`: settings, access, operations, the
  technical architecture document — administrators, operators) and **Develop** (`develop`: how it is built and
  secured, what to fix first — developers, the takeover team, security). `{{KIT_CLI}} init` declares all four by default;
  `--spaces` keeps a subset, or none. A project keeps only those it has readers for.
- Each space is split into **parts** (`sections` of `content/toc.json`): Use; Features, Process; Administer,
  Operate; Understand, Secure, Risks, Maintain. A French site's part ids: `utiliser`; `fonctionnalites`,
  `processus`; `administrer`, `exploiter`; `comprendre`, `securiser`, `risques`, `maintenir`. A product with many
  rich editors splits a `configure` part back out of Administer.
- Each standard space is its own **kind** (`standard/spaces.json`); a space of the project's own names the kind it
  behaves like (`{ "id": "ops", "kind": "admin", "title": "Operations" }`). The kind decides: no code in Use and
  Product (`business.technical`), `file:line` proofs expected in Develop, the glossary's technical correspondence
  shown in Administer and Develop, and where the audit looks for each required takeover page.
- Adapt the vocabulary, the parts and the groups to the product; keep the intent of the spaces and the 7 required
  takeover pages: the technical architecture document and Operate in Administer; the architecture overview, an
  end-to-end journey, troubleshooting, findings and maintaining the docs in Develop. The rest of the takeover
  dossier follows the same split: access and ownership, runbook, variables and resources in Operate; API surface,
  dependencies, agent instructions, tests and threat model in Develop.
- One source, one site with a space selector, and one exported HTML file per space with the other spaces
  physically removed (`dist/<Product>-Documentation-use.html`, `-product`, `-admin`, `-develop`): the Administer
  and Develop exports carry variables, hosts and risks the Use and Product exports must not. A page's
  `counterpart` links it to the same subject in another space.
- Guided tours on the home page (`journeys[]` in `content/toc.json`): 3 to 5 tours of 5 to 7 pages, one per reader,
  with a first-person title ("I follow an order from end to end").
- `toc.json`, `glossary.json` and `features.json` are managed centrally: writers propose, the orchestrator edits.

## Writing rules

Nothing invented, `file:line` proof (or a `{{KIT_CLI}} facts` file, with `[[verified]]`/`[[deduced]]`/`[[unknown]]`);
exact screen labels in bold; "inferred" says inferred; gaps in a NOTE callout, never fixed in the application;
findings numbered by severity — C (critical), I (important), M (minor) — plus thematic series the findings page
defines (for example P for production-only findings). **Business pages cite no code**: a `feature`,
`business-rules`, `roles-matrix`, `process` or `release-notes` page of Use or Product has no `file:line` — the
technical reason belongs to its `counterpart` in the Develop space; a `screen` keeps the proofs of its "How it
works". With a Develop space,
`findings` is the project's **risk register**: each finding also carries Owner, Decision (fix, accept, transfer,
avoid), Status and Due date.

## Quality gates

| Blocking (strict build or `check` fails) | Warnings |
|---|---|
| strict build (declared page, capture, diagram present) | tables overflowing (1,440 px) |
| links and anchors | image weight (above 200 KB) |
| legend = number of zones | pages over their template's `maxWords` |
| route coverage | captures from another version than the application |
| required sections of templates | template guidance left in a page |
| secrets (`.env` values, GUIDs, keys, session file) in the sources and the HTML | a business page of Use or Product citing `file:line` (`business.technical`) |

Not checked automatically, so reviewed by hand: each zone frames the right element; no secret or personal data in the
images; readability in light and dark; every claim is true (its proof); session deleted.

## Maturity levels (`{{KIT_CLI}} audit`)

| Level | Criteria (each level also requires the levels below) |
|---|---|
| 1 Skeleton | valid `doc.config.mjs`, `build --draft` succeeds, each section has a written page, `home.md`, at least 1 glossary term and 1 guided tour |
| 2 User | pages written ≥ 90 % outside the takeover pages, `screen`/`editor` pages annotated ≥ 80 %, coverage ≥ 80 %, no broken link, every legend = its zones |
| 3 Complete | nothing blocking (strict build, links, 100 % coverage, secrets), pages typed ≥ 80 % and all conformant, annotated ≥ 90 %, no template guidance left, no wide table, ≥ 20 glossary terms, ≥ 3 guided tours |
| 4 Takeover | the 7 required takeover pages (architecture, architecture document, a journey with ≥ 3 steps, operate, troubleshooting with ≥ 2 areas, numbered findings, maintaining the docs), `file:line` proofs in ≥ 60 % of the takeover pages, completeness ≥ 70 %, ≤ 5 % of pages too long, ≥ 90 % of captures of the current version |

The takeover pages are the pages of the Develop space (with spaces declared) or of the Take over section
(without). The exact indicators and thresholds: `{{KIT_PATH}}/standard/maturity.md`. `audit` writes `.doc-kit/audit.md` (indicators,
level reached, "to do for the next level" with the pages concerned) and `.doc-kit/audit.json` (`--json` prints it). An
indicator that cannot be measured (no coverage adapter, no browser for the table widths) is "not measured", never
failed. With `spaces` declared, `audit.md` also shows a table "Level by space" (the same criteria, measured on
each space's own pages; `n/a` where the space's kind is not concerned: `written2` in Develop, `proofs4` outside
it, `takeover4` in Use and Product, while Administer's counts its two required pages). `facts` (files, staleness) and `claims` (verified/deduced/unknown ratio) are informative indicators;
`upToDatePages` (pages marked by `sync` at the current version) is a level-4 criterion, `n/a` without `sync.json`.
The depth of the feature sheets is measured too, on the written sheets: `featureSheets` (each has a user story, level
3), `scenarios` (the stories with acceptance criteria, level 4) and `behaviourDepth` (the rubrics of the behaviour
cards answered, level 4) — `n/a` without a Product space when spaces are declared; `audit.md` lists each feature's
depth. A project
handover aims at level 4: journeys, troubleshooting, the takeover dossier and consolidated findings come from
phases 6 to 8.

## Delivery

Export done (`{{KIT_CLI}} export <target> --with-dist`), handover README, session deleted, checks green, nothing committed by
an agent. Details: `{{KIT_PATH}}/standard/delivery.md`.
