## En bref

<!-- consigne : le groupe qui porte le déploiement (un groupe de ressources Azure, un projet Google Cloud, un compte ou une pile AWS), sa région et la date du constat ; un tableau des familles avec leur nombre de ressources ; puis la phrase qui résume l'implantation. Exemple : « Toute l'application tourne dans un seul conteneur. » -->

| Famille | Nombre | Ressources |
|---|---|---|
| Calcul | 0 | Les ressources de calcul, et celles qui ne servent à rien |

> [!NOTE] D'où viennent ces ressources
> - **Créées par l'infrastructure as code** du dépôt : lesquelles.
> - **Fournies par l'équipe plateforme**, hors de ce dépôt : lesquelles.
> - **Créées automatiquement par le fournisseur cloud** : lesquelles.

## Calcul

<!-- consigne : une ligne par ressource ; la colonne « Ce qui s'en sert » : le code, les variables, les identités, les réglages. Même tableau pour chaque famille. -->

| Ressource | Type | Rôle | Ce qui s'en sert |
|---|---|---|---|
| `nom-de-la-ressource` | Type exact | Ce qu'elle porte réellement | Preuve (`infra/app.tf:19-46`) |

## Données

<!-- consigne : bases et stockage (y compris le stockage de l'état de l'infrastructure as code) : rôle, réplication, accès public, ce qui s'en sert. -->

| Ressource | Type | Rôle | Ce qui s'en sert |
|---|---|---|---|
| `nom-de-la-ressource` | Type exact | Ce qu'elle contient | Ce qui la lit ou l'écrit |

## Secrets

<!-- consigne : le coffre, ses secrets par nom (jamais leur valeur), qui les lit, qui les renouvelle. -->

| Ressource | Type | Rôle | Ce qui s'en sert |
|---|---|---|---|
| `nom-du-coffre` | Coffre de secrets | Les secrets, par nom | Les références qui les lisent |

## Réseau

<!-- consigne : facultatif. Points d'accès privés, intégration au réseau virtuel, entrées publiques : ce qui est établi et ce qui reste à confirmer. -->

## Supervision

<!-- consigne : journaux, télémétrie, règles d'alerte : ce que chaque outil reçoit réellement, et qui est prévenu. -->

| Ressource | Type | Rôle | Ce qui s'en sert |
|---|---|---|---|
| `nom-de-la-ressource` | Type exact | Ce qu'elle collecte | Ce qui l'alimente |

## Sauvegarde

<!-- consigne : ce qui sauvegarde réellement chaque donnée (le mécanisme de chaque service), et ce qui ne la protège pas. -->

## Comparaison avec la documentation

<!-- consigne : facultatif. Les écarts entre ce constat et la documentation de déploiement du dépôt. -->

## Ce que l'application utilise hors de ce groupe

<!-- consigne : identité, passerelles d'IA, registres, services internes, réseau partagé : ce qui sort du groupe, et la page qui le détaille. -->

- **Service** : ce que l'application en attend.
