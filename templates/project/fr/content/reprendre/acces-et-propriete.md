## En bref

<!-- consigne : qui contacter en premier pour quoi (propriétaire métier, propriétaire technique, astreinte), et la confiance globale dans la cartographie ci-dessous : totalement connue, partiellement, largement inconnue. -->

Une ou deux phrases, puis la confiance dans cette page.

## Qui possède quoi

<!-- consigne : une ligne par actif : domaine, dépôt, hébergement, CI/CD, base de données, paiement, e-mail, chaque compte d'outil IA. « Propriétaire » est un nom ou une équipe réelle ; quand seul un rôle est connu, dites-le dans « Statut » plutôt que d'inventer un nom. -->

| Actif | Propriétaire | Où | Comment en faire la passation | Statut |
|---|---|---|---|---|
| Base de données de production | — | `hote:port` | Réinitialiser le mot de passe, créer un compte par opérateur | Propriétaire inconnu |

## Secrets et où ils vivent

<!-- consigne : facultatif. Chaque endroit où vit un secret (coffre, variables CI, un fichier .env de production, le gestionnaire de mots de passe d'un collègue) — jamais la valeur elle-même. Lancez d'abord `doc-kit facts --source secrets`, puis recoupez-le ici. -->

| Secret | Où il vit | Statut |
|---|---|---|
| Secret d'exemple | Variable CI `NOM` | À faire tourner |

## Comptes des outils IA

<!-- consigne : facultatif. Chaque compte d'assistant IA de codage utilisé sur ce code (Claude Code, Copilot, Cursor…), qui le détient, et quel accès il porte (dépôt, cloud, registre de paquets). -->

| Outil | Compte | Accès | Propriétaire |
|---|---|---|---|
| Outil d'exemple | — | Dépôt (écriture) | Inconnu |

## Propriétaires inconnus

<!-- consigne : la liste que la checklist de passation ci-dessous existe pour vider : chaque actif de « Qui possède quoi » dont le propriétaire est « — » ou « Inconnu », répété ici pour qu'il ne soit pas oublié. -->

- Actif sans propriétaire connu : ce qu'il faut faire pour en trouver un.

## Checklist de passation

<!-- consigne : facultatif. Les étapes concrètes pour vraiment recevoir ce qui est listé ci-dessus : réinitialiser les secrets partagés, créer des comptes nominatifs, révoquer les accès de l'équipe partante, confirmer que chaque ligne de « Propriétaires inconnus » est close. -->

:::etapes
1. **Réinitialiser chaque secret partagé** : base de données, API tierces, clés de signature.
2. **Créer un compte nominatif par opérateur** : plus d'identifiants partagés.
3. **Révoquer l'accès de l'équipe précédente** : une fois que la nouvelle confirme que ça marche sans elle.
:::
