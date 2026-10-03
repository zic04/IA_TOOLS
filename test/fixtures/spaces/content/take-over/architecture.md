## Overview

Acme Orders has three blocks: the browser, the API and the database (marker-takeover-9z).

::diagram{id="flow" title="How an order flows"}

> [!HOW]
> Every browser request goes through the API, which reads or writes the database.

## Run it locally

```bash
npm ci
npm run dev
```
