## In short

<!-- guidance: the overall exposure in one paragraph: what an attacker could realistically reach, and the headline mitigation already in place. -->

Example: "The main risk is cross-tenant data access through a missing isolation check on one route."

## The data flow diagram

<!-- guidance: a diagram showing the data flows and the trust boundaries they cross (threats below are organised by the boundary they cross). -->

::diagram{id="threat-dfd" title="Data flows and the trust boundaries they cross."}

## Trust boundaries

<!-- guidance: each boundary the diagram shows (browser to server, server to database, server to a third party), in the order used below. -->

| Boundary | What crosses it |
|---|---|
| Browser → server | The session, every request |

## Threats

<!-- guidance: organised by trust boundary, in STRIDE categories (Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege); each threat with its proof or its status when unverified. -->

### Browser → server

- **Information disclosure**: a missing check would let a user read another tenant's data ([[verified path/file.ts:42]]).

## Mitigations

<!-- guidance: optional. What already addresses a threat above, each one pointing back to its threat. -->

- One mitigation, pointing back to the threat it addresses.

## Accepted risks

<!-- guidance: optional. A risk knowingly left open, who accepted it and when (feeds the findings register's "Decision" column). -->

- One risk, who accepted it, and when.
