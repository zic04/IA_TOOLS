# The orders list

## What it is for

The orders screen lists every order and lets a manager **Approve** one once it is above the configured threshold.

## How it works

The threshold itself is enforced in the code, see `lib/orders.ts:42`.

## The screen

A table of orders, with a column per field.

## Each action

**Approve** validates the order.

## Pitfalls and limits

None known yet.

## In production

Nothing special.
