## En bref

Une **cible** dit au kit de quel élément de la page vous parlez : pour une zone, un cadre, un masque ou une action.
Une **action** est une étape jouée sur la page avant la capture : un clic, un champ rempli, une touche pressée.

1. Une cible a **exactement une sorte** : `role`, `text`, `field`, `label`, `placeholder`, `css` ou `block`. Zéro ou
   deux sortes, c'est une erreur de plan.
2. Des **options** la précisent : `exact`, `nth`, `last`, `has`, `within`, `up`, `framed`, et les marges.
3. Une action a elle aussi **exactement une sorte** : `click`, `hover`, `type`, `select`, `press`, `scroll`, `wait`,
   `wheel` ou `eval`.
4. Les aides de `doc-kit/targets` écrivent pour vous les cibles fréquentes : `field("Customer")`, `button("Save")`…

## Cibles

| Sorte | Exemple | Trouve |
|---|---|---|
| `role` + `name` | `{ role: "button", name: "Save" }` | Un élément par son rôle ARIA et son nom accessible (texte ou expression régulière) |
| `text` | `{ text: "Total" }` | Un élément par son texte visible |
| `field` | `{ field: "Customer" }` | Un champ de formulaire entier : le `<label>` qui contient exactement ce texte, avec son contrôle |
| `label` | `{ label: "E-mail" }` | Le contrôle associé à ce libellé |
| `placeholder` | `{ placeholder: "Search…" }` | Un champ par son texte indicatif |
| `css` | `{ css: "main .toolbar" }` | Un sélecteur CSS |
| `block` | `{ block: "Filters" }` | Un conteneur qui correspond à `capture.selectors.block` et dont le bouton ou le titre commence par ce texte |

Par défaut, `name`, `text`, `label` et `placeholder` trouvent une partie du texte, sans tenir compte de la casse ;
`exact: true` exige le texte entier. Quand plusieurs éléments correspondent, le premier est retenu (le dernier pour
`block`, parce que les conteneurs s'imbriquent).

## Les options de cible

| Option | Exemple | Effet |
|---|---|---|
| `exact` | `{ text: "Open", exact: true }` | Texte entier, casse comprise |
| `nth` | `{ css: "tbody tr", nth: 2 }` | La troisième correspondance (comptée à partir de 0) ; `-1` est la dernière |
| `last` | `{ text: "Total", last: true }` | La dernière correspondance |
| `has` | `{ css: "section", has: "Invoices" }` | Seulement les correspondances qui contiennent ce texte |
| `within` | `{ role: "button", name: "Add", within: { block: "Lines" } }` | Cherchée à l'intérieur d'une autre cible |
| `up` | `{ text: "Notifications", up: 1 }` | L'élément parent, `n` niveaux plus haut |
| `framed` | `{ text: "Today", framed: true }` | La boîte encadrée la plus proche autour : un ancêtre qui correspond à `capture.selectors.frame`, sinon un ancêtre bordé sur ses quatre côtés |
| `margin` | `{ css: "form", margin: 8 }` | Pixels autour d'une zone (4 par défaut) ; pour un cadre, à gauche et à droite (34 par défaut). Négative, elle resserre la boîte |
| `marginY` | `{ css: "form", marginY: 20 }` | Pour un cadre : pixels en haut et en bas (10 par défaut) ; négative, elle resserre le cadre |
| `side` | `{ ...button("Save"), side: "right" }` | Où se place la pastille d'une zone ([Zones](#/capture/zones)) |

## Les aides de `doc-kit/targets`

```js
// captures/targets.mjs d'un projet (écrit par doc-kit init)
export * from "doc-kit/targets";
export const dialog = { css: "[role=dialog]" };   // les aides propres au projet
```

| Aide | Donne |
|---|---|
| `field("Customer")` | `{ field: "Customer" }` |
| `toggle("Notifications")` | `{ text: "Notifications", up: 1 }` : une ligne avec un interrupteur |
| `card("Today")` | `{ text: "Today", framed: true }` : le panneau encadré autour d'un texte |
| `button("Save")`, `button("Save", true)` | `{ role: "button", name: "Save", exact }` |
| `link("Orders")` | `{ role: "link", name: "Orders", exact }` |
| `tab("Lines")` | `{ role: "tab", name: "Lines" }` |
| `main` | `{ css: "main", margin: 0, marginY: 0 }` : la zone principale, sans menu ni barre du haut |
| `union(a, b, …)` | `{ union: [a, b, …] }` : une zone sur plusieurs cibles |

## Actions

| Action | Exemple | Effet |
|---|---|---|
| `click` | `{ click: button("Filters") }` | Clic ; `options` transmet des options de clic Playwright : `{ click: …, options: { position: { x: 5, y: 5 } } }` |
| `hover` | `{ hover: { text: "Help" } }` | Survol |
| `type` | `{ type: { label: "Customer" }, value: "north" }` | Remplit un champ (son contenu est remplacé) |
| `select` | `{ select: { label: "Status" }, value: "Open" }` | Choisit une option d'un `<select>` : valeur, libellé, ou une liste |
| `press` | `{ press: "Escape" }` | Presse une touche ou un raccourci (`Control+K`) |
| `scroll` | `{ scroll: { text: "Invoices" } }` | Fait défiler un élément jusqu'à le rendre visible |
| `wait` | `{ wait: 500 }` ou `{ wait: { css: "[role=dialog]" } }` | Attend n ms, ou que l'élément soit visible (15 s au plus) |
| `wheel` | `{ wheel: { x: 600, y: 400, steps: 2, direction: -1 } }` | Molette de la souris en un point : crans de 360 px, `-1` vers le haut (zoom avant sur une carte) |
| `eval` | `{ eval: () => window.scrollTo(0, 0) }` | Une fonction (ou une chaîne) exécutée dans la page |

L'entrée ci-dessous ouvre la liste des commandes, choisit un statut et saisit un client, puis capture le résultat :

```js
{
  id: "orders-open",
  route: "/orders",
  viewport: { width: 1360, height: 720 },
  actions: [
    { select: { label: "Status" }, value: "Open" },
    { type: { label: "Customer" }, value: "north" },
  ],
}
```

L'image « avant » est la même entrée sans ses actions (`orders-all`) : les deux images d'un curseur doivent avoir la
même taille, donc les deux gardent toute la fenêtre.

::avant-apres{avant="orders-all" apres="orders-open" libelle-avant="Avant les actions" libelle-apres="Après les actions" titre="La même page avant et après les deux actions de l'entrée : faites glisser la poignée, ou utilisez les flèches du clavier."}

## Pièges et écarts constatés

> [!ATTENTION] En production, ne cliquez que pour naviguer
> Pages, onglets, menus, ouvrir une boîte de dialogue puis presser Échap, survoler. Jamais **Enregistrer**,
> **Créer**, **Valider**, **Supprimer**, **Envoyer**, **Importer** ni **Se déconnecter**, même si les requêtes
> d'écriture sont bloquées : une écriture faite par le serveur pendant le rendu d'une page ne peut pas être bloquée
> ([Démo ou production](#/capture/safety)).

> [!NOTE] Quand une action échoue
> « action 2 (click) en échec — … » : la cible n'a pas été trouvée en 8 s, ou elle est masquée. Lancez la capture
> avec `--preview`, puis précisez la cible (`exact`, `within`, `has`).

> [!NOTE] Cartes et pages vivantes
> Une page qui garde une connexion ouverte n'est jamais au repos : le kit attend l'événement `load`, puis `delay`.
> Augmentez `delay` plutôt que d'attendre que le réseau se calme.

## Pour aller plus loin

- [Les plans de capture](#/capture/plans) : les champs d'une entrée.
- [Zones, union et légendes](#/capture/zones) : les cibles employées comme zones numérotées.
- [Le masquage](#/capture/masking) : les cibles employées comme masques.
