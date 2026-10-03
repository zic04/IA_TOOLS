## Vue d'ensemble

Acme Orders comporte trois blocs : le navigateur, l'API et la base de données (marker-takeover-9z).

::diagram{id="flow" title="Comment une commande circule"}

> [!HOW]
> Chaque requête du navigateur passe par l'API, qui lit ou écrit dans la base de données.

## Exécuter en local

```bash
npm ci
npm run dev
```
