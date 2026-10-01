## Overview

Acme Orders has three blocks: the browser, the API and the database. The REST API links the first two.

::diagram{id="flow" title="How an order flows"}

> [!HOW]
> Every browser request goes through the API, which reads or writes the database.

## Run it locally

```bash
npm ci
npm run dev
```

> [!RECIPE] Check the installation
> Open `http://localhost:3000/api/v1/health`: the answer must be `ok`.
