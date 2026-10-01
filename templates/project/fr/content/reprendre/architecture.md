## En bref

<!-- consigne : en 5 à 10 lignes, comment {{name}} est construite : le nombre de conteneurs, la pile (langages, cadres, base, stockage, identité, services externes), les couches du code et leur sens d'appel, et la version vérifiée. Exemple : « Un seul conteneur porte les écrans, l'API, les actions serveur et les migrations de la base. » -->

1. **Ce qui tourne** : les applications et leur image.
2. **La pile** : langages, cadres et versions (`package.json`).
3. **Les couches** : de l'écran à la base, et ce que chacune a le droit d'appeler.

## Dans cette partie

<!-- consigne : au-delà d'environ 2 000 mots, découpez en sous-pages (par exemple la pile, les principes, les flux principaux) et listez-les ici, colonne 1 = lien. Supprimez la section tant que la page n'a pas de sous-page. -->

Cette page donne la vue d'ensemble. Le détail est réparti en sous-pages, accessibles aussi depuis le menu :

| Sous-page | Ce que vous y trouverez |
|---|---|
| Titre de la sous-page | Ce qu'on y trouve, en une phrase. |

## Le schéma

<!-- consigne : le grand schéma, en SVG dans diagrams/architecture.svg (viewBox de 900 de large, seulement les classes d-* du site, aucune couleur en dur), avec une légende qui dit comment le lire. -->

::schema{id="architecture" titre="L'application, ses couches et ce qu'elle appelle : base, stockage, identité, services externes."}

## Premier sujet

<!-- consigne : renommez ce titre. Un titre ## par sujet : les principes d'architecture, les flux principaux (ouvrir l'application, l'action principale du produit), développement et production. Chaque affirmation porte sa preuve fichier:ligne. -->

| Élément | Où | Détail |
|---|---|---|
| Nom | `chemin/fichier.ts:12` | Ce qu'il fait réellement |

## Pièges et écarts constatés

<!-- consigne : facultatif. Les écarts entre le code et la documentation existante du dépôt (README, anciens schémas), avec leur preuve ; les défauts graves vont aux points d'attention. -->

> [!NOTE] Écarts constatés
> - Écart et preuve (`chemin/fichier.ts:35-37`).

## Pour aller plus loin

<!-- consigne : le DAT, les points d'attention, la maintenance de la documentation. -->

- [Le dossier d'architecture technique](#/reprendre/dat) : l'implantation en production.
- [Les points d'attention](#/reprendre/points-attention) : ce qu'il faut corriger en priorité.
