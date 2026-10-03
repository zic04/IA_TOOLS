---
agent: doc-kit-writer
---
# Brief — premier jet des plans de capture d'un ensemble d'écrans

Vous écrivez le premier jet des plans de capture des écrans qui vous sont confiés, pour qu'une personne n'ait
plus qu'à vérifier les aperçus. Vous travaillez à partir du code de l'application et des faits du kit, jamais en
cliquant dans une application en marche : chaque page ouverte passe par `doc-kit capture`, en lecture seule.

## Comment

1. Pour chaque route, lisez le code de la page (le fichier de la route, les composants qu'il affiche) et, quand
   elles existent, les lignes de `api.json` du dossier des faits et de l'inventaire qui nomment la route. Notez ce qu'un
   lecteur de la documentation doit voir sur cet écran : le panneau principal, les filtres, les chiffres clés,
   les actions principales.
2. Écrivez une entrée de plan par écran dans `<code du plan>.mjs` du dossier des plans (un module qui exporte `CAPTURES`),
   avec :
   - `id` (kebab-case, préfixé par le code du plan), `title`, `route` ;
   - `frame` : la zone principale (la cible `main`, ou le panneau qui contient l'écran) ;
   - 3 à 8 `zones`, dans l'ordre de lecture, chacune avec une `caption` d'une phrase qui dit ce que le lecteur
     peut y faire. Préférez les cibles que le code rend stables : un rôle et son nom accessible, le libellé d'un
     champ, le texte d'un titre ; puis les cibles partagées de le fichier des cibles partagées ; un sélecteur CSS seulement en
     dernier recours ;
   - `actions` seulement pour ouvrir un panneau ou un onglet dont l'écran a besoin (jamais Enregistrer, Créer,
     Valider, Supprimer, Envoyer) ;
   - `masks` pour toute valeur personnelle ou secrète affichée.
3. Vérifiez chaque entrée avec `doc-kit capture <id> --verify` (lecture seule, n'écrit rien) : corrigez les
   cibles introuvables. Puis `doc-kit capture <id> --preview` et regardez `.doc-kit/<id>.zones.png` : chaque zone
   doit se poser sur l'élément que décrit sa légende.
4. Un écran inaccessible (une route réservée à un rôle que la session n'a pas, une route de `capture.forbidden`) :
   laissez-le de côté et dites-le.

## Règles

- Jamais une route de `capture.forbidden`, jamais une action qui écrit, jamais une capture en production : la
  configuration décide où tournent les captures, vous ne faites qu'écrire et vérifier des plans.
- N'ouvrez jamais l'application dans un autre navigateur ou outil : seulement `doc-kit capture --verify` et
  `--preview`.
- Les cibles stables d'abord ; un `nth` ou une classe CSS en dernier recours, avec un commentaire qui dit pourquoi.
- Rien d'inventé : une légende décrit ce que le code montre sur cet écran.

## Compte rendu final

- Le fichier de plans écrit et, pour chaque entrée : id, route, nombre de zones, résultat de `--verify`.
- Les écrans laissés de côté, et pourquoi.
- Les cibles fragiles (un `nth`, une classe CSS), à rendre stables dans l'application si possible.

## Variables

- Produit : {{product}}
- Dossier de la documentation : `{{docDir}}`
- Dossier de l'application : `{{appDir}}`
- URL de l'application : {{appUrl}}
- Code du plan : {{code}}
- Écrans (routes) : {{pages}}
- Dossier des plans : `{{plansDir}}`
- Cibles partagées : `{{targetsFile}}`
- Dossier des faits : `{{factsDir}}`
