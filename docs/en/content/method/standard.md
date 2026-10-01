## In short

The kit comes with a **documentation standard**, in `standard/` (English `.md`, French `.fr.md`). It says what a
site must contain, how to write it, how to capture safely, how to check it and when it is ready to hand over. It
holds no theory: every rule comes from documentation sites built and handed over with this method, one of about 170
pages captured read-only on production, one of about 115 pages captured on a prepared demo.

The five rules that matter most:

1. **Nothing made up.** Every label, default, bound and behaviour is checked in the code, with its `file:line` proof.
2. **Explain how it works**, not only the screen: who computes, in which order, with which limits, and what the user
   sees change.
3. **Describe gaps; never fix the application** from the documentation.
4. **Production is never written to** during a capture, and the session is deleted at the end.
5. **The strict build passes** before any handover.

## In this part

| Document | What it holds | In this site |
|---|---|---|
| `standard/structure.md` | The four sections, the groups, the required Take over pages, the home-page journeys, sub-pages | [Table of contents](#/write/table-of-contents) |
| `standard/templates.md` and `templates.json` | The 13 page types: purpose, sections, length, example, common mistakes | [Page templates](#/write/page-templates) |
| `standard/writing.md` | Nothing made up, proofs, exact labels, gaps, links, glossary, numbering of findings, diagrams | below |
| `standard/captures.md` | Capture safety on production, the session, masking, zone quality, production or demo | [Demo or production](#/capture/safety) |
| `standard/quality.md` | Blocking gates and warnings, with the command that checks each one | [The checks](#/publish/checks) |
| `standard/maturity.md` | Levels 1 to 4, each measurable by `doc-kit audit`, with a worked example | [Audit](#/publish/audit) |
| `standard/delivery.md` | The handover checklist | [Export and hand over](#/publish/export) |
| `standard/config.md` | Two complete, commented configurations for fictional applications | [Configuration](#/reference/configuration) |

## Four readers, four sections

| Section | For whom | What it holds | Main types |
|---|---|---|---|
| Use (`use`) | The end user | Every everyday screen, annotated | `screen` |
| Configure (`configure`) | The business administrator | Every editor and setting, with its mechanism; the recipes | `editor`, `recipe` |
| Administer (`administer`) | The platform administrator | Access, reference data, system, operations | `screen` |
| Take over (`take-over`) | Whoever takes the project over | Architecture, journeys, operations, troubleshooting, findings | `technical`, `journey`, `troubleshooting`… |

The Take over section makes a project transferable. Its seven required pages are an architecture overview, a
technical architecture document, at least one end-to-end journey, operations, troubleshooting by symptom, the
findings, and how the documentation itself is maintained.

## Writing rules

| Rule | In practice |
|---|---|
| Sources of truth | A label in the translation file, a default in the components, a bound in the validation schema, a behaviour in the services, a production fact on a screen viewed read-only, **dated** |
| The `file:line` proof | `lib/services/orderService.ts:43-50` on first citation, then `orderService.ts:161` |
| Inferred, to be confirmed | Say so: "inferred from …", "to be confirmed with the infrastructure team" |
| Exact labels in bold | **Submit for approval**, with the case and characters of the screen |
| Observed gaps | In a `> [!NOTE] Observed gaps (v2.4.0)` callout, each with its proof; never fixed from the documentation |
| Findings | Numbered by family: C critical, I important, M minor, P production, N no effect (R in French); a number never changes |
| Links | Only to ids of the plan; no "below" or "above" across pages |

## The method, step by step

The standard is applied in phases: scope the work, set up the project (`init`, `doctor`), inventory the code,
plan the site and write one reference page, capture, write in batches, consolidate the findings, write the
journeys and troubleshooting, the production technical pages, check, then deliver. The
[Claude Code skill](#/skill/phases) runs these phases with parallel agents; a team can follow them by hand.

## Pitfalls and observed gaps

> [!WARNING] Outdated existing documentation
> A roles document with the wrong counts, a screen inventory of a mock-up: never copy existing documentation;
> check everything again in the code, and list what to stop following on the findings page.

> [!NOTE] Changing the standard
> `standard/templates.json` is read by the build: a change to it changes what every project must contain. It goes
> into `ARCHITECTURE.md` first, then into both languages of the standard and of the page templates, then into the
> `CHANGELOG.md`.

## Further reading

- [Page examples](#/examples/screen): a page of each type, written to the standard.
- [Audit and maturity levels](#/publish/audit): the standard, measured.
- [The phases of the skill](#/skill/phases): the method, run by Claude Code.
