# Règles de rédaction

Ces règles viennent des guides de rédaction de vrais sites de documentation, et des consignes données aux rédacteurs, personnes ou agents, qui les ont écrits. Le guide de rédaction d'un projet (`WRITING-GUIDE.md`) les reprend et y ajoute ce qui est propre au projet : ses fichiers de traduction, ses préfixes de captures, sa décision sur les données montrées dans les captures.

## 1. Rien d'inventé

Chaque libellé, valeur par défaut, borne, comportement et droit est **vérifié dans le code**. En cas de doute, lisez le code ; ne supposez jamais.

| Vous affirmez… | Vous le vérifiez dans… | Acme Orders (Next.js) | Application monopage + API séparée |
|---|---|---|---|
| Un libellé d'écran | Le fichier de traduction de l'application | `messages/fr.json` | `frontend/src/i18n/locales/fr.json` |
| Une valeur par défaut | Les composants et les types | `components/`, `app/` | `frontend/src/lib/types.ts` |
| Une borne serveur | Les schémas de validation et le modèle de données | `lib/validation/`, `db/schema.ts` | `backend/app/schemas/` |
| Un comportement | Les gestionnaires de routes, les actions serveur et les services | `app/api/`, `lib/services/` | `backend/app/` |
| Un fait de production | Un écran consulté en lecture seule, ou le portail du fournisseur cloud, **daté** | « 38 comptes le 1er octobre 2026 » | « export du 30 septembre 2026 » |

La documentation existante du dépôt est souvent **périmée**. Servez-vous-en pour trouver où chercher, jamais comme preuve. Une reprise se termine en général par une liste de documents « à ne plus suivre » (voir le gabarit `findings`).

## 2. La preuve `fichier:ligne`

Toute affirmation non évidente sur le code porte sa preuve, entre accents graves.

| Forme | Exemple |
|---|---|
| Fichier et ligne | `reminderJob.ts:38-44` |
| Plusieurs lignes | `ApprovalChainEditor.tsx:69,127` |
| Chemin complet à la première citation, nom court ensuite | `lib/services/orderService.ts:43-50`, puis `orderService.ts:161` |
| Même fichier que la citation précédente | `(:473)`, seulement à l'intérieur d'une même étape ou d'un même paragraphe |
| Nom de fonction, quand la ligne bouge souvent | `getScopedCustomers`, `lib/services/customerService.ts:9` |

- La page ou le chapitre dit **à quelle version** correspondent les numéros de ligne : « d'après le code de la version 2.4.0 ». Les numéros de ligne dérivent ; le nom de fonction reste un repère.
- Les pages de Reprendre citent leurs preuves systématiquement. Les pages d'écran les réservent aux écarts constatés.

## 3. Ce qui est déduit, ce qui est à confirmer

Ce qui n'a pas été observé directement est **signalé comme déduit** : « ce qui laisse prévoir un refus (déduit) », « déduit de `approvalService.ts:122-126` ». Ce qu'on ne sait pas est **à confirmer**, avec la personne à qui poser la question.

Le dossier d'architecture technique (DAT) ouvre sur une légende qui sert de modèle :
- « **D'après le portail** » : observé, daté ;
- « **Infrastructure as code** » : prévu ; la production a pu diverger ;
- « **Déduit** » : une conclusion tirée de ces sources, non observée directement ;
- « **À confirmer** » : inconnu ; demandez à l'équipe d'infrastructure.

## 4. Les libellés exacts, en gras

- Chaque libellé d'écran est écrit **en gras**, avec la casse, la ponctuation et les caractères du fichier de traduction : **Circuit de validation**, **Tester la règle**.
- Un libellé à variable garde sa variable : « {n} circuit(s) de validation ».
- Un message affiché est cité à l'identique, entre guillemets : « Ressource introuvable ». (En anglais, entre guillemets droits : "Resource not found".)
- Un code technique (permission, statut, variable, action d'audit) est entre accents graves : `order:write`, `PENDING_APPROVAL`, `user.deactivate`. Pour un statut, donnez le code **et** le libellé : `DRAFT` (**Brouillon**).

## 5. Les écarts constatés

Quand l'écran, le code et la documentation existante divergent, **décrivez** l'écart dans un encadré, à la fin de la section « Pièges et limites à connaître » :

```markdown
> [!NOTE] Écarts constatés (v2.4.0)
> - La pastille **En attente de signature** filtre en réalité le statut **En attente de validation** (`app/(app)/orders/page.tsx`, constante `CHIPS`).
```

- Ne corrigez **jamais** l'application depuis le dossier de documentation.
- Un écart qui a un impact réel devient un **constat numéroté** (voir §9). Les pages le citent ensuite par son numéro.
- En anglais, l'encadré s'intitule `> [!NOTE] Observed gaps (vX.Y.Z)`.
- Ordre de grandeur : les sites matures portent un encadré de ce type toutes les une à deux pages.

## 6. Ton et style

- **Français** : registre professionnel, vouvoiement, impératif pour les actions : « Choisissez… », « Cliquez… ». (En anglais : registre professionnel, impératif : "Choose…", "Click…".)
- Phrases courtes ; une idée par phrase. Des tableaux plutôt que des paragraphes pour les références.
- Expliquez **le fonctionnement**, pas seulement l'écran : qui calcule quoi (serveur ou navigateur), dans quel ordre, avec quelles limites, et ce que l'utilisateur voit changer.
- Pas de titre `#` : le titre de la page vient du sommaire. N'utilisez que des titres `##` et `###` ; ils alimentent « Sur cette page » et la recherche.
- Des chiffres réels plutôt que des qualificatifs : « 15 commandes par page », « 60 interrogations espacées de 2 secondes ».

## 7. La syntaxe étendue

Le build accepte les deux graphies. Utilisez celle de la langue du projet.

| Élément | Français | Anglais | Usage |
|---|---|---|---|
| Encadré de mécanisme | `> [!MECANISME] Titre` | `> [!HOW] Title` | Le mécanisme réel, souvent en étapes numérotées : « Quel circuit reçoit une nouvelle commande » |
| Encadré de piège | `> [!ATTENTION] Titre` | `> [!WARNING] Title` | Un piège ; le titre est le piège en une ligne : « Un seul circuit actif par type de commande » |
| Encadré de note | `> [!NOTE] Titre` | `> [!NOTE] Title` | Où se trouve l'écran ; écarts constatés ; sources : « Où se trouve ce réglage » |
| Encadré d'astuce | `> [!ASTUCE] Titre` | `> [!TIP] Title` | Un raccourci utile, jamais indispensable : « Les filtres invisibles » |
| Encadré d'erreur | `> [!ERREUR] Titre` | `> [!CAUTION] Title` | Une erreur et sa cause |
| Encadré de droits | `> [!DROITS] Titre` | `> [!PERMISSIONS] Title` | Toujours la dernière section d'une page d'écran : voir, enregistrer, actions spéciales |
| Encadré de recette | `> [!RECETTE] Titre` | `> [!RECIPE] Title` | Ce qu'il faut avant une recette : « Ce qu'il vous faut » |
| Code de permission | `[[droit code]]` | `[[perm code]]` | `[[droit order:approve]]` |
| Chemin de menu | `[[menu A › B]]` | `[[menu A › B]]` | `[[menu Administration › Circuits de validation]]`, séparateur `›` |
| Touche ou raccourci | `[[touche …]]` | `[[key …]]` | `[[touche Ctrl+K]]` |
| Pastille de statut | `[[statut …]]` | `[[status …]]` | `[[statut 2]]`, colorée quand `statuses` est défini dans la configuration |
| Route de l'application | `[[route …]]` | `[[route …]]` | `[[route /orders/[id]]]` |
| Écran annoté | `:::ecran{capture="id" titre="…"}` | `:::screen{capture="id" title="…"}` | Une capture avec des zones, suivie de sa légende numérotée |
| Étapes | `:::etapes` | `:::steps` | Une suite numérotée d'actions |
| Capture simple | `::capture{id="…" titre="…"}` | `::capture{id="…" title="…"}` | Une capture sans zones |
| Schéma | `::schema{id="…" titre="…"}` | `::diagram{id="…" title="…"}` | Un SVG de `diagrams/` |
| Avant / après | `::avant-apres{avant apres libelle-avant libelle-apres titre}` | `::before-after{before after before-label after-label title}` | Deux captures avec un curseur |

Tableaux types :
- référence des réglages : `| Réglage | Contrôle | Valeurs · défaut | Effet |` ;
- écritures : `| Où | Quoi | Quand |` ;
- erreurs : `| Message | Origine | Reprise |` ;
- constats : `| N° | Point | Où | Constat et impact | Recommandation |`.

Un tableau ne doit pas défiler horizontalement à 1 440 px : au-delà de cinq colonnes, découpez-le ou raccourcissez les cellules.

## 8. Liens et ancres

- Lien vers une page : `[texte](#/configurer/validation/circuits)`, seulement vers un id du sommaire.
- Lien vers une section : `[texte](#/id-de-page~ancre)`. L'ancre est le titre en minuscules, sans accents, avec des tirets à la place des espaces et de la ponctuation, 60 caractères au plus : « C1 — La relance des factures ne tourne pas en production » donne `c1-la-relance-des-factures-ne-tourne-pas-en-production`.
- Le build vérifie chaque page et chaque ancre. Une ancre vers une page que quelqu'un d'autre écrit en même temps est risquée : liez la page, sans ancre.
- **Pas de renvoi relatif entre pages** : « ci-dessous », « plus haut », « voir plus loin » ne valent qu'à l'intérieur d'une page. Après un découpage en sous-pages, remplacez-les par des liens.
- Un lien dit où il mène : « [Rôles et permissions](#/administrer/acces/roles) », jamais « ici ».

## 9. La numérotation des constats

Chaque constat a une lettre pour sa famille et un numéro. Les lettres dépendent de la langue du site.

| Français | Anglais | Famille | Ce que c'est | Gravité |
|---|---|---|---|---|
| **C** | **C** | Critique (Critical) | Un risque actuel pour la sécurité des données, la confidentialité ou la promesse première du produit ; à traiter avant toute autre évolution | Critique |
| **I** | **I** | Important | Un défaut réel, un contournement possible, une fonction cassée ou trompeuse ; à planifier rapidement | Important |
| **M** | **M** | Mineur (Minor) | Dette, incohérence, affichage ou hygiène ; à traiter au fil de l'eau | Mineur |
| **P** | **P** | Production | La configuration réelle de la production diffère de ce que prévoit le code (rôles, réglages, variables) | Dans une colonne |
| **R** | **N** | Sans effet (No effect) | Un réglage qui s'enregistre, ou un écran qui s'affiche, sans produire l'effet annoncé | Dans une colonne |

- En français, la famille sans effet prend la lettre **R** (« réglage sans effet ») ; un site en anglais utilise **N** ("no effect"). Les quatre autres lettres sont identiques dans les deux langues. `doc-kit audit` reconnaît les deux jeux.
- Un numéro **ne change jamais** : il est cité dans les parcours, dans les pages de diagnostic et dans les encadrés d'écarts. Un nouveau constat prend le numéro libre suivant de sa famille (par exemple I34, I35, puis I40 à I43, ajoutés aux constats de sécurité après I16).
- Chaque constat a sa preuve `fichier:ligne`, son impact et sa recommandation.
- Les rédacteurs proposent des **candidats** (constat, preuve, gravité proposée). Une seule personne les consolide, les déduplique et les numérote.
- Citez un constat par son numéro, avec un lien vers sa sous-page : `[C1](#/reprendre/points-attention/critiques)`.

## 10. Le glossaire

- `content/glossary.json` : `[{ "term": "Périmètre", "pattern": "périmètres?", "def": "…" }]`.
- `def` : une phrase, compréhensible sans le reste du site.
- `pattern` : une expression régulière facultative pour les pluriels et les variantes.
- Un terme entre au glossaire quand il a un sens propre au produit (Acme Orders : « Circuit de validation », « Périmètre ») ou quand il est ambigu (« Délégué » : une personne qui valide pour le compte de quelqu'un d'autre, pas un rôle).
- Le glossaire est géré de façon centrale : les rédacteurs proposent des termes avec leur définition.

## 11. Les schémas

- Fichiers `diagrams/<nom>.svg`, insérés par `::schema{id="nom" titre="…"}`. Le titre est une légende complète qui dit comment lire le schéma.
- Un `viewBox` de 900 unités de large ; du texte de 11 à 14 px ; **aucune couleur en dur**, seulement les classes de la feuille de style du site, pour que le schéma suive les thèmes clair et sombre :

  | Rôle | Classes |
  |---|---|
  | Boîtes | `d-box`, `d-box-2`, `d-brand`, `d-warn`, `d-danger`, `d-info`, `d-violet` |
  | Aplats | `d-solid` (couleur de marque), `d-chrome` (couleur sombre du cadre) |
  | Traits | `d-line`, `d-line-brand`, `d-dashed` |
  | Textes | `d-title`, `d-text`, `d-small`, `d-white` (sur `d-solid` uniquement), `d-on-chrome` (sur `d-chrome` uniquement) |
  | Pointes de flèche | `d-arrow`, `d-arrow-brand` |

- Le texte posé sur une boîte pleine prend la classe prévue pour ce fond : `d-white` sur `d-solid`, `d-on-chrome` sur `d-chrome`. Toute autre combinaison peut devenir invisible en thème sombre. Vérifiez chaque schéma dans les deux thèmes.

- Les schémas écrits avant doc-kit utilisent les anciens noms français (`s-boite`, `s-trait`, `s-titre`, `s-fleche`…) : ils restent stylés, mais les nouveaux schémas utilisent les classes `d-*`.
- Préfixez les identifiants des éléments `<marker>` par le code du schéma (`pc-fleche`, `cv-fleche`) : plusieurs schémas peuvent cohabiter dans une page.
- Montrez visuellement ce qui est automatique, ce qui attend une personne et ce qui dépend d'un planificateur.
- Vérifiez en thème clair **et** en thème sombre que rien ne déborde : `doc-kit view <page~le-schema> --theme dark`.

## 12. Travailler à plusieurs

- Chaque rédacteur n'écrit que ses propres pages, ses plans de capture et ses schémas préfixés. Il ne modifie ni le sommaire, ni le glossaire, ni le moteur, ni les pages des autres, ni l'application.
- Il signale ce qu'il trouve faux ailleurs (fichier, phrase, preuve) au lieu de le corriger.
- Son rapport donne : les pages écrites, les captures et les zones, les écarts et les constats candidats avec leur preuve, les termes de glossaire proposés, et ce qui n'a pas pu être fait.

## 13. Écrire dans l'espace Métier

L'espace Métier (`feature`, `business-rules`, `roles-matrix`, `process`, `release-notes` ; ARCHITECTURE.md
§6.8) est lu par des personnes qui n'ouvrent jamais le code. Quatre règles le gardent ainsi.

**Les identifiants.** `F-01`, `F-02`… numérotent les fiches de fonctionnalité ; `BR-01`, `BR-02`… (en anglais)
ou `RG-01`, `RG-02`… (en français) numérotent les règles métier. Les deux suivent la même forme,
`^[A-Z][A-Z0-9]{0,5}-\d{1,4}$`, et la même règle que les constats (§9 ci-dessus) : **un numéro ne change
jamais** une fois qu'une fiche ou une règle est citée ailleurs. Attribuez le prochain numéro libre de son
genre ; ne renumérotez jamais pour combler un trou. Une fiche de fonctionnalité déclare son id dans
`toc.json` (`"feature": "F-01"`), jamais dans le Markdown ; une règle déclare son id sur son conteneur
`:::regle` (`:::regle{id="RG-12" …}`, `:::rule{id="BR-12" …}`).

**L'encart d'accès.** Une fiche de fonctionnalité ouvre sur un tableau « Accès » avant toute explication :
module, qui peut l'utiliser (`[[droit …]]`), prérequis, la version et la date de dernière vérification de
cette page. Une page `screen` ou `editor` met ses permissions **en dernier** (`[!DROITS]`), parce que son
lecteur veut d'abord comprendre l'écran et vérifie qui peut l'utiliser après coup ; le lecteur d'une fiche de
fonctionnalité veut souvent l'inverse — « est-ce que je peux même faire ça ? » — avant de lire comment ça
marche. Placez l'information d'accès là où le lecteur de la page la cherche en premier.

**Une règle, un énoncé, un exemple.** Une règle métier (`:::regle` / `:::rule`) tient en une ou deux phrases,
suivies d'exactement un exemple travaillé sous la forme **Étant donné** une condition de départ, **quand**
l'action déclenchante se produit, **alors** le résultat qui suit :

```markdown
:::regle{id="RG-12" titre="Une commande au-dessus du seuil attend un responsable"}
Une commande dont le total est égal ou supérieur au seuil configuré n'est pas validée automatiquement.

**Exemple.** **Étant donné** une commande de 12 000 € et un seuil de 10 000 €, **quand** l'acheteur la
soumet, **alors** elle attend la validation d'un responsable.
:::
```

Gardez l'exemple à un seul scénario avec des chiffres réels et précis — jamais « une grosse commande » quand
« une commande de 12 000 € » tient en une ligne de plus et lève tout doute. Une règle qui a besoin de deux
exemples pour être comprise est en général deux règles.

**Pas de code dans l'espace Métier.** Une page dont l'espace effectif est `business` ne cite aucune preuve
`fichier:ligne` : le build avertit (`business.technical`) quand l'une s'y glisse. Énoncez la règle en termes
métier et renvoyez vers son `counterpart` pour le détail d'implémentation (« comment le seuil est réellement
appliqué : voir `reprendre/surface-api` »). C'est le même partage que « une page, un lecteur » dans
[structure.fr.md](structure.fr.md#une-page-un-lecteur-diátaxis) : un lecteur métier ne devrait jamais avoir à
sauter une preuve `fichier:ligne` pour trouver la phrase qui répond à sa question.

## 14. Statut des affirmations : vérifiée, déduite, inconnue

La section 3 ci-dessus donne la règle pour la prose libre (« (déduit) », « à confirmer »). L'espace Reprise a
aussi une puce compacte pour les trois mêmes statuts, posée sur une valeur plutôt que sur tout un paragraphe —
typiquement dans un tableau construit depuis `::faits{…}` puis complété à la main (ARCHITECTURE.md §6.9) :

| Puce (en · fr) | Signifie | Exemple |
|---|---|---|
| `[[verified …]]` · `[[verifie …]]` | Lu directement dans le code ou constaté en production, daté ; le texte après la puce est sa preuve | `[[verifie lib/orders.ts:42]]` |
| `[[deduced …]]` · `[[deduit …]]` | Une conclusion tirée de ce qui a été lu, pas observée directement | `[[deduit les transitions de statut de commande supposent un seul validateur]]` |
| `[[unknown]]` · `[[inconnu]]` | Personne n'a vérifié ; nommez ailleurs sur la page qui pourrait répondre | `[[inconnu]]` — demander à l'équipe paiements |

Utilisez la forme libre (« constaté », « déduit », « à confirmer ») pour une phrase ou toute une légende (le
dossier d'architecture technique, §3 ci-dessus) ; utilisez la puce pour une cellule de tableau ou une
affirmation au milieu d'une phrase, là où une phrase complète ne tiendrait pas. Ne marquez jamais quelque
chose `[[verifie]]` sur la seule foi de la documentation existante du dépôt (§1) : vérifiez-le dans le code,
ou marquez-le `[[deduit]]`.

## 15. Le registre des risques

Une page `findings` (§9 ci-dessus numérote les constats eux-mêmes) est aussi le registre des risques du
projet (ARCHITECTURE.md §6.9) : chaque constat porte, au-delà de son numéro, sa gravité et sa preuve, qui
décide de son sort et où cela en est. Quatre faits de plus, un par constat :

| Fait | Valeurs |
|---|---|
| Propriétaire | Qui décide — un nom ou un rôle, jamais « l'équipe » |
| Décision | Corriger, accepter, transférer (à un contrat, un assureur, une autre équipe) ou éviter (retirer la fonctionnalité qui cause le risque) |
| Statut | Ouvert, en cours, fait, accepté |
| Échéance | Quand c'est dû, ou « aucune » quand la décision est de l'accepter indéfiniment |

Sur la section d'un constat critique, ajoutez une ligne après Constat / Impact / Recommandation :
« Propriétaire · Décision · Statut · Échéance ». Sur un tableau de constats, regroupez les quatre en une seule
colonne **Suivi** : quatre colonnes séparées dépassent souvent la largeur de lecture une fois Où et
Recommandation déjà présentes, et les séparer ne compte vraiment que si un projet suit aussi la remédiation
ailleurs que sur cette page. Un constat dont le Suivi est encore vide n'est pas encore trié — cela appartient
à « L'essentiel en une minute ».
