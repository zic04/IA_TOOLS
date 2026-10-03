# Quality checks

There are two levels:
- **blocking gates**, which prevent the site from being built or handed over (exit code 1);
- **warnings**, which are reported and must be handled or justified before handover.

Each check below proved its worth on real sites: it catches a mistake that a reader would otherwise find first.

## Blocking gates

| Check | Command | What blocks | Fix |
|---|---|---|---|
| **Strict build** | `doc-kit build` | A declared page without its file (one error per page: the sections of its template and the anchors that point into it are checked once it exists); a cited capture that cannot be found, or whose image is missing; a diagram that cannot be found; a home-page tour that points to an unknown page | Write the page, take the capture, or remove the reference. While writing: `doc-kit build --draft` (tolerates and reports) |
| **Links and anchors** | `doc-kit build`, `doc-kit check links` | A link to an id that is not in the plan; a `~…` anchor that is not in the target page | Fix the id or the anchor (heading in lower case, without accents, with hyphens) |
| **Legend = zones** | `doc-kit build` | A `:::screen` whose list does not have as many items as the capture has zones; a `::capture` used on a capture that has zones | Adjust the list, or adjust the zones of the plan and capture again |
| **Coverage** | `doc-kit check coverage` | An element inventoried by an adapter (route, block, widget, tool…) is cited by no written page, neither in its entry of the plan (`routes`) nor in its text. The entry of a page not written yet, or of a page that still holds guidance, covers nothing: the check shows apart what the plan will cover once written | Document the element, or write the page that plans it. The check is skipped when the application cannot be found |
| **Required sections** | `doc-kit build` | A page that declares a `template` lacks one of its required sections (a `##` heading that starts with the label or with an alias) | Add the section, rename the heading, or remove `template` from a page that is not of that type |
| **Secrets** | `doc-kit check secrets` | A secret in the text sources (pages, glossary, zone files, plans, diagrams): key, password, token, connection string, value from the local `.env`; a session file outside `.doc-kit/`, or tracked by git | Remove the value, mask it and capture again; delete the session |
| **Spaces** (`space.*`) | `doc-kit build` | As soon as `spaces` is declared: a section with no `space` (`space.missing`); `space` naming an undeclared space (`space.unknown`); `space` used while `spaces` is not declared (`space.undeclared`); a space id declared twice (`space.duplicate`); a custom space with no `title` (`space.title`) | Give every section a `space`, fix the id, declare `spaces` first, or remove the duplicate — see [structure.md](structure.md#the-two-spaces) |
| **`counterpart` link** (`link.counterpart`) | `doc-kit build`, `doc-kit check links` | A `counterpart` naming an unknown page, or the page itself | Fix the id, or remove `counterpart` |
| **Business features and rules** (`feature.*`, `rule.*`) | `doc-kit build` | A `feature` id used on a page whose template is not `feature` (`feature.template`); the same `feature` id declared twice (`feature.duplicate`); `[[feature …]]` or `[[rule …]]` citing an unknown id (`feature.unknown`, `rule.unknown`); a `:::rule` with no `id` or `title` (`rule.attributes`); a rule defined twice (`rule.duplicate`) | Fix the id, declare the feature or the rule once, or remove the citation — see [templates.md](templates.md) (`feature`, `business-rules`) |
| **Facts tables** (`facts.*`) | `doc-kit build` | `::facts{source="…"}` naming a source with no `facts/<source>.json` file (`facts.missing`); a `columns` entry not among that file's item keys (`facts.column`) | Run `doc-kit facts --source <name>` first, or fix `columns` — see ARCHITECTURE.md §6.9 |

The strict build is the main gate: **the site is not produced** while an error remains ("N errors — site NOT generated.").

## Warnings

| Check | Command | Threshold | Fix |
|---|---|---|---|
| **Tables too wide** | `doc-kit check tables` | A table scrolls horizontally at 1,440 px (change the width with `--width`) | Fewer columns, shorter cells, or two tables |
| **Heavy images** | `doc-kit check images` | An image above 200 KB | `doc-kit optimize`: recompresses above the threshold and keeps the new version when it saves at least 20 % |
| **Pages too long** | `doc-kit audit` | More words than the `maxWords` of the template (2,000 for an untyped page) | Split into sub-pages (see [structure.md](structure.md#sub-pages)) |
| **Captures of an earlier version** | `doc-kit check images`, `doc-kit audit` | The `version` field of the zone file differs from the current version of the application | Capture again, or say on the page which version the screen shows |
| **Guidance left in a page** | `doc-kit audit`, `doc-kit build` | A `<!-- guidance:` comment (or `<!-- consigne :` in French) left by a template; the strict build reports it too, and `doc-kit audit` counts the page as a draft, not written yet (`written`) | Write the section and remove the guidance, or delete the optional section |
| **Unknown box type** | `doc-kit build` | A `> [!TYPE]` box outside the list of boxes | Fix the type (see [writing.md](writing.md#7-the-extended-syntax)) |
| **A business page cites code** (`business.technical`) | `doc-kit build` | A page of a business type (`feature`, `business-rules`, `roles-matrix`, `process`, `release-notes`) in the `business` space contains a `file:line` proof; screen and editor pages keep their proofs | Move the detail to the page's `counterpart` — see [writing.md](writing.md#13-writing-in-the-business-space) |
| **A feature sheet with no id** (`feature.noId`) | `doc-kit build` | A page of template `feature` declares no `feature` id | Add one (`F-01`…) in `toc.json`, so `::features{}` and `[[feature …]]` can find it |
| **An empty space** (`space.empty`) | `doc-kit build` | A declared space has no page yet | Give it pages, or remove it from `spaces` until it does |
| **Links excluded from an export** (`space.excludedLinks`) | `doc-kit build` (with spaces exported) | A kept page links to a page or section outside the exported space | Expected in an export: its readers do not get the other space |

## What is not checked automatically

| Check | How |
|---|---|
| Each zone frames the right element | `doc-kit capture "<pattern>" --preview`, then look at `<id>.zones.png` in `.doc-kit/` |
| No secret and no personal data **in the images** | Review every image: masking does not know the production values |
| Readability in light and dark themes; diagrams that do not overflow | `doc-kit view <page> --theme dark`, `doc-kit view <page> --tour 2` |
| Every statement is true | The `file:line` proof; a cross-review of the Take over pages |
| The session is deleted | `doc-kit connect --forget`, then `doc-kit doctor` |

## The commands

| Command | Role | Exit codes |
|---|---|---|
| `doc-kit build` | Builds the site; strict by default | 0: site built; 1: content errors |
| `doc-kit build --draft` | Tolerates missing pages and captures, and reports them | 0 |
| `doc-kit check all` | Links, tables, images, secrets, coverage | 0; 1 if a blocking check fails |
| `doc-kit audit` | Score, maturity level, warnings (see [maturity.md](maturity.md)) | 0; `--json` for continuous integration |

Codes shared by every command: 2 = invalid usage or configuration; 3 = environment problem (missing browser, application unreachable, session expired, incompatible kit).

## Before handover

All blocking checks are green, each warning is handled or justified on the "Maintaining the docs" page, and the checklist of [delivery.md](delivery.md) is done.
