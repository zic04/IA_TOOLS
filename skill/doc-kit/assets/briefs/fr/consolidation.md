# Consolidation — {{topic}} ({{product}})

Fichier de synthèse des rapports, créé le {{date}} par `consolidation.mjs init`. Une section par rédacteur : on y colle,
depuis son rapport final, les candidats constats, les erreurs signalées et les termes de glossaire proposés.
Ensuite : `node consolidation.mjs duplicates --project <dossier-doc> --file <ce fichier>` (dans le dossier `scripts/`
du skill), décisions dans « Doublons repérés », puis les agents `findings-verification` et `page-corrections`, en
parallèle.

Conventions (l'outil `duplicates` les lit) :
- un candidat par élément numéroté : « 1. Gravité — constat : `chemin/fichier.ext:ligne`, `:autre-ligne` (même
  fichier) ; lien éventuel (« complète I14 », « lié à C1 », « déduit ») » ;
- les preuves entre accents graves, au format `fichier.ext:ligne` ou `fichier.ext:début-fin` ;
- une erreur de page : « `chemin/de/la/page.md` : « phrase fautive » → correction ; preuve » ;
- un terme : « Terme : définition d'une phrase. »

<!-- section:start -->
## {{sectionTitle}} ({{code}})

### Candidats constats
1. 

### Erreurs dans les pages existantes
- 

### Glossaire proposé
- 

<!-- section:end -->
## Doublons repérés entre rédacteurs

<!-- Après `consolidation.mjs duplicates` : « inv 8 = tbl 1 (à fusionner) », « acc 4 ≈ tbl 4 (voisins) », « gravité à trancher ». -->
- 
