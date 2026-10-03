## En bref

<!-- consigne : la forme du code en un paragraphe : un dépôt ou plusieurs, un langage principal ou un mélange, un front et un back ou un seul processus. -->

Exemple : « Un seul dépôt : un front et un back, partageant une base de données. »

## Contexte

<!-- consigne : l'application parmi les systèmes avec lesquels elle parle (utilisateurs, autres systèmes, services externes). `::c4` les dessine à partir des faits (`doc-kit facts --source dependencies --source env --source db`), chacun avec sa preuve ; n'ajouter un `::schema` dessiné à la main que pour un système que les faits ne voient pas (un service interne appelé par URL, une file d'attente). -->

::c4{}

## Conteneurs

<!-- consigne : les unités déployables (front, back, base de données, file, tâches planifiées), chacune avec sa technologie et où vit son code. -->

| Conteneur | Technologie | Code |
|---|---|---|
| Front | — | `chemin/` |

## Composants

<!-- consigne : à l'intérieur du ou des conteneurs principaux, les modules qui comptent pour un nouvel arrivant : où vit la logique métier, où vit l'accès aux données. Le graphe des imports (`doc-kit facts --source modules`) liste d'abord les fichiers dont le plus d'autres dépendent, et les cycles d'imports à démêler. -->

::modules{}

| Composant | Rôle | Code |
|---|---|---|
| Composant d'exemple | Ce qu'il fait | `chemin/fichier.ts` |

## Intégrations

<!-- consigne : facultatif. Chaque système externe appelé depuis le code (paiement, e-mail, un autre service interne), avec le fichier qui l'appelle : partir des systèmes que `::c4` a trouvés, puis ajouter le point d'appel de chacun. -->

| Système | Appelé depuis | Preuve |
|---|---|---|
| Système d'exemple | `chemin/fichier.ts` | [[verifie chemin/fichier.ts:18]] |

## Code dupliqué ou mort

<!-- consigne : facultatif. Des modules quasi identiques écrits par des sessions IA successives au lieu d'être réutilisés, et du code que rien n'appelle. -->

- Deux modules dupliquent la même logique ([[verifie chemin/fichier.ts:1]]).
