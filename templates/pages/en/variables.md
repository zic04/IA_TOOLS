## In short

<!-- guidance: where the variables are declared (service, settings tab), how many, how many are references to the secret vault, how many are read by the code, and the missing ones that have a real effect. Values are never copied: the page says what the code expects. -->

- **N** variables declared, **N** of them references to the secret vault.
- **N** are read by the code; the others only serve the platform.
- The missing variables that have a real effect, with their finding (P10).

> [!NOTE] The sources of this page
> - **Cloud console**: names and sources of the variables, observed on DD Month YYYY.
> - **Code**: every read cited with its file and line.
> - **Infrastructure as code**: the planned default values, which are not observed values.

## The variables, one by one

<!-- guidance: optional. One ### subsection per family (authentication, database, storage, AI, platform), with the number of variables. The total count goes in "In short", not in this heading. -->

### Family (n)

| Variable | Source | Read by the code | Role and expected value | Remark |
|---|---|---|---|---|
| `VARIABLE_NAME` | Service or vault | `path/file.ts:17` | Values understood by the code, and the default | Infrastructure default, known pitfall |

## Missing or ineffective

<!-- guidance: optional, or as a sub-page. The variables read by the code but missing, with their real consequence; those that are set without effect, with the proof. -->

| Variable | Finding | Consequence |
|---|---|---|
| `VARIABLE_NAME` | Missing, or overridden by the database | What does not work, and the related finding |

## To check

<!-- guidance: what to look at the next time someone opens the cloud console, as concrete steps. -->

:::steps
1. **Values**: the variables whose value decides a behaviour.
2. **Vault references**: whether they resolve, and the date of the latest version of the secrets.
3. **Missing variables**: the decision to take for each one.
:::
