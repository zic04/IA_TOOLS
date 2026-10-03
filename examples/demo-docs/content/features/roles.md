## In short

Acme Orders' feature sheets describe two roles, **Team member** and **Approver**: a team member is additive
into an approver. The demo build below does not check them (see the note under "Who can do what"); a
production build would enforce the permissions named on each feature sheet.

## The roles

- **Team member**: signs in and uses [Track orders](#/features/track-orders) — reads the list, filters it, opens
  an order.
- **Approver**: everything a team member can do, plus [Approve an order](#/features/approve-order) — opening an
  order's **Approval chain**.

## Who can do what

::roles{}

> [!NOTE] Not enforced in this demo
> The table above is the intended model. The demo build checks only that someone is signed in, not which role
> they hold: today, any signed-in person can open an **Approval chain** ([the API surface](#/secure/api-surface)
> describes the gap for the takeover team).

## Responsibilities

Acme Orders keeps no record of who approved what beyond the chain itself: the demo does not distinguish an
approver's decision from anyone else opening the same link.

## How to get a role

Not applicable: this demo has no user administration screen. Any e-mail and password signs in as the same
single demo account.
