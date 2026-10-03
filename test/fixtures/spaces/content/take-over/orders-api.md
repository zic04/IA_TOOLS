## Endpoints

| Method | Path | Effect |
|---|---|---|
| GET | `/api/v1/orders` | The orders list, filtered by status, customer and date |
| POST | `/api/v1/orders` | Creates an order |

The orders list of the users (marker-takeover-9z) calls the first endpoint: see [the orders list](#/use/orders).

## Errors

An unknown status is refused with an HTTP 400 answer.
