## En bref

Acme Orders est une démo : elle n'a ni déploiement en production ni équipe identifiée. Le tableau ci-dessous montre
à quoi ressemblerait une vraie passation de ce code, rempli dans la mesure où le code lui-même répond.

## Qui possède quoi

| Actif | Propriétaire | Où | Comment le transmettre | Statut |
|---|---|---|---|---|
| Dépôt | — | Là où le dépôt de ce kit est cloné | Transférer le dépôt ou ajouter un copropriétaire | Propriétaire inconnu |
| Hébergement | — | Aucun : `node serve.mjs` ne tourne que sur une machine locale | Sans objet, aucun hébergeur de production n'existe | Propriétaire inconnu |
| Jeton de session | — | En mémoire seulement ([[verified serve.mjs:35]]), perdu à chaque redémarrage | Rien à renouveler : il est aléatoire et jamais conservé | Connu |
| Données de démo (`data.json`) | — | Versionnées avec le dépôt | Modifier le fichier, ou appeler `POST /api/demo/reset` | Connu |

## Secrets et où ils vivent

Acme Orders ne détient aucun secret à renouveler : il n'y a ni clé d'API, ni mot de passe, ni clé de signature dans le
code. La seule valeur propre à une session est le jeton de session aléatoire ([[verified serve.mjs:35]]), conservé
dans une `Map` en mémoire du serveur et jamais écrit sur disque ([[verified serve.mjs:21]]).

## Propriétaires inconnus

- Dépôt et hébergement : une démo n'a pas d'équipe à nommer ; un vrai déploiement indiquerait ici une personne ou une
  équipe, avant que le reste de cette page ait un sens.

## Checklist de passation

:::steps
1. **Clonez le dépôt** et lancez `node serve.mjs` pour vérifier qu'il démarre toujours.
2. **Décidez qui en est propriétaire** : même une démo gagne à avoir un mainteneur nommé.
3. **Lisez [la surface de l'API](#/secure/api-surface)** avant de l'exposer au-delà d'une machine locale : aujourd'hui,
   rien ne vérifie qui a le droit de faire quoi.
:::
