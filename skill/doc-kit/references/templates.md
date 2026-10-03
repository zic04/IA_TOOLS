# The 30 page templates (summary)

The authoritative detail is in the kit: `{{KIT_PATH}}/standard/templates.md` (explanations), `{{KIT_PATH}}/
standard/templates.json` (the first 13 types) and its fragments `{{KIT_PATH}}/standard/templates/business.json`
(business space, ARCHITECTURE.md §6.8) and `{{KIT_PATH}}/standard/templates/takeover.json` (takeover space,
ARCHITECTURE.md §6.9) — sections, required sections, maximum length, model, example, in English and French. Page
models live in `{{KIT_PATH}}/templates/pages/<language>/<type>.md`; `doc-kit new <id> --template <type>` lays one
down, and `--prefill` fills its main table from `doc-kit facts` for the types that support it (below).

The template is declared in the toc (`template` field of the page). The build then checks that each required section
is present: a `##` heading that **starts with** its label or an alias (case and accents ignored). A warning with
`--draft`, an error in strict mode. Each type sets a maximum length (`maxWords`, table below; 2,000 words for an
untyped page); beyond it, a page is split into sub-pages.

The sections below are the English labels of `templates.json` (a heading may go on after the label: "First of all: the
checks…"); French models have the same sections in the same order. The list of required sections is in
`templates.json` (`required`). Examples are ids of the fictional Acme Orders site.

| Type | For | Sections, in order | Example |
|---|---|---|---|
| `screen` | a usage or administration screen | What it is for · How it works · The screen · Each action · Settings reference · Step by step · Common use cases · Pitfalls and limits · In production · Required permissions | `administer/access/users` |
| `editor` | an editor (Configure section) | What it is for (+ NOTE "Where this setting lives") · How it works (HOW callout, diagram) · The screen · What it changes · Settings reference · Step by step · Pitfalls and limits · Required permissions | `configure/approvals/chains` |
| `recipe` | short step-by-steps for a precise result | The goal · Who does what · Step 1… (`:::steps`, result, WARNING) · How to check it works · Common errors and fixes · Pitfalls and limits · Required permissions | `configure/recipes/two-level-approval` |
| `technical` | a parent page of the Take over section | In short · In this part · The diagram · thematic sections (text, tables, code, diagrams; almost no captures) · Pitfalls and observed gaps · Further reading | `take-over/security` |
| `technical-sub` | the detail of a technical topic | thematic sections, `file:line` proofs · Further reading | `take-over/security/sign-in` |
| `journey` | what really happens to an object end to end (parent, 1,200 to 1,600 words) | In short · The diagram · In this part · The states · What happens on its own, and what waits for someone · Surprises to know about · Further reading | `take-over/order-journey` |
| `journey-step` | one step of the journey (1,200 to 1,800 words) | In short · What happens, step by step (`:::steps` with `file:line`) · What is read and written · The states · What the user sees · When things go wrong · Further reading | `take-over/order-journey/approval` |
| `troubleshooting` | the entry point of troubleshooting | In short · The diagram (where to start) · First of all (the checks that explain half the symptoms) · Where to look (screens, audit log, server logs, queries) · In this part · Further reading | `take-over/troubleshooting` |
| `troubleshooting-area` | the symptoms of one area | In short · one section per family, one `### "exact message"` sub-section per symptom: Probable causes, Check, Fix, Understand · Further reading | `take-over/troubleshooting/access` |
| `findings` | the numbered findings | How to read this page (severities, definitions, counts, series) · The essentials in one minute · In this part · Findings already fixed · What could not be checked · Existing documentation to stop following | `take-over/findings` (sub-pages: `## C1 — Title` with Finding, Impact, Recommendation; or tables `No. · Point · Where · Finding`) |
| `architecture` | the technical architecture document of production | In short (+ NOTE "How to read this document": provenance) · In this part · The diagram · Numbered flows · Components · What this document does not show · Who manages what | `take-over/technical-architecture` |
| `variables` | production environment variables | In short · The variables, one by one (one `###` per family; each variable: value or "(masked)", use `file:line`, default, effect) · Missing or ineffective · To check | `take-over/deployment/production-variables` |
| `resources` | production resources | In short · Compute · Data · Secrets · Network · Monitoring · Backup · Comparison with the documentation · What the application uses outside this group | `take-over/deployment/resources` |

**Required sections** (checked by the build) **and maximum length** (`maxWords`, checked by `audit`):

| Type | Required sections | maxWords |
|---|---|---|
| `screen` | What it is for · How it works · The screen · Pitfalls and limits · Required permissions | 2,500 |
| `editor` | What it is for · How it works · The screen · Settings reference · Pitfalls and limits · Required permissions | 3,000 |
| `recipe` | The goal · Step 1 · How to check it works · Pitfalls and limits · Required permissions | 3,500 |
| `technical` | In short | 2,000 |
| `technical-sub` | — | 2,000 |
| `journey` | In short · The diagram · In this part · Surprises to know about · Further reading | 2,000 |
| `journey-step` | In short · What happens, step by step · What the user sees · When things go wrong · Further reading | 2,200 |
| `troubleshooting` | In short · First of all · Where to look · In this part · Further reading | 2,000 |
| `troubleshooting-area` | In short · Further reading | 2,000 |
| `findings` | How to read this page · The essentials in one minute | 2,000 |
| `architecture` | In short · The diagram · Numbered flows · What this document does not show · Who manages what | 2,000 |
| `variables` | In short · To check | 2,200 |
| `resources` | In short · Compute · Data · Secrets · Monitoring · Backup · What the application uses outside this group | 2,200 |

## Business space types (ARCHITECTURE.md §6.8)

No `file:line` here: a business page that cites one gets the warning `business.technical` (move the detail to
its takeover `counterpart`). Identifiers: `F-01`… for a feature (`feature` field of the page), `BR-01`… (`RG-01`
in French) for a rule, defined once with `:::rule`/`:::regle` and cited elsewhere with `[[rule BR-01]]`/
`[[regle RG-01]]`. Generated tables: `::features{}`/`::fonctionnalites{}`, `::rules{}`/`::regles{}`,
`::roles{}`.

| Type | For | Required sections | maxWords | Example |
|---|---|---|---|---|
| `feature` | one feature's sheet | Access · What it is for · Who uses it · Main scenario · Business rules (required); Trigger/preconditions, Variants, Data handled, Notifications, Limits, Questions (optional) | 2,500 | `use/orders/approve` (`feature: "F-03"`) |
| `business-rules` | the rules shared by several features | How to read this page · The rules (required); Rules by feature, Retired rules (optional) | 3,000 | `use/business-rules` |
| `roles-matrix` | who can do what | In short · The roles · Who can do what (required); Responsibilities, How to get a role (optional) | 2,000 | `use/roles` |
| `process` | a business process end to end | In short · Who takes part · The steps · What happens on its own, and what waits for someone (required); The states, Deadlines, When it goes wrong, Features involved (optional) | 2,200 | `use/order-lifecycle` |
| `release-notes` | what changed, for the business reader | In short · Latest version (required); Earlier versions (optional) | 3,000 | `use/release-notes` |

## Takeover dossier types (ARCHITECTURE.md §6.9)

The dossier a team needs to take over an application, especially one written largely by AI assistants
("vibe-coded"): `references/pitfalls.md` lists exactly what each type is defending against. Every claim is
`file:line`, or a fact-file reference, or marked `[[deduced]]`/`[[unknown]]`. `doc-kit facts` feeds these pages
(one JSON file per source, `facts/<source>.json`); `doc-kit new <id> --prefill` fills the main table of
`api-surface`, `data-model`, `dependencies` and `agent-instructions` (also `variables` of the 13 original types)
from the matching facts source.

| Type | For | Required sections | maxWords | Facts source |
|---|---|---|---|---|
| `access-ownership` | who owns what, and what is still unknown | In short · Who owns what · Unknown owners | 2,200 | `secrets`, `env`, `agents`, `dependencies` |
| `api-surface` | every route, its authentication and its isolation | In short · The routes · Gaps | 3,000 | `api`, `db` |
| `runbook` | install, build, deploy, roll back, restore | In short · Install · Deploy · Roll back · Backup and restore | 3,000 | — |
| `data-model` | the tables and the personal data they hold | In short · Tables · Personal data | 2,500 | `db` |
| `dependencies` | packages, including ones that do not exist | In short · Direct dependencies · Packages that do not exist | 2,200 | `dependencies` (`--network`) |
| `code-map` | the system's containers and components | In short · Context · Containers · Components | 2,500 | — |
| `tests-quality` | what is tested, and what is not | In short · What is tested · Critical flows · How to run them | 2,200 | `tests` |
| `agent-instructions` | every rule in `AGENTS.md`-like files | In short · The files · Each rule · Hidden characters | 2,500 | `agents` |
| `adr` | one reconstructed architecture decision | Status · Context · Decision · Consequences · How it was reconstructed | 1,500 | — |
| `threat-model` | STRIDE threats by trust boundary | In short · The data flow diagram · Trust boundaries · Threats | 3,000 | `api`, `dependencies` (grounding) |
| `security-review` | authentication, access control, OWASP findings | In short · Scope and method · Authentication and sessions · Access control · Input handling · Secrets and configuration · Findings | 3,000 | `api`, `security`, `probe.json` |
| `maintainability-review` | ratings, hotspots, recommendations | In short · Ratings · Hotspots · Tests · Recommendations | 2,200 | `quality` |

`findings` becomes the project's **risk register** once a takeover space exists: each finding also carries Owner,
Decision (fix, accept, transfer, avoid), Status and Due date, combined into one "Follow-up" column on a table row
(`references/method.md`, phase 6 and 8).

## Common rules

- The page title comes from the toc: no `#` heading in the page; `##` and `###` feed "On this page" and the search.
- A screen or editor page ends with the `PERMISSIONS` callout (view, save, special actions).
- Gaps between code, screen and existing documentation: a `NOTE` callout "Observed gaps", described, never fixed.
- A capture with zones is inserted with `:::screen` and a list of exactly as many items as zones.
- Template guidance left in a page (`<!-- guidance:` in English, `<!-- consigne :` in French) is reported by `audit`
  and as a warning by the build: write the section and remove the guidance.
- Full syntax (callouts, chips `[[perm …]]`, `[[menu …]]`, `[[status …]]`, `[[route …]]`, diagrams, before/after; English
  and French spellings both accepted): the project's `WRITING-GUIDE.md` and `{{KIT_PATH}}/standard/writing.md`.
