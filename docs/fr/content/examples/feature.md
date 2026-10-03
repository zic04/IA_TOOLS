> [!NOTE] À propos de cet exemple
> Cette page est l'exemple du gabarit `feature`, écrit pour Acme Orders, le produit fictif du kit. Les pages métier ne citent aucun code : comparez avec [l'exemple d'écran](#/examples/screen), qui en cite.

## Accès

| | |
|---|---|
| Module | Commandes |
| Qui peut l'utiliser | [[droit orders:write]] pour soumettre, [[droit orders:approve]] pour décider |
| Prérequis | Une commande au-dessus du seuil de validation, au statut **En attente de validation** |
| Vérifié le | v2.4.0, 2026-10-02 |

## À quoi ça sert

**La validation des commandes** protège Acme des erreurs coûteuses sur les grosses commandes : dès que le total d'une commande franchit le seuil de validation, elle attend la décision d'un responsable commercial avant de pouvoir être expédiée. Un commercial crée et modifie la commande normalement ; la validation ne verrouille que l'étape qui lui permet d'avancer.

## Qui l'utilise

- **Commercial** : soumet la commande ; voit pourquoi elle attend, et la décision du responsable une fois prise.
- **Responsable commercial** : relit les commandes en attente de sa région et approuve ou rejette chacune.
- **Finance** : fixe et revoit le seuil de validation.

## Déclencheur et prérequis

Soumettre une commande dont le total atteint ou dépasse le seuil en cours démarre la validation. Sous le seuil, la commande est expédiée sans elle.

## Scénario principal

:::etapes
1. Un **commercial** soumet une commande dont le total atteint ou dépasse le seuil.
2. La commande passe **En attente de validation** et le commercial ne peut plus l'expédier lui-même.
3. Un **responsable commercial** de la région de la commande l'ouvre depuis sa file de validation.
4. Le responsable l'**approuve** : la commande passe **Validée** et peut être expédiée.
:::

## Variantes et exceptions

- **4a.** Le responsable **rejette** la commande avec un motif : elle revient en **Brouillon**, le motif joint, et le commercial peut la corriger puis la resoumettre.
- **4b.** Aucun responsable de la région n'agit en deux jours ouvrés : une relance est envoyée ([le processus de validation](#/examples/process)).

## Règles métier

:::regle{id="RG-01" titre="Seul le responsable de la région de la commande peut la valider"}
Un responsable commercial ne voit, et ne peut décider, que sur les commandes de sa propre région.

**Exemple.** **Étant donné** un responsable de la région Nord, **quand** il ouvre sa file de validation, **alors** elle ne contient que des commandes dont la région est Nord.
:::

[[regle RG-12]] fixe le seuil lui-même.

## Données traitées

- **Montant total** : le chiffre comparé au seuil ; il est figé au moment où la commande est soumise et ne change pas si un prix change ensuite.
- **Décision** : qui a décidé, quand, et le motif en cas de rejet.

## Notifications et effets

- Le commercial de la commande est informé de la décision du responsable, par le même canal que les autres mises à jour de commande.
- Un rejet ajoute le motif à l'historique de la commande, visible par le commercial et par tout responsable qui l'ouvre plus tard.

## Limites

- La validation est tout ou rien : un responsable ne peut pas valider une partie des lignes d'une commande.
- Un responsable ne peut pas déléguer sa file à quelqu'un d'autre en son absence ; le responsable d'une autre région ne peut pas agir à sa place.

## Questions fréquentes

**Ma commande attend depuis trois jours. Que faire ?** Contactez directement le responsable commercial de votre région ; la relance automatique ne se déclenche qu'une fois, après deux jours ouvrés.

**Puis-je baisser une commande sous le seuil pour éviter la validation ?** Oui, mais seulement avant de la soumettre : une fois **En attente de validation**, le total retenu pour la décision est figé.
