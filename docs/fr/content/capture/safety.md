## En bref

Une campagne de documentation peut se faire sur une **démo préparée** ou sur la **production**, en lecture seule. Le
kit protège la production de trois façons, et la troisième dépend de vous.

1. **Lecture seule** : dès qu'une session est utilisée, toute requête autre que `GET`, `HEAD` et `OPTIONS` est
   annulée **dans le navigateur** et comptée. La dernière ligne de chaque campagne dit combien :
   `Lecture seule : 1 requête d'écriture bloquée — POST /api/presence`.
2. **Routes interdites** : les routes listées dans `capture.forbidden` ne sont jamais ouvertes. Une entrée qui en vise
   une est refusée avant toute exécution (code de sortie 1). Pendant la campagne, toute requête vers l'une d'elles est
   annulée dans le navigateur : un **préchargement** (un framework qui précharge les liens d'un menu) est seulement
   compté, et la capture continue ; une **navigation** vers l'une d'elles (un clic sur son lien) arrête la capture.
3. **Votre plan** : un clic sur **Enregistrer** est bloqué, mais aucun navigateur ne peut bloquer une page dont le
   **serveur** écrit pendant le rendu. Lisez le code d'une page de détail avant de l'ouvrir, et interdisez les routes
   qui écrivent.

## Le schéma

::schema{id="safety" titre="Où agit chaque protection. Le navigateur peut annuler les requêtes qu'il envoie (lecture seule) ; il ne peut pas empêcher ce que fait le serveur pendant le rendu d'une page qu'il a eu le droit d'ouvrir : ces routes ne sont donc jamais ouvertes (interdites)."}

## Lecture seule

| `capture.readOnly` | Effet |
|---|---|
| `"auto"` (par défaut) | Activée dès qu'une session est utilisée ; désactivée sans session |
| `true` | Toujours activée, même sans session |
| `false` | Désactivée : les requêtes d'écriture atteignent l'application. Avec une session, chaque campagne avertit : « la lecture seule est DÉSACTIVÉE alors qu'une session est utilisée ». Refusé avec `capture.target: "production"` |

La variable `<PREFIXE>_READONLY` (ou `DOC_KIT_READONLY`) la remplace le temps d'une campagne : `1`, `true`, `yes`,
`oui` ou `0`, `false`, `no`, `non`, ou `auto`.

Certains blocages sont normaux : un signal de présence, une balise de mesure d'audience, ou l'action serveur qui
charge une page. Une page qui charge ses données par un `POST` est capturée **incomplète** : décrivez-la, ne
contournez pas le blocage.

## Routes interdites : pourquoi le navigateur ne suffit pas

Dans l'application de démo, ouvrir le circuit de validation d'une commande **le crée sur le serveur**, et dans un
vrai produit cela préviendrait les valideurs. Le navigateur n'a envoyé qu'un `GET` : la lecture seule n'a rien à
bloquer.

:::ecran{capture="order-detail" titre="La fiche de la commande 1041 dans l'application de démo"}
1. **Order #1041** : la fiche s'ouvre sans risque ; sa route, `/orders/1041`, ne fait que lire.
2. **Details** : client, statut, date, lignes et montant, lus depuis l'API.
3. **Approval chain** : ce lien mène à `/orders/1041/approval`, dont le code serveur crée le circuit pendant le
   rendu. Cette route est listée dans `capture.forbidden` et n'est jamais ouverte.
:::

```js
capture: {
  // expressions régulières JavaScript sur le chemin de la route (sans les paramètres)
  forbidden: ["^/orders/\\d+/approval$"],
},
```

Une entrée dont la `route` correspond est refusée avant même le démarrage du navigateur :

```text
✖ order-approval : la route /orders/1041/approval est interdite (capture.forbidden : ^/orders/\d+/approval$)
  → une écriture faite par le serveur pendant le rendu d'une page ne peut pas être bloquée par le navigateur :
    décrivez la page d'après son code, ou réutilisez un enregistrement déjà ouvert et ajustez capture.forbidden
```

### Pendant la campagne : préchargement ou navigation

Un serveur rend une page pour **tout** `GET` de sa route, quel qu'en soit l'auteur. Les frameworks web préchargent en
arrière-plan les liens d'une page (un `fetch` des données de la page suivante, un `<link rel=prefetch>`) : dans
l'application de démonstration, la fiche d'une commande précharge son circuit de validation, et un menu
d'administration qui pointe vers une page interdite la précharge depuis chaque page qui affiche ce menu. Le kit annule
donc **toute** requête vers un chemin interdit, dans le navigateur, et distingue deux cas :

| Requête vers un chemin interdit | Exemples | Ce qui se passe |
|---|---|---|
| Un préchargement ou une sous-ressource | `fetch`, XHR, les données de page d'un framework, `<link rel=prefetch>`, une iframe | Annulée et comptée ; la capture continue |
| Une navigation de la page | La route du plan, un clic sur le lien, une fenêtre surgissante, une redirection | Annulée ; la capture s'arrête (code de sortie 1) |

Annuler le préchargement est exactement ce qui empêche le rendu côté serveur : la requête ne lui parvient jamais. Les
dernières lignes de la campagne comptent les préchargements :

```text
✔ order-detail (3 zones, 41 Ko, 2.1 s)

1/1 capture prise.
1 requête de préchargement vers une route interdite interrompue — GET /orders/1041/approval
Lecture seule : 0 requête d'écriture bloquée
```

Une navigation arrête sa capture, et le bilan la liste :

```text
✖ order-approval-click : la page a demandé une route interdite (/orders/1041/approval) : capture arrêtée
…
✖ route interdite : 1 requête refusée — GET /orders/1041/approval
```

Les service workers sont bloqués pendant les captures : aucune requête n'échappe au contrôle.

## Avant d'ouvrir une page de détail

:::etapes
1. Trouvez le code qui produit la route : le composant de page, un chargeur, un contrôleur.
2. Cherchez une écriture : une fonction nommée comme `create…`, `ensure…`, `upsert…`, `update…`, une notification,
   un compteur.
3. S'il y en a une, ajoutez la route à `capture.forbidden`, et décrivez la page d'après son code.
4. Si la capture est indispensable, réutilisez un enregistrement dont l'écriture a **déjà eu lieu**, et notez-le dans
   la page qui explique comment la documentation est maintenue.
:::

## Démo ou production

| | Production, en lecture seule | Démo préparée |
|---|---|---|
| Ce que vous montrez | L'état et les volumes réels | Un jeu de données choisi pour tout montrer |
| Captures avant / après | Impossibles : rien n'est modifié | Possibles : régler, capturer, remettre en l'état |
| Pages chargées par un `POST` | Incomplètes | Complètes |
| Écritures du serveur pendant le rendu | Un vrai risque : `capture.forbidden` | Sans conséquence |
| Données personnelles | Seulement avec la décision écrite du propriétaire ; relisez chaque image | Fictives |
| Préparation | Une connexion (`doc-kit connect`) | Un script idempotent (`capture.setup`, lancé par `doc-kit demo`) |

### Déclarer la production : `capture.target`

`doc-kit init` demande où prendre les captures : « 1) application locale ou de démo, 2) production, en lecture
seule, 3) aucune capture ». La réponse est `capture.target` (`"local"`, `"demo"` ou `"production"`). Avec
`"production"` :

| Quoi | Effet |
|---|---|
| Lecture seule | Toujours active, même sans session ; `readOnly: false` ou `<PREFIXE>_READONLY=0` est refusé (code de sortie 2) |
| `doc-kit capture` | Un bandeau `PRODUCTION — lecture seule · N captures · <url>`, puis une question dont la réponse par défaut est **non** ; sans terminal, `--yes` |
| `doc-kit demo` | Refusé (code de sortie 2) : un script de données de démo ne tourne jamais sur la production |
| `doc-kit connect` | Une première ligne le dit : vous vous connectez avec votre propre compte |
| `doc-kit doctor` | Une ligne avec la cible ; ⚠ tant que `capture.forbidden` est vide |
| Le mode guidé | Le bandeau production avant de proposer `connect` ou `capture` |

Les deux se combinent : documentez les éditeurs sur la démo, et la configuration réelle avec des captures de
production en lecture seule, rangées dans un autre dossier de plans (`captures/plans-prod`, ids préfixés par
`prod-`), choisi avec `--plans` ou `<PREFIXE>_PLANS`.

## Le script des données de démo

`capture.setup` nomme un script qui prépare les données de démo ; `doc-kit demo` le lance dans son propre processus
Node, depuis le dossier du projet. Quand il exporte une fonction par défaut, celle-ci reçoit `{ config, root, url }` ;
les variables `DOC_KIT_PROJECT`, `DOC_KIT_URL` et `DOC_KIT_CONFIG` (en JSON) sont aussi définies. Il doit être
**idempotent** : lancez-le avant chaque campagne.

```js
// captures/setup.mjs
export default async function setup({ url }) {
  const r = await fetch(`${url}/api/demo/reset`, { method: "POST" });
  if (!r.ok) throw new Error(`demo reset refused: HTTP ${r.status}`);
}
```

## Pièges et écarts constatés

> [!ERREUR] La production est partagée
> Capturez par petits lots de 3 à 8 entrées (`doc-kit capture "prod-commandes-*"`), vérifiez le nombre d'écritures
> bloquées sur la dernière ligne, et supprimez la session à la fin de la campagne (`doc-kit connect --forget`).

> [!NOTE] Ce que la lecture seule ne couvre pas
> Les messages WebSocket et les requêtes faites par le serveur vers d'autres services sont hors de portée du
> navigateur. Seuls le plan, et `capture.forbidden`, en protègent.

## Pour aller plus loin

- [Connexion et sessions](#/capture/sessions) : la session qui active la lecture seule.
- [Le masquage](#/capture/masking) : ce qui est caché dans les images.
- `standard/captures.fr.md` dans le kit : les règles de sécurité du standard, avec leur historique.
