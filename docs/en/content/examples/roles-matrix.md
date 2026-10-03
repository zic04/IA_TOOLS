> [!NOTE] About this example
> This page is the example of the `roles-matrix` template, written for Acme Orders.

## In short

Acme Orders ships with four roles: **Sales rep**, **Sales manager**, **Finance** and **Administrator**. A user holds exactly one role; there is no add-on permission granted outside it.

## The roles

- **Sales rep**: creates and edits orders of their own region; cannot approve one above the threshold.
- **Sales manager**: everything a sales rep can do, plus approving or rejecting the orders of their own region ([the order approval feature](#/examples/feature)).
- **Finance**: reads every region's orders and sets the approval threshold; does not create or edit orders.
- **Administrator**: every permission below, in every region; the only role that can reassign another user's role.

## Who can do what

::roles{}

## Responsibilities

The sales manager who approves an order is accountable for it: Finance's monthly review traces every approval back to the manager who made it. A sales rep is never shown as the approver, even for their own orders.

## How to get a role

Roles are assigned on the **Users** admin screen by an **Administrator**; there is no self-service request. A new sales manager is set up by Finance, who also confirms the region they will cover.
