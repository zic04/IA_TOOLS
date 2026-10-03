# The documentation standard

This folder is the **quality standard** for the sites built with doc-kit. It says what a site must contain, how to write it, how to check it and when it is ready to hand over.

It holds no theory. Every rule comes from what worked on real product documentation sites, built and handed over with this method:
- a site of about 170 pages, captured **on production, read-only**, with a complete "Take over" section (technical architecture document, five end-to-end journeys, troubleshooting by symptom, more than a hundred numbered findings);
- a site of about 115 pages, captured on a **prepared local demo**, with very rich configuration editors and step-by-step configuration recipes.

When a rule only makes sense for one of these two situations (production or demo), the text says so.

The examples use a fictional product, **Acme Orders**: an order-management web app (orders, customers, an approval workflow, invoices, roles, an administration area and an AI assistant), built with Next.js (App Router), whose users sign in through an identity provider.

## How to use it

| You want to… | Read | Then run |
|---|---|---|
| Start a site | [structure.md](structure.md), [config.md](config.md) | `doc-kit init` |
| Write a page | [templates.md](templates.md), [writing.md](writing.md) | `doc-kit new <page-id> --template <type>` |
| Take captures | [captures.md](captures.md) | `doc-kit connect`, `doc-kit capture --preview` |
| Know whether it is ready | [quality.md](quality.md), [maturity.md](maturity.md) | `doc-kit build`, `doc-kit check all`, `doc-kit audit` |
| Hand the site over | [delivery.md](delivery.md) | `doc-kit export <target>` |

The page templates are in `templates/pages/en/` and `templates/pages/fr/`; the skeleton of a project is in `templates/project/`.

## Index

Every document exists in English (`.md`) and in French (`.fr.md`).

| File | Content |
|---|---|
| [structure.md](structure.md) | The two spaces (Business, Takeover), their parts, the groups, the required Takeover pages, `counterpart`, the home-page guided tours, sub-pages, when to adapt |
| [templates.md](templates.md) | The 28 page types: purpose, sections in order, length, example, common mistakes |
| [templates.json](templates.json) | The machine-readable version, read by the build and by `doc-kit audit`: `en` and `fr` sections, required sections, `maxWords`, aliases |
| [writing.md](writing.md) | Nothing made up, `file:line` proofs, exact labels, observed gaps, links, glossary, numbering of findings, diagrams |
| [captures.md](captures.md) | Capture safety on production, the session, masking, zone quality, production or demo |
| [quality.md](quality.md) | Blocking gates and warnings, with the command that checks each one |
| [maturity.md](maturity.md) | Levels 1 to 4, each measurable by `doc-kit audit`, with a worked example |
| [delivery.md](delivery.md) | The handover checklist |
| [config.md](config.md) | Two complete, commented `doc.config.mjs` files for fictional applications |

## The five rules that matter most

1. **Nothing made up.** Every label, default, bound and behaviour is checked in the code, with its `file:line` proof.
2. **Explain how it works, not only the screen**: who computes, in which order, with which limits, and what the user sees change.
3. **Describe gaps; never fix the application** from the documentation.
4. **Production is never written to** during a capture, and the session is deleted at the end.
5. **The strict build passes** before any handover.

## Changing the standard

The standard follows the contract in `ARCHITECTURE.md` (§6.4 and §7). A change to `templates.json` changes what the build requires. It goes, in this order:
1. into the contract, if it touches the format;
2. into this folder, in both languages;
3. into both page templates (`templates/pages/en/` and `templates/pages/fr/`);
4. into `CHANGELOG.md`.
