# Writing rules

These rules come from the writing guides of real documentation sites, and from the briefs given to the writers, people or agents, who wrote them. A project's own writing guide (`WRITING-GUIDE.md`) repeats them and adds what is specific to the project: its translation files, its capture prefixes, its decision about the data shown in captures.

## 1. Nothing made up

Every label, default value, bound, behaviour and permission is **checked in the code**. When in doubt, read the code; never assume.

| You state… | You check it in… | Acme Orders (Next.js) | Single-page app + separate API |
|---|---|---|---|
| A screen label | The application's translation file | `messages/en.json` | `frontend/src/i18n/locales/en.json` |
| A default value | The components and types | `components/`, `app/` | `frontend/src/lib/types.ts` |
| A server bound | The validation schemas and the data model | `lib/validation/`, `db/schema.ts` | `backend/app/schemas/` |
| A behaviour | The route handlers, server actions and services | `app/api/`, `lib/services/` | `backend/app/` |
| A production fact | A screen viewed read-only, or the cloud console, **dated** | "38 accounts on 1 October 2026" | "export of 30 September 2026" |

The repository's existing documentation is often **out of date**. Use it to find where to look, never as proof. A takeover usually ends with a list of documents "to stop following" (see the `findings` template).

## 2. The `file:line` proof

Every non-obvious statement about the code carries its proof, in backticks.

| Form | Example |
|---|---|
| File and line | `reminderJob.ts:38-44` |
| Several lines | `ApprovalChainEditor.tsx:69,127` |
| Full path on first citation, short name afterwards | `lib/services/orderService.ts:43-50`, then `orderService.ts:161` |
| Same file as the previous citation | `(:473)`, only inside one step or one paragraph |
| Function name, when the line moves often | `getScopedCustomers`, `lib/services/customerService.ts:9` |

- The page or the chapter states **which version** the line numbers refer to: "according to the code of version 2.4.0". Line numbers drift; the function name stays a landmark.
- Take over pages cite their proofs systematically. Screen pages keep them for the observed gaps.

## 3. What is inferred, what is to be confirmed

What was not observed directly is **marked as inferred**: "which suggests a refusal (inferred)", "inferred from `approvalService.ts:122-126`". What is unknown is **to be confirmed**, with the person to ask.

The technical architecture document opens with a legend that serves as a model:
- "**From the console**": observed, dated;
- "**Infrastructure as code**": planned; production may have drifted;
- "**Inferred**": a conclusion drawn from these sources, not observed directly;
- "**To be confirmed**": unknown; ask the infrastructure team.

## 4. Exact labels, in bold

- Every screen label is written **in bold**, with the case, punctuation and characters of the translation file: **Approval chain**, **Test the rule**.
- A label with a variable keeps its variable: "{n} approval chain(s)".
- A displayed message is quoted exactly, in quotation marks: "Resource not found". (In French: « Ressource introuvable ».)
- A technical code (permission, status, variable, audit action) goes in backticks: `order:write`, `PENDING_APPROVAL`, `user.deactivate`. For a status, give the code **and** the label: `DRAFT` (**Draft**).

## 5. Observed gaps

When the screen, the code and the existing documentation disagree, **describe** the gap in a box, at the end of the "Pitfalls and limits" section:

```markdown
> [!NOTE] Observed gaps (v2.4.0)
> - The **Awaiting signature** chip actually filters the **Pending approval** status (`app/(app)/orders/page.tsx`, constant `CHIPS`).
```

- **Never** fix the application from the documentation folder.
- A gap with a real impact becomes a **numbered finding** (see §9). The pages then cite it by its number.
- In French, the box is titled `> [!NOTE] Écarts constatés (vX.Y.Z)`.
- Order of magnitude: mature sites carry one such box for every one or two pages.

## 6. Tone and style

- **English**: professional register, imperative mood for actions: "Choose…", "Click…". (French: vouvoiement, impératif.)
- Short sentences; one idea per sentence. Tables rather than paragraphs for reference material.
- Explain **how it works**, not only the screen: who computes what (server or browser), in which order, with which limits, and what the user sees change.
- No `#` heading: the page title comes from the plan. Use `##` and `###` headings only; they feed "On this page" and the search.
- Real figures rather than adjectives: "15 orders per page", "60 polls, 2 seconds apart".

## 7. The extended syntax

Both spellings are accepted by the build. Use the spelling of the project's language.

| Element | English | French | Use |
|---|---|---|---|
| Mechanism box | `> [!HOW] Title` | `> [!MECANISME] Titre` | The real mechanism, often as numbered steps: "Which chain a new order receives" |
| Pitfall box | `> [!WARNING] Title` | `> [!ATTENTION] Titre` | One pitfall; the title is the pitfall in one line: "Only one active chain per order type" |
| Note box | `> [!NOTE] Title` | `> [!NOTE] Titre` | Where the screen is; observed gaps; sources: "Where to find this setting" |
| Tip box | `> [!TIP] Title` | `> [!ASTUCE] Titre` | A useful shortcut, never an essential one: "The hidden filters" |
| Error box | `> [!CAUTION] Title` | `> [!ERREUR] Titre` | An error and its cause |
| Permissions box | `> [!PERMISSIONS] Title` | `> [!DROITS] Titre` | Always the last section of a screen page: view, save, special actions |
| Recipe box | `> [!RECIPE] Title` | `> [!RECETTE] Titre` | What you need before a recipe: "What you need" |
| Permission code | `[[perm code]]` | `[[droit code]]` | `[[perm order:approve]]` |
| Menu path | `[[menu A › B]]` | `[[menu A › B]]` | `[[menu Administration › Approval chains]]`, separator `›` |
| Key or shortcut | `[[key …]]` | `[[touche …]]` | `[[key Ctrl+K]]` |
| Status badge | `[[status …]]` | `[[statut …]]` | `[[status 2]]`, coloured when `statuses` is set in the configuration |
| Application route | `[[route …]]` | `[[route …]]` | `[[route /orders/[id]]]` |
| Annotated screen | `:::screen{capture="id" title="…"}` | `:::ecran{capture="id" titre="…"}` | A capture with zones, followed by its numbered legend |
| Steps | `:::steps` | `:::etapes` | A numbered sequence of actions |
| Plain capture | `::capture{id="…" title="…"}` | `::capture{id="…" titre="…"}` | A capture without zones |
| Diagram | `::diagram{id="…" title="…"}` | `::schema{id="…" titre="…"}` | An SVG from `diagrams/` |
| Before / after | `::before-after{before after before-label after-label title}` | `::avant-apres{avant apres libelle-avant libelle-apres titre}` | Two captures with a slider |

Standard tables:
- settings reference: `| Setting | Control | Values · default | Effect |`;
- writes: `| Where | What | When |`;
- errors: `| Message | Origin | Recovery |`;
- findings: `| No. | Point | Where | Finding and impact | Recommendation |`.

A table must not scroll horizontally at 1,440 px: beyond five columns, split it or shorten the cells.

## 8. Links and anchors

- Link to a page: `[text](#/configure/approvals/approval-chains)`, only to an id of the plan.
- Link to a section: `[text](#/page-id~anchor)`. The anchor is the heading in lower case, without accents, with hyphens instead of spaces and punctuation, 60 characters at most: "C1 — The reminder job never runs in production" gives `c1-the-reminder-job-never-runs-in-production`.
- The build checks every page and every anchor. An anchor into a page that someone else is writing at the same time is risky: link to the page, without an anchor.
- **No relative references between pages**: "below", "above", "see later" only work inside one page. After a split into sub-pages, replace them with links.
- A link says where it leads: "[Roles and permissions](#/administer/access/roles)", never "here".

## 9. Numbering findings

Each finding has a letter for its family and a number. The letters depend on the language of the site.

| English | French | Family | What it is | Severity |
|---|---|---|---|---|
| **C** | **C** | Critical (Critique) | A current risk for data security, confidentiality or the product's core promise; to address before any other change | Critical |
| **I** | **I** | Important | A real defect, a possible bypass, a broken or misleading feature; to schedule quickly | Important |
| **M** | **M** | Minor (Mineur) | Debt, inconsistency, display or hygiene; to address along the way | Minor |
| **P** | **P** | Production | The real production configuration differs from what the code expects (roles, settings, variables) | In a column |
| **N** | **R** | No effect (Sans effet) | A setting that is saved, or a screen that is displayed, without producing the announced effect | In a column |

- In English, the no-effect family uses **N** ("no effect"); in French it keeps **R** (« réglage sans effet »). The other four letters are the same in both languages. `doc-kit audit` recognises both sets.
- A number **never changes**: it is cited in the journeys, in the troubleshooting pages and in the gap boxes. A new finding takes the next free number of its family (for example I34, I35, then I40 to I43, added to the security findings after I16).
- Each finding has its `file:line` proof, its impact and its recommendation.
- Writers propose **candidates** (finding, proof, proposed severity). One person consolidates, deduplicates and numbers them.
- Cite a finding by its number with a link to its sub-page: `[C1](#/take-over/findings/critical)`.

## 10. The glossary

- `content/glossary.json`: `[{ "term": "Scope", "pattern": "scopes?", "def": "…" }]`.
- `def`: one sentence, understandable without the rest of the site.
- `pattern`: an optional regular expression for plurals and variants.
- A term enters the glossary when it has a meaning specific to the product (Acme Orders: "Approval chain", "Scope") or when it is ambiguous ("Delegate": a person who approves on someone else's behalf, not a role).
- The glossary is managed centrally: writers propose terms with their definition.

## 11. Diagrams

- Files `diagrams/<name>.svg`, inserted by `::diagram{id="name" title="…"}`. The title is a complete caption that says how to read the diagram.
- A `viewBox` 900 units wide; text from 11 to 14 px; **no hard-coded colour**, only the classes of the site's stylesheet, so that the diagram follows the light and dark themes:

  | Role | Classes |
  |---|---|
  | Boxes | `d-box`, `d-box-2`, `d-brand`, `d-warn`, `d-danger`, `d-info`, `d-violet` |
  | Solid fills | `d-solid` (brand colour), `d-chrome` (dark chrome colour) |
  | Lines | `d-line`, `d-line-brand`, `d-dashed` |
  | Text | `d-title`, `d-text`, `d-small`, `d-white` (on `d-solid` only), `d-on-chrome` (on `d-chrome` only) |
  | Arrow heads | `d-arrow`, `d-arrow-brand` |

- Text on a filled box uses the class made for that fill: `d-white` on `d-solid`, `d-on-chrome` on `d-chrome`. Other pairs can become invisible in the dark theme. Check every diagram in both themes.

- Diagrams written before doc-kit use the legacy French names (`s-boite`, `s-trait`, `s-titre`, `s-fleche`…): they are still styled, but new diagrams use the `d-*` classes.
- Prefix the ids of `<marker>` elements with the code of the diagram (`oj-arrow`, `ac-arrow`): several diagrams can share a page.
- Show visually what is automatic, what waits for a person and what depends on a scheduler.
- Check in light **and** dark themes that nothing overflows: `doc-kit view <page~the-diagram> --theme dark`.

## 12. Working together

- Each writer writes only their own pages, capture plans and prefixed diagrams. They do not edit the plan, the glossary, the engine, other people's pages or the application.
- They report what they find wrong elsewhere (file, sentence, proof) instead of fixing it.
- Their report gives: the pages written, the captures and zones, the gaps and the candidate findings with their proof, the proposed glossary terms, and what could not be done.

## 13. Writing in the Business space

The Business space (`feature`, `business-rules`, `roles-matrix`, `process`, `release-notes`; ARCHITECTURE.md
§6.8) is read by people who never open the code. Four rules keep it that way.

**Identifiers.** `F-01`, `F-02`… number feature sheets; `BR-01`, `BR-02`… (English) or `RG-01`, `RG-02`…
(French) number business rules. Both follow the same shape, `^[A-Z][A-Z0-9]{0,5}-\d{1,4}$`, and the same
rule as findings (§9 below): **a number never changes** once a sheet or a rule is cited elsewhere. Assign the
next free number of its kind; never renumber to close a gap. A feature sheet declares its id in `toc.json`
(`"feature": "F-01"`), never in the Markdown; a rule declares its id on its `:::rule` container
(`:::rule{id="BR-12" …}`, `:::regle{id="RG-12" …}`).

**The access box.** A feature sheet opens with an "Access" table before any explanation: module, who can use
it (`[[perm …]]`), prerequisites, the version and date this page was last checked. A `screen` or `editor` page
puts its permissions **last** (`[!PERMISSIONS]`), because its reader wants to understand the screen first and
checks who may use it afterwards; a feature sheet's reader often wants exactly the opposite — "can I even do
this?" — before reading how it works. Put the access information where the page's own reader looks for it
first.

**One rule, one statement, one example.** A business rule (`:::rule` / `:::regle`) is one or two sentences,
followed by exactly one worked example in the form **Given** a starting condition, **when** the triggering
action happens, **then** the result that follows:

```markdown
:::rule{id="BR-12" title="An order above the threshold waits for a manager"}
An order whose total is at or above the configured threshold is not approved automatically.

**Example.** **Given** an order of 12,000 € and a threshold of 10,000 €, **when** the buyer submits it,
**then** it waits for a manager's approval.
:::
```

Keep the example to one scenario with real, specific numbers — never "a large order" when "an order of
12,000 €" is one line longer and removes all doubt. A rule that needs two examples to be understood is
usually two rules.

**No code in the Business space.** A page whose effective space is `business` cites no `file:line` proof: the
build warns (`business.technical`) when one slips in. State the rule in business terms and link to its
`counterpart` for the implementation detail ("how the threshold is actually enforced: see
`take-over/api-surface`"). This is the same split as "one page, one reader" in
[structure.md](structure.md#one-page-one-reader-diátaxis): a business reader should never have to skip past a
`file:line` proof to find the sentence that answers their question.

## 14. Claim status: verified, deduced, unknown

Section 3 above states the rule for free-running prose ("(inferred)", "to be confirmed"). The Takeover space
also has a compact badge for the same three states, used inline on a value rather than on a whole paragraph —
typically in a table built from `::facts{…}` and completed by hand (ARCHITECTURE.md §6.9):

| Badge (en · fr) | Means | Example |
|---|---|---|
| `[[verified …]]` · `[[verifie …]]` | Read directly in the code or in a dated production check; the text after the badge is its proof | `[[verified lib/orders.ts:42]]` |
| `[[deduced …]]` · `[[deduit …]]` | A conclusion drawn from what was read, not observed directly | `[[deduced order status transitions imply a single approver]]` |
| `[[unknown]]` · `[[inconnu]]` | Nobody has checked; name who could answer, elsewhere on the page | `[[unknown]]` — ask the payments team |

Use the free-text form ("observed", "inferred", "to be confirmed") for a sentence or a whole legend (the
technical architecture document, §3 above); use the badge for one cell of a table or one claim inside a
sentence, where a full phrase would not fit. Never mark something `[[verified]]` on the strength of the
existing repository documentation alone (§1): verify it in the code, or mark it `[[deduced]]`.

## 15. The risk register

A `findings` page (§9 above numbers the findings themselves) is also the project's risk register
(ARCHITECTURE.md §6.9): every finding carries, beyond its number, severity and proof, who decides what happens
to it and where that stands. Four more facts, one per finding:

| Fact | Values |
|---|---|
| Owner | Who decides — a name or a role, never "the team" |
| Decision | Fix, accept, transfer (to a contract, an insurer, another team) or avoid (remove the feature that causes it) |
| Status | Open, in progress, done, accepted |
| Due date | When it is due, or "none" when the decision is to accept it indefinitely |

On a critical finding's own section, add one line after Finding / Impact / Recommendation: "Owner · Decision ·
Status · Due". On a table of findings, combine the four into one **Follow-up** column: four separate columns
rarely fit the reading width once Where and Recommendation are already there, and splitting them only matters
once a project tracks remediation outside this page too. A finding whose Follow-up is still blank is not yet
triaged — that itself belongs in "The essentials in one minute".
