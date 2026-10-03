---
agent: doc-kit-writer
---
# Brief — traduire des pages en {{lang}}

Vous écrivez la traduction en {{lang}} des pages ci-dessous, à partir du dossier du traducteur que le kit a
préparé pour chacune. Chaque lecture et chaque commande a un coût : respectez le budget de pas plutôt que
d'explorer.

## Méthode, par page (le dossier, plus au plus 1 lecture supplémentaire)

1. Lisez en entier le DOSSIER DU TRADUCTEUR de la page (écrit par `doc-kit context <page> --translate {{lang}}`,
   chemin dans Variables) : l'id et l'état de la page, les titres à écrire (déjà en {{lang}}, tirés du gabarit
   de la page), le tableau du glossaire (terme source → terme en {{lang}}), le Markdown source en entier, la
   traduction précédente quand elle existe, et le diff de la source depuis sa dernière marque.
2. Écrivez le fichier à son chemin cible (Variables : « Dossiers des traducteurs » donne le chemin du dossier ;
   la traduction elle-même va dans `{{translationsDir}}/{{lang}}/<le chemin relatif du fichier source>`), une
   seule fois. Une page déjà à jour (état du dossier) n'a besoin d'aucun changement ; une page en retard (stale)
   se corrige à partir du diff, sans retraduire tout le texte sauf si le diff touche la majeure partie.
3. Gardez EXACTEMENT la structure de la source : mêmes titres (désormais en {{lang}}, tirés des libellés de
   section du dossier), mêmes paragraphes, mêmes listes, mêmes directives (`:::screen`, `::diagram`, `:::steps`…)
   à la même place, avec les mêmes attributs. Seuls le texte et les titres sont traduits.
4. Ce que vous ne pouvez pas traduire avec certitude à partir du seul dossier : AU PLUS UNE lecture
   supplémentaire, le fichier source lui-même dans sa version actuelle complète (pas via le dossier) — jamais le
   code de l'application, jamais `app.dir`.

## Ne jamais traduire

- Les ids : ids de page, ids de capture (`capture="…"`, `id="…"` de `::diagram`/`::capture`), ids de règle et de
  fonctionnalité (`BR-…`, `F-…`), ids de schéma, noms de gabarit.
- Les directives et leur syntaxe : `:::screen`, `::diagram`, `:::rule`, `[[menu …]]`, `[[perm …]]`,
  `[[status …]]`, `[[feature …]]`, `[[rule …]]`, les marqueurs de rappel (`[!NOTE]`…) — traduisez le texte du
  rappel, jamais son marqueur.
- Les blocs et extraits de code, et toute preuve `fichier:ligne` qu'ils contiennent.
- Les liens : gardez `#/<page>~<ancre>` exactement comme écrit ; une ancre fausse se corrige ensuite avec
  `translate --fix-anchors`, pas en devinant vous-même un slug traduit.

## Règles

- N'écrivez QUE `{{translationsDir}}/{{lang}}/…`. Ne touchez jamais `{{contentDir}}/` (la source), la table des
  matières, le glossaire, la configuration ni le kit. Aucune commande git.
- Une page, un fichier, écrit une seule fois — aucun brouillon intermédiaire laissé derrière vous.
- Rien n'est inventé : un terme absent du tableau du glossaire est traduit sobrement, de façon cohérente entre
  les pages de ce lot ; n'inventez pas d'entrée de glossaire.
- Un titre que la section du gabarit du dossier ne couvre pas (une page avec des titres qui lui sont propres) :
  traduisez-le sobrement, à sa place.

## Vérifications (depuis le dossier de documentation), une fois chaque page du lot écrite

- `npx doc-kit translate --fix-anchors <id de page…> --lang {{lang}}` : réécrit un lien dont l'ancre est encore
  celle de la source ; signale ceux qu'il ne peut pas reporter (en général une page pas encore traduite dans ce
  lot).
- `npx doc-kit translate --mark <id de page…> --lang {{lang}}` : enregistre l'empreinte traduite, seulement une fois
  que la page se lit correctement.
- `npx doc-kit build --draft` : aucun nouveau ✖ ni ⚠ pour {{lang}} sur vos pages.

## Rapport final (300 mots au plus, dans la langue du projet)

- Pages traduites, leur état avant (stale/unmarked/missing) et la lecture supplémentaire utilisée, le cas échéant.
- Liens que `--fix-anchors` n'a pas pu reporter, et pourquoi (raison habituelle : la page cible est traduite
  plus tard dans ce lot — relancez-le ensuite).
- Termes traduits sans correspondance dans le glossaire, pour une future entrée de glossaire.

## Variables

- Produit : {{product}}
- Dossier de documentation : `{{docDir}}`
- Langue cible : {{lang}}
- Pages à traduire : {{pages}}
- Dossiers des traducteurs : `{{contextFiles}}` (un par page, `{{docDir}}/.doc-kit/context/<id de page, "/" -> "__">.{{lang}}.md`)
- Dossier des traductions : `{{translationsDir}}/{{lang}}/`
- Table des matières : `{{tocFile}}`
- Fichier de glossaire : `{{glossaryFile}}`
