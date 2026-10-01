## In short

<!-- guidance: the group that holds the deployment (an Azure resource group, a Google Cloud project, an AWS account or stack), its region and the date of the observation; a table of the families with their number of resources; then the sentence that sums up the setup. Example: "The whole application runs in a single container." -->

| Family | Count | Resources |
|---|---|---|
| Compute | 0 | The compute resources, and those that serve nothing |

> [!NOTE] Where these resources come from
> - **Created by the infrastructure as code** of the repository: which ones.
> - **Provided by the platform team**, outside this repository: which ones.
> - **Created automatically by the cloud provider**: which ones.

## Compute

<!-- guidance: one row per resource; the "Used by" column: the code, the variables, the identities, the settings. The same table for every family. -->

| Resource | Type | Role | Used by |
|---|---|---|---|
| `resource-name` | Exact type | What it really carries | Proof (`infra/app.tf:19-46`) |

## Data

<!-- guidance: databases and storage (including the storage of the infrastructure-as-code state): role, replication, public access, what uses them. -->

| Resource | Type | Role | Used by |
|---|---|---|---|
| `resource-name` | Exact type | What it holds | What reads or writes it |

## Secrets

<!-- guidance: the vault, its secrets by name (never their value), who reads them, who renews them. -->

| Resource | Type | Role | Used by |
|---|---|---|---|
| `vault-name` | Secret vault | The secrets, by name | The references that read them |

## Network

<!-- guidance: optional. Private endpoints, virtual network integration, public inbound access: what is established and what remains to be confirmed. -->

## Monitoring

<!-- guidance: logs, telemetry, alert rules: what each tool really receives, and who is notified. -->

| Resource | Type | Role | Used by |
|---|---|---|---|
| `resource-name` | Exact type | What it collects | What feeds it |

## Backup

<!-- guidance: what really backs up each piece of data (the mechanism of each service), and what does not protect it. -->

## Comparison with the documentation

<!-- guidance: optional. The gaps between this observation and the deployment documentation of the repository. -->

## What the application uses outside this group

<!-- guidance: identity, AI gateways, registries, internal services, shared network: what lies outside the group, and the page that details it. -->

- **Service**: what the application expects from it.
