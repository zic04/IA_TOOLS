## En bref

<!-- consigne : la ou les commandes qui installent et démarrent l'application en local, et qui appeler quand la suite ne s'applique pas. -->

Exemple : « `npm install && npm run dev` démarre toute la pile en local ; la production se déploie à chaque envoi sur la branche principale. »

## Installation

<!-- consigne : les commandes exactes, les versions qu'elles demandent (environnement d'exécution, base de données), et les fichiers qu'elles lisent (un fichier d'exemple → le vrai). -->

:::etapes
1. **Installer les dépendances** : la commande d'installation du gestionnaire de paquets.
2. **Copier le fichier d'environnement d'exemple** : renseigner les valeurs qu'il nomme (ne jamais committer le vrai).
:::

## Construction

<!-- consigne : facultatif. La commande de construction, ce qu'elle produit, et combien de temps elle prend. -->

La commande de construction produit le paquet de production.

## Déploiement

<!-- consigne : le vrai chemin de déploiement : un nom de pipeline, une commande manuelle, le tableau de bord d'un fournisseur, avec le fichier:ligne de la définition du pipeline. -->

:::etapes
1. **Envoyer sur la branche principale** : le pipeline [[verifie chemin/fichier.yml:1]] construit et déploie automatiquement.
2. **Surveiller le déploiement** : son tableau de bord, et à quoi ressemble une exécution saine.
:::

## Retour arrière

<!-- consigne : comment annuler un mauvais déploiement : redéployer la version précédente, le retour arrière propre d'une migration, un indicateur de fonctionnalité. -->

- Redéployer la version précédente depuis le tableau de bord du fournisseur.

## Tâches planifiées

<!-- consigne : facultatif. Chaque tâche planifiée (cron), ce qu'elle fait, et ce qui se passe quand elle échoue silencieusement. -->

| Tâche | Fréquence | Ce qu'elle fait | Preuve |
|---|---|---|---|
| Tâche d'exemple | Quotidienne | Ce qu'elle fait | [[deduit chemin/fichier.ts]] |

## Sauvegarde et restauration

<!-- consigne : où les sauvegardes sont prises, à quelle fréquence, et la vraie procédure de restauration (testée ou non). -->

:::etapes
1. **Sauvegardes** : à quelle fréquence, et où elles sont conservées.
2. **Restauration** : la vraie procédure, vers une nouvelle instance, jamais sur place.
:::

## Quand ça casse

<!-- consigne : facultatif. Les premières vérifications pour les incidents les plus fréquents, chacune avec son remède. -->

> [!NOTE] Premiers réflexes
> - Vérifier l'outil de suivi des erreurs avant tout.
> - Confirmer que la base de données est atteignable depuis le réseau de l'application.
