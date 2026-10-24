## Comment lire cette page

Voici la liste de travail de qui reprend Acme Orders : les écarts constatés dans la version 1.4.0, revérifiés
directement dans `serve.mjs` et dans les fichiers de `public/`. Il n'existe pas de déploiement en production : aucun
constat ici ne vient d'ailleurs que du code.

| Gravité | Définition | Nombre |
|---|---|---|
| **Critique** | Un risque actuel pour la sécurité des données ou pour la promesse centrale du produit ; à traiter avant toute autre modification | 1 |
| **Important** | Un vrai défaut, un contournement possible ou une fonctionnalité cassée ; à planifier rapidement | 1 |
| **Mineur** | Dette, incohérence ou réglage sans effet ; à traiter au fil de l'eau | 1 |

Les constats sont numérotés **C** (critique), **I** (important) et **M** (mineur). Un numéro ne change jamais : un
nouveau constat prend le prochain numéro libre de sa famille.

## L'essentiel en une minute

:::steps
1. **Ajoutez un contrôle de rôle** : aujourd'hui, toute personne connectée peut utiliser toutes les fonctionnalités d'Acme Orders (C1).
2. **Cessez d'écrire lors d'un GET** : ouvrir un lien ne doit jamais créer de données (I1).
3. **Branchez le réglage du thème, ou supprimez-le** : il est enregistré mais n'a aucun effet (M1).
:::

## Constats

### C1 — Aucun contrôle d'accès

**Constat** : le seul contrôle avant toute action est « quelqu'un est-il connecté » ([[verified serve.mjs:46]]) ; rien
ne vérifie ce que cette personne a le droit de faire. [[feature F-02]] présente [[perm orders:approve]] comme une
permission distincte de [[perm orders:read]], mais le serveur ne les distingue jamais.

**Impact** : toute personne connectée peut lire toutes les commandes, modifier le profil, et ouvrir — donc créer — la
chaîne d'approbation de n'importe quelle commande. La page [rôles et permissions](#/features/roles) décrit le modèle
qu'Acme Orders n'applique pas encore.

**Recommandation** : rattacher un rôle à chaque session ([[verified serve.mjs:36]]) et le vérifier avant chaque
action, en commençant par [[perm orders:approve]].

Responsable : Mainteneurs de la démo · Décision : Corriger · Statut : Ouvert · Échéance : —

### I1 — Ouvrir la chaîne d'approbation écrit lors d'un GET

**Constat** : consulter `/orders/<id>/approval` crée la chaîne d'approbation de la commande et enregistre une
écriture, que la visite soit volontaire ou non ([[verified serve.mjs:59]]). La page d'une commande précharge même
cette route en arrière-plan dès son chargement ([[verified order.html:22]], [[verified app.js:16]]) : la chaîne est donc
créée avant que quiconque ait cliqué sur quoi que ce soit.

**Impact** : un aperçu de lien, un robot d'indexation, ou la capture en lecture seule de doc-kit lui-même (bloquée
uniquement parce que cette route est déclarée dans `capture.forbidden`) peuvent déclencher la même écriture.
[[rule BR-02]] décrit cela comme un comportement métier voulu, mais une requête GET qui crée des données reste un
risque pour quiconque transmet le lien.

**Recommandation** : créer la chaîne lors de la soumission de la commande, et non à l'ouverture du lien ; faire de la
page d'approbation une simple lecture.

Responsable : Mainteneurs de la démo · Décision : Corriger · Statut : Ouvert · Échéance : —

### M1 — Le réglage du thème n'a aucun effet

**Constat** : **Réglages → Thème** propose Clair, Sombre et Système, et le choix est enregistré
([[verified app.js:55]]). Rien ne le relit : `app.js:51` se contente d'écrire la valeur enregistrée dans la liste
déroulante, et `style.css` ne définit aucune variante sombre.

**Impact** : aucun hormis la confusion — le réglage semble devoir changer la page, et ne le fait pas.

**Recommandation** : soit implémenter une variante sombre de `style.css`, soit retirer le réglage tant qu'il n'en
existe pas.

Responsable : Mainteneurs de la démo · Décision : Accepter · Statut : Ouvert · Échéance : —

## Ce qui n'a pas pu être vérifié

- Si un vrai déploiement d'Acme Orders serait placé derrière un proxy inverse ou un répartiteur de charge : cette démo
  ne tourne jamais qu'avec `node serve.mjs` sur une machine locale.
