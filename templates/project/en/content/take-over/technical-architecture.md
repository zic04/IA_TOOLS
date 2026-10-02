## In short

<!-- guidance: what this document describes (the production setup: what runs, where, how it is reached, what the application talks to), what it is rebuilt from (cloud console, infrastructure as code, code), and that it does not replace an architecture document validated by the infrastructure team. Then 6 to 8 bullets: containers, data, network, services outside the group, monitoring, backup, number of flows. -->

- **What runs**: the applications and their image.
- **The data**: databases, storage, secret vault, and how they are reached.
- **The network**: inbound, outbound, private endpoints.
- **Outside the group**: identity, gateways, internal services.

> [!NOTE] How to read this document
> - "**From the console**": observed, dated.
> - "**Infrastructure as code**": planned by the infrastructure repository; production may have drifted.
> - "**Inferred**": a conclusion drawn from these sources, not observed directly.
> - "**To be confirmed**": unknown; ask the infrastructure team.

## In this part

<!-- guidance: optional, as soon as the document has sub-pages (network and secrets; data, backup and monitoring). Column 1 = a link. -->

| Sub-page | What you will find there |
|---|---|
| Network, identities and secrets | Endpoints, inbound and outbound traffic, managed identities, secrets. |

## The diagram

<!-- doc-kit:capture=app -->
<!-- guidance: the architecture diagram, as an SVG of the site, or as an annotated image (:::screen) when the architecture team supplies its own. The markers point to the table of flows; missing or broken flows are dotted (d-dashed). Only the site's d-* classes, no hard-coded colour. -->
<!-- doc-kit:capture=none -->
<!-- guidance: the architecture diagram, as an SVG of the site. The markers of the diagram point to the table of flows; missing or broken flows are dotted (d-dashed). Only the site's d-* classes, no hard-coded colour. -->
<!-- doc-kit:end -->

::diagram{id="r-architecture" title="The application in production: what runs, the data reached through private endpoints, the outbound traffic. The markers point to the table of flows; dotted: a flow that is missing or does not work."}

## Numbered flows

<!-- guidance: one flow per row, numbered as on the diagram, with the proof in the code or in the infrastructure. Mark as "Missing" or "Not working" what does not work, with the related finding. -->

| No. | From → to | Protocol | Authentication | Data and code |
|---|---|---|---|---|
| **#1** | Users → application | HTTPS | Session | What goes through, and the proof (`path/file.ts`) |

> [!NOTE] What the table leaves open
> - **#1**: what remains unknown about this flow.

## Components

<!-- guidance: optional. One row per component, with its real name in production and the page that details it. -->

| Component | Production name | Role | Further reading |
|---|---|---|---|
| Application | `resource-name` | What it carries | The page that details it |

## What this document does not show

<!-- guidance: the list of unknowns to confirm with the infrastructure team: access, outbound traffic, DNS, registry, backup, monitoring, permissions. -->

> [!NOTE] To confirm with the infrastructure team
> - **Topic**: the precise question to ask.

## Who manages what

<!-- guidance: the responsibilities, by scope: resources and network, image and deployment, settings stored in the database, the application's registration with the identity provider. -->

> [!PERMISSIONS] Responsibilities
> - **Resources, network, variables, secrets, monitoring**: the team that manages them, and with which tool.
> - **Application image**: who builds and deploys it.
> - **Settings stored in the database**: the application's administrators, and on which screen.
