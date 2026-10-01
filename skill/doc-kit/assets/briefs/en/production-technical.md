# Brief — production technical pages: architecture document, resources, variables ({{product}}, code {{code}})

You write, in {{languageName}}, the "production" part of the documentation site of **{{product}}**{{#if description}} ({{description}}){{/if}}:
the technical architecture document, the production resources and environment variables, and their gaps with the
code. Whoever takes the project over must find what runs, where, how it is reached, what the application talks to,
and what is missing.

## Your sources, and only them

- The **portal screenshots** provided by the application owner: `{{portalCaptures}}` (list of resources, application
  configuration and variables, secret references, network…). Read each picture with Read. You have NO access to the
  cloud portal nor to production.
{{#if infraDir}}- The **infrastructure code**, READ-ONLY: `{{infraDir}}`. No `terraform`, `bicep`, `az`, `aws`, `gcloud`, `pulumi`
  or similar command; open no state file (`*.tfstate` or equivalent) and no file of secret values.
{{/if}}- The **application code**: `{{appDir}}`, version {{version}}: variables read (`process.env`, `os.environ`…), default
  values, Dockerfile, build and deployment scripts, migrations run at start-up.
- The existing Take over pages (architecture, deployment, operations, security) and
  `{{contentDir}}/{{findingsPage}}.md` with its sub-pages{{#if reads}}; in particular: {{reads}}{{/if}}.

## Your pages

{{pages}}

Templates: `architecture`, `technical-sub`, `resources`, `variables` (`{{kitPath}}/templates/pages/{{language}}/`).
Your diagram: `{{diagramsDir}}/{{diagram}}.svg`. The pages are ALREADY declared in `{{tocFile}}`: change neither ids
nor titles.

## What each page holds

- **Architecture document** (`architecture`): `## In short` (what runs, where, how it is reached, what it talks to, as
  bullets), with a `> [!NOTE] How to read this document` callout that defines provenance; `## In this part`;
  `## The diagram` (NUMBERED flows; dashed lines for missing or inoperative flows); `## Numbered flows` (table: no.,
  from, to, protocol, authentication, proof); `## Components`; `## What this document does not show`;
  `## Who manages what`. Sub-pages (`technical-sub`) when needed (network and secrets; data and monitoring).
- **Resources** (`resources`): `## In short`; one section per family, `## Compute`, `## Data`, `## Secrets`,
  `## Network`, `## Monitoring`, `## Backup` (name, type, role, finding); `## Comparison with the documentation` (the
  deployment documentation of the repository); `## What the application uses outside this group`.
- **Production variables** (`variables`): `## In short`; `## The variables, one by one`, one `###` per family; for each
  variable: name, displayed value (or "(masked)", or "secret-store reference: <secret name>" for a vault reference
  such as Azure Key Vault, AWS Secrets Manager or GCP Secret Manager), where the code reads it (`file:line`), default
  when missing, real effect; `## Missing or ineffective`: variables read by the code but missing in production (set in
  the database: normal; falling back to a default: real consequence), variables defined but without effect, or with a
  surprising effect; `## To check` at the next portal access (`:::steps`).

## Provenance (mandatory)

Every statement carries its source: "From the portal" (the owner's screenshots, with their date); the name of the
infrastructure tool ("Terraform", "Bicep", "CloudFormation"…) for what its code plans, recalling that production may
have drifted; "Inferred" for a conclusion drawn from these sources; "To confirm" for an unknown, to ask the
infrastructure team.

## Rules

- NEVER copy a secret value (connection string, key, password, signed URL, token), even when readable on a screenshot:
  write the name and "(masked)". Also mask subscription, account, project and tenant ids, and GUIDs.
- Put no portal screenshot in the site without the owner's written consent; when it is allowed, mask it first.
- Write ONLY your pages and your diagram. Touch neither `{{tocFile}}`, `{{glossaryFile}}`, the kit, other pages, nor
  the application or the infrastructure. No git command.
- Nothing invented; what is inferred is said to be inferred.
- Diagram: `viewBox` 900 wide, no hard-coded colour, the site's `d-*` diagram classes only (table in
  `{{kitPath}}/standard/writing.md`), prefixed `<marker>` ids, text from
  11 to 14 px, reviewed in light and dark.
- Production-only findings: **candidates of the P series** in your report (finding, proof: screenshot or `file:line`,
  proposed severity), after checking they are not already numbered.

## Checks (from `{{docDir}}`)

- `npx doc-kit build --draft`: no ✖ or ⚠ for your pages; `npx doc-kit check tables`; `npx doc-kit check secrets`.
- Review the diagram in light and dark with `npx doc-kit view`; Read the pictures; delete them afterwards.

## Final report ({{languageName}}, 350 words at most)

Pages written (words); number of resources and variables described; flows of the diagram, including missing or
inoperative ones; **candidate findings** of the P series; errors in existing pages (file, sentence, proof); "To confirm"
questions for the infrastructure team; proposed glossary terms.
