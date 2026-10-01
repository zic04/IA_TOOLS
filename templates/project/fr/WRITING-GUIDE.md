# Guide de rédaction — documentation {{name}}

Ce guide fixe les règles **propres à ce projet**. Les règles communes à tous les sites doc-kit sont dans le standard du kit, `node_modules/doc-kit/standard/` :

| Sujet | Fichier du standard |
|---|---|
| Structure du site, pages obligatoires de « Reprendre » | `structure.fr.md` |
| Les 13 gabarits de page et leurs sections | `templates.fr.md` |
| Rien d'inventé, preuves `fichier:ligne`, libellés exacts, écarts, liens, glossaire, constats, schémas | `writing.fr.md` |
| Sécurité et qualité des captures | `captures.fr.md` |
| Contrôles bloquants et avertissements | `quality.fr.md` |
| Niveaux de maturité | `maturity.fr.md` |
| Checklist de remise | `delivery.fr.md` |

En cas de désaccord, ce guide l'emporte pour ce projet. Complétez chaque ligne marquée « à compléter ».

## 1. Principes non négociables

1. **Français**, registre professionnel, vouvoiement et impératif (« Choisissez… », « Cliquez… »).
2. **Rien d'inventé** : chaque libellé, défaut, borne et comportement est vérifié dans le code (§2).
3. **Libellés d'écran exacts, en gras**, avec la casse et les caractères du fichier de traduction.
4. **Expliquer le fonctionnement**, pas seulement l'écran : qui calcule quoi, dans quel ordre, avec quelles limites.
5. **Écarts constatés** décrits dans un encadré `> [!NOTE] Écarts constatés (vX.Y.Z)`, jamais corrigés dans l'application depuis ce dossier.
6. **Droits** : chaque page d'écran se termine par un encadré `> [!DROITS]`.
7. **Données des captures** : voir §3.

## 2. Sources de vérité

| On affirme… | On le vérifie dans… |
|---|---|
| Un libellé d'écran | à compléter (ex. `{{appDir}}/messages/fr.json`) |
| Une valeur par défaut | à compléter (composants, types) |
| Une borne serveur | à compléter (schémas de validation, modèle de données) |
| Un comportement | à compléter (routes, actions serveur, services) |
| Un droit | à compléter (catalogue des permissions et des rôles) |

La documentation existante du dépôt sert à trouver où chercher, jamais de preuve.

## 3. Captures

- **Données** : à compléter. Soit « production en lecture seule, données réelles en clair par décision écrite de <propriétaire> du <date> », soit « démo préparée par `captures/setup-demo.mjs`, noms fictifs ».
- **Identifiants** : kebab-case, préfixés par le lot : `util-…` (Utiliser), `cf-…` (Configurer), `admin-…` (Administrer), `r-…` (Reprendre) ; `prod-` en tête pour une capture de production.
- **Routes à ne jamais ouvrir** (écriture côté serveur au rendu) : à compléter, et à déclarer dans `capture.forbidden` de `doc.config.mjs`.
- **Interdit pendant une capture** : tout bouton qui écrit et toute saisie qui enregistre. Seule la navigation est permise.
- **Session** : supprimée à la fin de chaque campagne (`doc-kit connect --forget`).

## 4. Schémas

- `diagrams/<nom>.svg`, un `viewBox` de 900 de large, insérés par `::schema{id="nom" titre="…"}`.
- Seulement les classes du site (`d-box`, `d-line`, `d-dashed`, `d-text`, `d-arrow`…), jamais une couleur en dur.
- Identifiants des `<marker>` préfixés par le code du schéma.

## 5. Page de référence

La page à imiter dans ce projet : à compléter (la première page d'éditeur terminée). En attendant, les exemples du standard du kit (`templates.fr.md`).

## 6. Contrôles avant de livrer

```
doc-kit build --draft     # pendant la rédaction : aucune ligne ✖ ou ⚠ sur vos pages
doc-kit build             # strict : doit passer quand toutes les pages existent
doc-kit check all         # liens, tableaux, images, secrets, couverture
doc-kit audit             # niveau de maturité, pages trop longues, consignes restées
doc-kit view <id-de-page> --theme dark
```

## 7. Fichiers gérés de façon centrale

`doc.config.mjs`, `content/toc.json`, `content/glossary.json`, `content/home.md` et `captures/targets.mjs` sont gérés de façon centrale : proposez vos modifications (nouvelle page, résumé, terme, aide de capture) au lieu de les éditer en parallèle.
