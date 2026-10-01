## À quoi ça sert

<!-- consigne : en 2 à 4 phrases : le registre des comptes, ce qu'on y voit (rôle, périmètre, activité) et ce qu'on y fait (désactiver, transférer le travail d'une personne qui part, supprimer). Exemple : « On y voit qui a accès à l'application, avec quel rôle et quel périmètre. » -->

> [!NOTE] Où se trouve cet écran
> [[menu Administration › Utilisateurs]] ([[route /admin/users]]).

## Comment ça marche

<!-- consigne : d'où viennent les comptes (première connexion, pré-affectation, création manuelle), ce que fait le serveur pour afficher la liste (tri, filtres, comptes masqués par défaut), quand un changement de droits s'applique (immédiatement ou à la reconnexion), avec la preuve dans le code. -->

> [!MECANISME] Ce que fait le serveur pour afficher la liste
> 1. Première étape réelle, dans l'ordre du code.
> 2. Deuxième étape.
> 3. Troisième étape.

## L'écran

<!-- consigne : une capture par vue (liste, fenêtre de suppression, fenêtre de transfert) ; autant d'éléments que de zones capturées, dans l'ordre de lecture. Déclarez la capture « admin-utilisateurs » dans un plan de captures/plans/. -->

:::ecran{capture="admin-utilisateurs" titre="Administration › Utilisateurs"}
1. **Libellé exact**. Rôle, valeurs, défaut, effet.
2. **Libellé exact**. Rôle, valeurs, défaut, effet.
3. **Libellé exact**. Rôle, valeurs, défaut, effet.
:::

## Chaque action

<!-- consigne : une sous-section ### par action qui écrit : activer ou désactiver, transférer, supprimer. Pour chacune : la fenêtre, les contrôles du serveur, ce qui est écrit au journal d'audit. Ne cliquez jamais ces boutons en production : décrivez-les d'après le code. -->

## Référence de chaque réglage

<!-- consigne : une ligne par contrôle de l'écran. -->

| Réglage | Contrôle | Valeurs · défaut | Effet |
|---|---|---|---|
| **Libellé** | Interrupteur | Valeurs possibles · défaut | Ce qui change |

## Pas à pas : gérer le départ d'une personne

<!-- consigne : de la reprise de son travail à la fermeture de son accès, y compris hors de l'application (fournisseur d'identité). -->

:::etapes
1. Ouvrez [[menu Administration › Utilisateurs]].
2. Deuxième geste.
3. Vérifiez le résultat.
:::

## Cas d'usage courants

<!-- consigne : facultatif. Retrouver une personne, donner un rôle, faire le ménage : une ligne chacun. -->

:::etapes
1. **Situation** : les gestes, dans l'ordre.
:::

## Pièges et limites à connaître

<!-- consigne : par exemple un compteur du menu qui ne dit pas la même chose que la liste, une suppression refusée par le serveur, une désactivation qui ne ferme pas l'accès chez le fournisseur d'identité. Puis les écarts constatés. -->

> [!ATTENTION] Le piège, en une ligne
> Ce qui se passe, pourquoi, et comment l'éviter.

> [!NOTE] Écarts constatés (vX.Y.Z)
> - Écart entre l'écran, la documentation et le code (`chemin/fichier.ts:42`).

## En production

<!-- consigne : facultatif. Nombre de comptes, comptes jamais connectés, rôles réellement attribués, datés. -->

## Droits requis

<!-- consigne : la permission d'ouvrir l'écran, celle de modifier les comptes, et les rôles livrés qui les portent. -->

> [!DROITS] Qui peut faire quoi sur cet écran
> - **Ouvrir** l'écran : [[droit admin:access]].
> - **Modifier** les comptes : [[droit user:manage]].
