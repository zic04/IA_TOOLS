## Vue d'ensemble

Acme Orders se compose de trois blocs : le navigateur, l'API et la base de données. L'API REST relie les deux
premiers.

::diagram{id="flow" title="Le parcours d'une commande"}

> [!HOW]
> Chaque requête du navigateur passe par l'API, qui lit ou écrit dans la base de données.

## Le lancer en local

```bash
npm ci
npm run dev
```

> [!RECIPE] Vérifier l'installation
> Ouvrez `http://localhost:3000/api/v1/health` : la réponse doit être `ok`.
