---
agent: doc-kit-writer
---
# Brief — mise à jour des pages depuis leur contexte

Tu mets à jour des pages de documentation qui ont pris du retard sur l'application, dans la langue du projet.
Chaque lecture et chaque commande coûtent : respecte le budget d'étapes ci-dessous plutôt que d'explorer.

## Méthode, par page (au plus 1 lecture en plus du fichier de contexte)

1. Lis entièrement le FICHIER DE CONTEXTE de la page (produit par `doc-kit context <page> --update`, chemin dans
   Variables) : le résumé de la page, ses sections obligatoires, les fichiers et extraits qui comptent, les
   libellés exacts, les faits pertinents, les termes de glossaire, pourquoi la page a été signalée (le rapport
   de synchronisation), son diff, et les fiches avant/après de ses captures. C'est la seule lecture dont tu as
   besoin pour décider quoi changer.
2. Change SEULEMENT ce que le changement signalé exige : une preuve déplacée, un libellé renommé, un fait qui
   a changé, une permission retirée ou ajoutée, une nouvelle étape. Ne réécris pas les sections que le fichier
   de contexte ne désigne pas.
3. Revérifie chaque `fichier:ligne` que tu gardes ou ajoutes face au code actuel, à partir des extraits du
   fichier de contexte. Ce que tu ne peux pas vérifier ainsi : AU PLUS UNE lecture supplémentaire, le seul
   fichier que le fichier de contexte cite, pas plus.
4. Garde le style, le niveau et les titres déjà en place sur la page (les sections obligatoires du gabarit
   s'appliquent toujours) ; libellés exacts en gras, preuve `fichier:ligne` sur une ligne vue, déduit dit
   déduit, rien d'inventé.
5. Une fois une page terminée et ses contrôles passés (voir « Contrôles »), lance
   `doc-kit sync --mark <id de page> --sources …` (depuis le dossier de la documentation) pour l'enregistrer
   comme vérifiée face à l'application actuelle.

Un agent qui déborderait de ce budget s'arrête et le signale dans son rapport, plutôt que de continuer à
explorer.

## Règles

- N'écris QUE les pages qui t'ont été données. Ne touche ni le sommaire, ni le glossaire, ni la configuration,
  ni le kit, ni les pages qui ne t'ont pas été données. Aucune commande git.
- Rien d'inventé : chaque changement se justifie par le fichier de contexte ou par le seul fichier
  supplémentaire qu'il t'a envoyé lire ; ce qui est déduit est dit déduit.
- Une page qui dépasse le `maxWords` de son gabarit : propose son découpage en sous-pages dans ton rapport, ne
  la découpe pas toi-même.
- Un défaut de l'application découvert en mettant à jour : ne corrige pas les pages de points d'attention ;
  signale-le comme candidat.

## Contrôles (depuis le dossier de la documentation)

- `npx doc-kit build --draft` : aucun nouveau ✖ ni ⚠ pour tes pages.
- `npx doc-kit check tables` : aucun débordement.
- `npx doc-kit sync --check` : tes pages n'apparaissent plus hors de `unchanged`.

## Rapport final (300 mots au plus, dans la langue du projet)

- Pages mises à jour, ce qui a changé dans chacune (une ligne), et le `sync --mark` lancé pour chacune.
- Pages où le changement signalé n'a pas pu être entièrement résolu à partir du fichier de contexte, et
  pourquoi ; la lecture supplémentaire faite, s'il y en a eu une.
- Candidats constats, erreurs trouvées ailleurs, termes de glossaire proposés.

## Variables

- Produit : {{product}}
- Dossier de la doc : `{{docDir}}`
- Pages à mettre à jour : {{pages}}
- Fichiers de contexte : `{{docDir}}/.doc-kit/context/<id de page, "/" -> "__">.md`
- Rapport de synchronisation : `{{docDir}}/.doc-kit/sync-report.json`
- Sommaire : `{{tocFile}}`
- Fichier du glossaire : `{{glossaryFile}}`
- Page des points d'attention et sous-pages : `{{contentDir}}/{{findingsPage}}.md`
