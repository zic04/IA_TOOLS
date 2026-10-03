## À quoi ça sert

<!-- consigne : en 2 à 4 phrases, ce que l'utilisateur trouve en arrivant dans l'application {{name}} et comment il s'y repère. Exemple : « Après la connexion, l'application {{name}} s'ouvre sur le tableau de bord : le menu latéral mène à chaque pôle, la barre du haut à la recherche et au compte. » -->

> [!NOTE] Où se trouve cet écran
> L'écran d'accueil, juste après la connexion ([[route /]]).

## Comment ça marche

<!-- consigne : ce qui se passe à la connexion (authentification unique ou mot de passe, compte créé à la première connexion, rôle attribué), et ce qui décide de ce que l'utilisateur voit (rôle, permissions, périmètre), avec la preuve dans le code. -->

> [!MECANISME] Ce qui se passe à la première connexion
> 1. Première étape réelle, dans l'ordre du code.
> 2. Deuxième étape.
> 3. Troisième étape.

## L'écran

<!-- doc-kit:capture=app -->
<!-- consigne : la capture « home » est déclarée dans captures/plans/example.mjs avec 3 zones (barre du haut, menu, contenu) : la légende a 3 éléments. Modifiez les zones et la légende ensemble, puis capturez avec l'option d'aperçu (voir « Maintenir cette documentation »). -->

:::ecran{capture="home" titre="{{name}} › écran d'accueil"}
1. **Barre du haut**. Recherche, langue, thème et menu du compte : rôle, valeurs, effet.
2. **Menu**. Les pôles de l'application, selon les droits de l'utilisateur.
3. **Contenu de l'écran**. Ce que l'utilisateur voit en premier, et d'où viennent les chiffres.
:::
<!-- doc-kit:capture=none -->
<!-- consigne : pas de capture dans ce projet (capture.mode "none") : un tableau par panneau ou par fenêtre (sous-titres ### s'il y en a plusieurs), une ligne par élément dans l'ordre de lecture, de haut en bas puis de gauche à droite. Chaque ligne : le libellé exact en gras, puis son rôle, ses valeurs, son défaut et son effet, en 1 à 3 phrases. -->

| Élément | Ce qu'il montre |
|---|---|
| **Barre du haut** | Recherche, langue, thème et menu du compte : rôle, valeurs, effet. |
| **Menu** | Les pôles de l'application, selon les droits de l'utilisateur. |
| **Contenu de l'écran** | Ce que l'utilisateur voit en premier, et d'où viennent les chiffres. |
<!-- doc-kit:end -->

## Chaque action

<!-- consigne : facultatif. Une sous-section ### par geste de prise en main qui mérite plus qu'une légende : se connecter, chercher, changer de langue, se déconnecter. Supprimez la section sinon. -->

## Référence de chaque réglage

<!-- consigne : facultatif sur cette page. Les préférences de l'utilisateur (langue, thème, taille du texte, notifications), avec leurs valeurs et leur défaut lus dans le code. -->

| Réglage | Contrôle | Valeurs · défaut | Effet |
|---|---|---|---|
| **Libellé** | Liste | Valeurs possibles · défaut | Ce qui change |

## Pas à pas : se connecter pour la première fois

<!-- consigne : la première connexion, en 4 à 6 étapes, jusqu'à l'écran d'accueil. -->

:::etapes
1. Ouvrez l'adresse de l'application.
2. Deuxième geste.
3. Vérifiez que le menu affiche les pôles attendus.
:::

## Cas d'usage courants

<!-- consigne : facultatif. 3 à 5 situations de prise en main, une ligne chacune. Exemple : « **Retrouver un écran** : tapez son nom dans la recherche. » -->

:::etapes
1. **Situation** : les gestes, dans l'ordre.
:::

## Pièges et limites à connaître

<!-- consigne : les pièges de la première connexion (compte créé sans droits, menu vide, langue), puis les écarts constatés avec leur preuve. -->

> [!ATTENTION] Le piège, en une ligne
> Ce qui se passe, pourquoi, et comment l'éviter.

> [!NOTE] Écarts constatés (vX.Y.Z)
> - Écart entre l'écran, la documentation et le code (voir `chemin/fichier.ts` ; pas de numéro de ligne ici — cette page est dans l'espace Métier, voir writing.fr.md §13).

## En production

<!-- consigne : facultatif. Le mode de connexion réellement configuré en production, daté. Supprimez la section si la production n'a pas été observée. -->

## Droits requis

<!-- consigne : ce que voit un compte sans aucune permission, et la permission minimale pour utiliser l'application. -->

> [!DROITS] Qui peut faire quoi sur cet écran
> - **Se connecter** : tout compte actif.
> - **Voir les pôles** : la permission de lecture de chaque pôle.
