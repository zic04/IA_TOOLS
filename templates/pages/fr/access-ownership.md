## En bref

<!-- consigne : qui contacter d'abord et pour quoi (propriétaire métier, propriétaire technique, astreinte), et le niveau de confiance global de cette cartographie : entièrement connue, partiellement, en grande partie inconnue. Exemple : « La moitié des secrets de production n'a pas de propriétaire connu ; commencez la reprise par la récupération de comptes ci-dessous. » -->

Une ou deux phrases, puis le niveau de confiance de cette page.

## Qui possède quoi

<!-- consigne : une ligne par actif (domaine, dépôt, hébergement, CI/CD, base de données, paiement, e-mail, chaque compte d'outil IA). « Propriétaire » est un nom ou une équipe réelle ; quand seul un rôle est connu, dites-le dans « Statut » plutôt que d'inventer un nom. -->

| Actif | Propriétaire | Où | Comment le transmettre | Statut |
|---|---|---|---|---|
| Base de données de production | — | `hote:port` | Réinitialiser le mot de passe, créer un compte par opérateur | Propriétaire inconnu |

## Secrets et où ils vivent

<!-- consigne : facultatif. Chaque endroit où vit un secret (coffre, variables CI, fichier .env de production, gestionnaire de mots de passe d'un collègue) ; jamais la valeur elle-même. À recouper avec facts/secrets.json, écrit par `doc-kit facts`. -->

| Secret | Où il vit | Preuve | Statut |
|---|---|---|---|
| Secret d'exemple | Variable CI `NOM` | [[verifie chemin/fichier.yml:12]] | À faire tourner |

## Comptes des outils IA

<!-- consigne : facultatif. Chaque compte d'assistant IA de codage utilisé sur ce code (Claude Code, Copilot, Cursor…), qui le détient, et ce qu'il donne comme accès (dépôt, cloud, registre de paquets). -->

| Outil | Compte | Accès | Propriétaire |
|---|---|---|---|
| Outil d'exemple | — | Dépôt (écriture) | Inconnu |

## Propriétaires inconnus

<!-- consigne : la liste que la checklist de passation ci-dessous existe pour vider : chaque actif de « Qui possède quoi » dont le propriétaire est « — » ou « Inconnu », répété ici pour qu'il ne soit pas oublié. -->

- Actif sans propriétaire connu : comment en trouver un.

## Checklist de passation

<!-- consigne : facultatif. Les étapes concrètes pour recevoir réellement ce qui précède : réinitialiser les secrets partagés, créer des comptes nominatifs, révoquer l'accès de l'équipe sortante, confirmer que chaque ligne de « Propriétaires inconnus » est close. -->

:::etapes
1. **Réinitialiser chaque secret partagé** : base de données, API tierces, clés de signature.
2. **Créer un compte nominatif par opérateur** : plus de connexion partagée.
3. **Révoquer l'accès de l'équipe précédente** : une fois que la nouvelle confirme que ça marche sans elle.
:::
