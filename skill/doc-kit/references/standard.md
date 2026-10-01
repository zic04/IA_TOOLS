# The standard (summary)

The full standard is in the kit, `{{KIT_PATH}}/standard/`, in English (`.md`) and French (`.fr.md`):

| File | Content |
|---|---|
| `structure` | recommended site structure |
| `templates` (and `templates.json`) | the 13 page types (see `references/templates.md`) |
| `writing` | writing rules |
| `captures` | capture safety (see `references/capture-safety.md`) |
| `quality` | blocking gates and warnings |
| `maturity` | levels 1 to 4 and their criteria, measured by `audit` |
| `delivery` | handover checklist |
| `config` | commented configuration examples, all fictional |

## Structure

- Four sections, one per reader: **Use** (`use`), **Configure** (`configure`), **Administer** (`administer`),
  **Take over** (`take-over`). A French site uses `utiliser`, `configurer`, `administrer`, `reprendre`.
- Adapt the vocabulary and the groups to the product; keep the four readers and the required Take over pages. A
  product without configuration screens merges Configure into Administer.
- Groups expected in Take over: Architecture, technical architecture document, End-to-end journeys, Operate (including
  troubleshooting), Findings, Maintaining the documentation.
- Guided tours on the home page (`journeys[]` in `content/toc.json`): 3 to 5 tours of 5 to 7 pages, one per reader,
  with a first-person title ("I follow an order from end to end").
- `toc.json` and `glossary.json` are managed centrally: writers propose, the orchestrator edits.

## Writing rules

Nothing invented, `file:line` proof; exact screen labels in bold; "inferred" says inferred; gaps in a NOTE callout,
never fixed in the application; findings numbered by severity — C (critical), I (important), M (minor) — plus thematic
series the findings page defines (for example P for production-only findings).

## Quality gates

| Blocking (strict build or `check` fails) | Warnings |
|---|---|
| strict build (declared page, capture, diagram present) | tables overflowing (1,440 px) |
| links and anchors | image weight (above 200 KB) |
| legend = number of zones | pages over their template's `maxWords` |
| route coverage | captures from another version than the application |
| required sections of templates | template guidance left in a page |
| secrets (`.env` values, GUIDs, keys, session file) in the sources and the HTML | |

Not checked automatically, so reviewed by hand: each zone frames the right element; no secret or personal data in the
images; readability in light and dark; every claim is true (its proof); session deleted.

## Maturity levels (`doc-kit audit`)

| Level | Criteria (each level also requires the levels below) |
|---|---|
| 1 Skeleton | valid `doc.config.mjs`, `build --draft` succeeds, each section has a written page, `home.md`, at least 1 glossary term and 1 guided tour |
| 2 User | pages written ≥ 90 % outside Take over, `screen`/`editor` pages annotated ≥ 80 %, coverage ≥ 80 %, no broken link, every legend = its zones |
| 3 Complete | nothing blocking (strict build, links, 100 % coverage, secrets), pages typed ≥ 80 % and all conformant, annotated ≥ 90 %, no template guidance left, no wide table, ≥ 20 glossary terms, ≥ 3 guided tours |
| 4 Takeover | the 7 required Take over pages (architecture, architecture document, a journey with ≥ 3 steps, operate, troubleshooting with ≥ 2 areas, numbered findings, maintaining the docs), `file:line` proofs in ≥ 60 % of Take over pages, completeness ≥ 70 %, ≤ 5 % of pages too long, ≥ 90 % of captures of the current version |

The exact indicators and thresholds: `{{KIT_PATH}}/standard/maturity.md`. `audit` writes `.doc-kit/audit.md` (indicators,
level reached, "to do for the next level" with the pages concerned) and `.doc-kit/audit.json` (`--json` prints it). An
indicator that cannot be measured (no coverage adapter, no browser for the table widths) is "not measured", never
failed. A project handover aims at level 4: journeys, troubleshooting, the architecture document and consolidated
findings come from phases 6 to 8.

## Delivery

Export done (`doc-kit export <target> --with-dist`), handover README, session deleted, checks green, nothing committed by
an agent. Details: `{{KIT_PATH}}/standard/delivery.md`.
