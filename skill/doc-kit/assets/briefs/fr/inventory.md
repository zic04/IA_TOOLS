# Brief — inventaire du produit {{product}} (agent Explore, lecture seule)

Tu prépares la documentation du produit **{{product}}**{{#if description}} ({{description}}){{/if}}. Tu ne modifies AUCUN fichier :
tu lis le code et tu rends un inventaire complet dans ton rapport final, que l'orchestrateur enregistrera tel quel dans
`{{docDir}}/.doc-kit/inventory-{{slug}}.md`. Tous les rédacteurs s'en serviront : il doit être exact et sourcé.

- Code de l'application : `{{appDir}}`{{#if stack}} ({{stack}}){{/if}}, version {{version}}.
{{#if labels}}- Libellés exacts de l'interface : `{{labels}}`.
{{/if}}- Dossier de la doc : `{{docDir}}`. Ce que voient les adaptateurs de couverture du kit : `.doc-kit/inventory.json`
  (produit par `doc-kit inventory --json`), s'il existe.
{{#if reads}}- À lire aussi : {{reads}}
{{/if}}
## Ce que tu rends, dans cet ordre (Markdown)

**Légende des droits** : une abréviation courte par permission (par exemple R = `order:read`, W = `order:write`),
utilisée dans tout l'inventaire.

1. **Navigation réelle**
   - Sources : fichiers du menu, du menu d'administration, des gardes de routes, des libellés.
   - Menu latéral : pôles, items (libellé → route), droit requis, compteurs, modules qui masquent un item.
   - Menu d'administration, barre du haut (recherche, langue, thème, notifications, menu utilisateur), éléments
     flottants, bannières, modules activables.
2. **Toutes les routes, par pôle**
   - Pour chaque route : titre affiché exact, droits (voir, agir), ce que montre l'écran en une ligne.
   - Signale les pages **cachées** (accessibles seulement par un lien interne), **orphelines** (aucun lien), les
     redirections, les pages publiques ou techniques.
   - Donne le nombre total et compare-le à `inventory.json`.
3. **Éditeurs riches à documenter en détail** : pour chacun, composants, logique, services, modèles de données, et ce
   qui est calculé côté serveur ou côté navigateur.
4. **Rôles, périmètres et matrice**
   - Permissions et rôles définis dans le code ; tableau rôles × permissions.
   - Règles de périmètre : qui voit quelles données, et pourquoi.
   - Correspondance avec le fournisseur d'identité (groupes, rôles d'application, rôle par défaut).
   - Où est la vérité : le code, ou une base modifiable à l'écran (la production peut alors avoir sa propre matrice).
5. **Documentation existante : état** — pour chaque document du dépôt (README, `docs/`, guides) : date, ce qui reste
   juste, ce qui est **périmé**, avec la preuve dans le code (nombre de rôles, de permissions, routes, onglets,
   étapes…). Les rédacteurs sauront ainsi quoi ne PAS recopier.
6. **Pages qui écrivent au rendu** : toute page dont le rendu côté serveur (composant de page, loader, contrôleur,
   gestionnaire GET) appelle une fonction d'écriture (`create…`, `ensure…`, `upsert…`, `update…`, `insert…`, `save…`,
   `sync…`) : route, `fichier:ligne`, effet. Ce sont les candidates à `capture.forbidden`.
7. **Plan de site proposé**
   - Les quatre sections du standard (Utiliser, Configurer, Administrer, Reprendre), avec des groupes dans chacune.
   - Pour chaque page : `id` (chemin en minuscules, sans accents, par exemple `utiliser/commandes/liste`), titre,
     routes, droits, gabarit parmi `screen`, `editor`, `recipe`, `technical`, `technical-sub`, `journey`,
     `journey-step`, `troubleshooting`, `troubleshooting-area`, `findings`, `architecture`, `variables`, `resources`.
   - Chaque route apparaît dans au moins une page.
   - Dans Reprendre : architecture, arborescence du code, base de données, stockage, sécurité, intégrations,
     déploiement, exploitation, tests et qualité, points d'attention, maintenir la doc.
8. **Découpage en lots proposé** : 6 à 10 lots de 10 à 15 pages, chacun avec un code court (`u1`, `cf`, `a1`…), ses
   pages et les écrans qu'elles partagent ; isole les domaines lourds dans leur propre lot.

## Règles

- Lecture seule : aucune écriture, aucune commande git, aucun accès à une application déployée.
- Rien d'inventé : chaque affirmation repose sur un fichier que tu as lu ; cite les fichiers ; ce qui est déduit est
  dit déduit.
- Libellés copiés tels quels : casse, ponctuation, apostrophe droite ou typographique.
- Sois exhaustif sur les routes et les droits : une route oubliée ici sera une page manquante.
- Termine ton rapport par : « Je n'ai modifié aucun fichier. »
