## En bref

Lancez `doc-kit` **sans commande** : il regarde où vous en êtes, dit ce qui manque, et propose de lancer l'étape
suivante. Vous n'avez jamais à retenir l'ordre des commandes.

1. **Il trouve le projet** : le dossier donné par `--project`, sinon le `doc.config.mjs` le plus proche, dans le dossier
   courant ou l'un de ses parents.
2. **Il vérifie, dans l'ordre** : qu'un projet existe, que ses dépendances sont installées, que sa configuration est
   valide, qu'une session existe quand l'application demande une connexion, qu'au moins une capture a été prise.
3. **Il s'arrête au premier manque** et propose la commande qui le comble. Une fois tout en place, il propose un menu :
   `dev`, `audit`, `build`, `doctor`.
4. **Il demande avant de lancer quoi que ce soit.** Sans terminal (un tube, une tâche de CI), il affiche seulement la
   suggestion et se termine avec le code 0.

## Le schéma

::schema{id="guided" titre="Le mode guidé vérifie le projet de gauche à droite et s'arrête au premier manque : la commande sous chaque boîte est celle qu'il propose. Quand toutes les vérifications passent, il affiche le menu."}

## Les étapes qu'il détecte

| Situation | Ce qu'il affiche | Commande proposée |
|---|---|---|
| Aucun `doc.config.mjs` ici ni au-dessus | « Aucun projet de documentation (doc.config.mjs) pour ce dossier : » et le dossier en entier | `doc-kit init <dossier>` |
| Les dépendances du projet manquent | « … mais ses dépendances ne sont pas installées. » | `npm install` |
| La configuration est inutilisable | « … mais il n'est pas utilisable en l'état : » et les erreurs | `doc-kit doctor` |
| Pas de session, `auth.adapter` n'est pas `none`, et des captures sont prévues | « le projet est prêt, mais il n'y a pas encore de session… » | `doc-kit connect` |
| Pas encore de capture, et des captures sont prévues | « aucune capture pour l'instant. » | `doc-kit capture` |
| Tout est en place | « le projet est en place. » | Un menu : `dev`, `audit`, `build`, `doctor` |

Avec `capture.mode: "none"` (une documentation sans captures), `connect` et `capture` ne sont jamais proposés : le
mode guidé passe directement au menu, et dit pourquoi.

Quand vous acceptez `init`, le mode guidé enchaîne sur les questions d'`init` (nom, langue, adresse, mode de capture,
connexion) dans le même terminal. Pour toute autre étape, il passe la main à la commande : `connect` lit votre touche Entrée, `dev` tourne
jusqu'à [[touche Ctrl+C]].

## Dans un script

Le mode guidé ne lance jamais rien sans une personne devant le terminal. `--json` donne la situation sous forme de
données :

```bash
doc-kit --json
```

```json
{
  "step": "connect",
  "folder": "/home/robin/acme-orders/docs/manual",
  "next": ["doc-kit connect"]
}
```

`step` vaut `init`, `install`, `doctor`, `connect`, `capture` ou `menu`. Dans le cas `menu`, `next` liste les quatre
commandes du menu.

## Messages et langue

Les messages sont dans la langue du projet (`language` dans `doc.config.mjs`), ou dans la langue donnée par
`--lang en|fr`. Hors d'un projet, ils sont en anglais, sauf si la variable `DOC_KIT_LANG` vaut `fr`.

## Pièges et écarts constatés

> [!NOTE] Ce que le mode guidé ne vérifie pas
> Il ne vérifie ni que la session est toujours valide, ni que les captures sont à jour, ni que le build strict passe.
> `doc-kit doctor` vérifie l'âge de la session, `doc-kit audit` le reste.

## Pour aller plus loin

- [Les cinq premières minutes](#/start/first-five-minutes) : les mêmes étapes, une par une, sur l'application de démo.
- [La ligne de commande](#/reference/cli) : chaque commande et ses codes de sortie.
- [Commandes : démarrer et capturer](#/reference/cli/start-capture) : `init`, `doctor` et `connect` en détail.
