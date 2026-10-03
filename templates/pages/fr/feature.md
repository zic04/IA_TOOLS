## Accès

<!-- consigne : un tableau à deux colonnes, quatre lignes fixes : Module (le pôle de l'application où elle vit), Qui peut l'utiliser ([[droit …]], chaque droit qui la débloque), Prérequis (donnée ou état que la fonctionnalité exige, p. ex. « un client avec un compte ouvert »), Vérifié le (la version et la date de la dernière relecture face à l'application). -->

| | |
|---|---|
| Module | Nom du module |
| Qui peut l'utiliser | [[droit module:action]] |
| Prérequis | Ce qui doit déjà exister |
| Vérifié le | vX.Y.Z, AAAA-MM-JJ |

## À quoi ça sert

<!-- consigne : le besoin métier en 2 à 4 phrases, en langage métier uniquement, sans code. Attribuez à cette page son identifiant « feature » (toc.json, champ « feature », p. ex. « F-01 ») et donnez-lui un titre (en gras, nom exact) dans la première phrase. -->

## Qui l'utilise

<!-- consigne : les rôles ou publics qui utilisent la fonctionnalité, et ce que chacun en fait. Une ligne par rôle, « **Rôle** : ce qu'il fait ». -->

- **Rôle** : ce qu'il fait avec cette fonctionnalité.

## Déclencheur et prérequis

<!-- consigne : facultatif. Ce qui démarre la fonctionnalité (une action, une échéance, le résultat d'une autre fonctionnalité), et ce qui doit être vrai avant. Supprimez la section quand le déclencheur est simplement « quelqu'un ouvre l'écran ». -->

## Scénario principal

<!-- consigne : le chemin normal, en étapes numérotées (acteur, action, résultat). Ajoutez un :::ecran ou un ::capture quand une capture rend une étape plus claire ; aucun des deux n'est obligatoire. -->

:::etapes
1. **Acteur** fait la première chose.
2. La fonctionnalité réagit : ce qui change.
3. **Acteur** voit le résultat.
:::

## Variantes et exceptions

<!-- consigne : facultatif. Les embranchements du scénario principal, numérotés après l'étape dont ils partent (« 3a. Si … »), chacun avec ce qui se passe à la place. -->

- **3a.** Si une condition est remplie, ce qui se passe à la place.

## Règles métier

<!-- consigne : les règles propres à cette seule fonctionnalité se définissent ici avec :::regle (un encadré par règle, un énoncé puis un exemple « Given / When / Then ») ; une règle partagée avec d'autres fonctionnalités n'est que citée avec [[regle …]], jamais redéfinie. -->

:::regle{id="RG-00" titre="Un énoncé court et vérifiable"}
La règle, en une ou deux phrases.

**Exemple.** **Étant donné** une situation de départ, **quand** l'action déclenchante se produit, **alors** le résultat qui suit.
:::

## Données traitées

<!-- consigne : facultatif. Les données métier que lit ou modifie cette fonctionnalité, nommées comme un lecteur métier les connaît (jamais un nom de table ou de colonne) : ce que chacune signifie, et qui d'autre en dépend. -->

## Notifications et effets

<!-- consigne : facultatif. Ce que la fonctionnalité déclenche au-delà de l'écran lui-même : un courriel, une entrée dans la liste d'une autre fonctionnalité, un compteur qui change ailleurs. Une ligne par effet, qui le reçoit. -->

## Limites

<!-- consigne : facultatif. Ce que la fonctionnalité ne fait délibérément pas, ou seulement en partie, en langage métier (jamais un piège de code : cette page ne cite aucun code). Exemple : « La fonctionnalité ne retente pas une notification échouée ; une demande au support est nécessaire. » -->

## Questions fréquentes

<!-- consigne : facultatif. 2 à 5 questions réellement posées par un utilisateur, une personne du support ou un product owner, chacune avec une réponse courte et directe. -->

**Question, telle qu'elle a été posée ?** La réponse directe, en une ou deux phrases.
