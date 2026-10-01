> [!NOTE] À propos de cet exemple
> Cette page est l'exemple du gabarit `screen`, écrit pour Acme Orders, le produit fictif du kit. Ses preuves `fichier:ligne` renvoient à un code fictif.

## À quoi ça sert

**Orders** est le point d'entrée de l'activité commerciale : la liste des commandes que vous avez le droit de voir, un résumé de ce que montre la liste, et le bouton qui lance une nouvelle commande. Les commerciaux s'en servent pour retrouver une commande et l'ouvrir. Les directeurs commerciaux y voient ce qui reste ouvert dans leur région.

> [!NOTE] Où se trouve cet écran
> [[menu Orders › All orders]] ([[route /orders]]). C'est aussi la première page affichée après la connexion.

## Comment ça marche

La liste est calculée à deux endroits. Le serveur décide **quelles** commandes arrivent dans votre navigateur ; le navigateur les filtre ensuite pendant la saisie, sans interroger de nouveau le serveur.

> [!MECANISME] Ce que font le serveur et le navigateur pour afficher l'écran
> 1. Le serveur vérifie votre session et [[droit orders:read]], puis lit votre périmètre : votre région, ou toutes les régions pour les rôles **Finance** et **Administrator** (`app/(app)/orders/page.tsx:21-26`).
> 2. `listOrders` charge les commandes non archivées de ce périmètre, les plus récentes d'abord, **200 au plus** (`lib/services/orderService.ts:43-50`).
> 3. La page est calculée à chaque visite, jamais mise en cache (`page.tsx:3`). Elle ne se rafraîchit pas d'elle-même : une commande créée par un collègue apparaît quand vous rechargez la page.
> 4. Dans le navigateur, chaque changement d'un filtre recalcule les lignes affichées, à chaque frappe (`app/(app)/orders/OrdersFilters.tsx:22-35`).
> 5. Le panneau **Today** additionne les lignes affichées, quelle que soit leur date (`app/(app)/orders/TodayPanel.tsx:14-22`).

Le filtre **Status** propose quatre libellés, mais une commande a cinq statuts dans le code. Le libellé **Open** en regroupe trois (`lib/orders/statusLabels.ts:6-13`) :

| Libellé du filtre | Codes de statut retenus | Pastille dans le tableau |
|---|---|---|
| **All** | Tous les statuts | — |
| **Open** | `DRAFT`, `PENDING_APPROVAL`, `APPROVED` | [[statut open]] |
| **Shipped** | `SHIPPED` | [[statut shipped]] |
| **Cancelled** | `CANCELLED` | [[statut cancelled]] |

Un brouillon et une commande validée ont donc le même aspect sur cet écran. Le [parcours d'une commande](#/examples/journey) suit chaque statut de bout en bout.

## L'écran

:::ecran{capture="orders-list" titre="Orders › All orders"}
1. **Filters**. Trois champs qui restreignent les lignes affichées : **Status** (**All**, **Open**, **Shipped**, **Cancelled** ; **All** par défaut), **Customer** (une partie du nom, sans tenir compte de la casse ; vide par défaut) et **Date** (une date de commande ; vide par défaut). Une ligne doit satisfaire les trois.
2. **Today**. Trois chiffres : le nombre de commandes (**orders**), combien sont ouvertes (**open**), et le montant total (**total**). Malgré son titre, le panneau additionne les lignes laissées par les filtres, commandes annulées comprises : ici 6 commandes, 3 ouvertes, 6 251,45 $ ([I2](#/examples/findings~constats-importants)).
3. **New order**. Ouvre un formulaire de commande vide ([[route /orders/new]]). Affiché seulement avec [[droit orders:write]].
4. **Orders**. Une ligne par commande : **Order** (son numéro, un lien vers la fiche de la commande), **Customer**, **Status** (une pastille colorée) et **Amount** hors taxes. Les lignes vont de la plus récente à la plus ancienne ; aucune colonne ne peut être triée ni masquée.
:::

## Chaque action

### Filtrer la liste

Les filtres agissent aussitôt, sans bouton. Choisir **Open** dans **Status** et taper « north » dans **Customer** ne laisse qu'une ligne, et le panneau **Today** suit : 1 commande, 1 ouverte, 1 250,00 $.

::capture{id="orders-open" titre="Orders › All orders, avec Status = Open et Customer = north"}

### Créer une commande

**New order** ouvre [[route /orders/new]]. Rien n'est écrit tant que vous ne cliquez pas **Save** sur ce formulaire. La commande démarre alors en `DRAFT`, affichée [[statut open]], et le journal d'audit enregistre `order.create` (`lib/services/orderService.ts:88-97`). Quitter le formulaire sans enregistrer n'écrit rien.

### Ouvrir une commande

Le numéro de la colonne **Order** ouvre la fiche de la commande ([[route /orders/[id]]]). Ce qui se passe quand elle est soumise est décrit dans [l'étape de validation](#/examples/journey-step).

## Référence de chaque réglage

| Réglage | Contrôle | Valeurs · défaut | Effet |
|---|---|---|---|
| **Status** | Liste | **All**, **Open**, **Shipped**, **Cancelled** · **All** | Garde les lignes dont le statut correspond ; **Open** couvre trois codes |
| **Customer** | Champ texte | Un texte quelconque · vide | Garde les lignes dont le nom du client contient le texte, sans tenir compte de la casse |
| **Date** | Champ date | Un jour · vide | Garde les commandes de ce jour exact ; pas de période |

Les filtres ne vivent que dans la page. Ils sont perdus quand vous ouvrez une commande puis revenez ([M1](#/examples/findings~constats-mineurs)).

## Pas à pas : retrouver les commandes ouvertes d'un client

:::etapes
1. Ouvrez [[menu Orders › All orders]].
2. Dans **Status**, choisissez **Open**.
3. Dans **Customer**, tapez une partie du nom, par exemple « north ».
4. Lisez les lignes restées dans le tableau ; **Today** n'additionne plus que ces lignes.
5. Cliquez le numéro de la colonne **Order** pour ouvrir la commande.
:::

## Cas d'usage courants

:::etapes
1. **Contrôle de fin de journée** : mettez **Date** à la date du jour, puis lisez **Today** ; retirez vous-même les commandes annulées du total.
2. **Un client demande une ancienne commande** : si elle n'est pas dans la liste, cherchez-la avec [[touche Ctrl+K]] ; la liste ne contient que les 200 commandes les plus récentes.
3. **Préparer une visite client** : tapez le client dans **Customer**, laissez **Status** sur **All**, et notez les commandes expédiées et annulées.
4. **Le tableau est vide** : effacez les trois filtres ; s'il reste vide, votre compte n'a peut-être pas de région (voir [Diagnostic : les accès](#/examples/troubleshooting-area~voir)).
:::

## Pièges et limites à connaître

> [!ATTENTION] Le panneau Today ne porte pas sur la journée
> Il additionne les lignes laissées par les filtres, quelle que soit leur date, et compte les commandes annulées dans le total. Mettez **Date** à la date du jour pour obtenir les chiffres de la journée, et ne lisez jamais le total comme un chiffre d'affaires ([I2](#/examples/findings~constats-importants)).

> [!ATTENTION] Seules les 200 commandes les plus récentes sont chargées
> Les filtres travaillent sur ce que le serveur a envoyé. Une commande plus ancienne du même client n'apparaît pas, et rien ne signale que la liste est tronquée. Utilisez la recherche, [[touche Ctrl+K]], qui interroge le serveur.

> [!NOTE] Écarts constatés (v2.4.0)
> - Le **total** de **Today** inclut les commandes annulées : les 145,20 $ de la commande n° 1044 sur la capture (`TodayPanel.tsx:19`).
> - Rien à l'écran ne dit que la liste s'arrête à 200 commandes (`orderService.ts:48`).
> - Les filtres sont perdus au retour d'une commande ([M1](#/examples/findings~constats-mineurs), `OrdersFilters.tsx:18`).

## En production

Constaté en lecture seule le 30 septembre 2026, avec le compte d'un directeur commercial de la région Nord : 212 commandes de ce périmètre n'étaient pas archivées. La liste en chargeait donc 200, et les 12 plus anciennes n'étaient accessibles que par la recherche. Sans filtre, **Today** affichait 200 commandes, un chiffre qu'un directeur pouvait facilement prendre pour l'activité de la journée.

## Droits requis

> [!DROITS] Qui peut faire quoi sur cet écran
> - **Voir** l'écran : [[droit orders:read]], détenu par les quatre rôles livrés avec le produit : **Sales rep**, **Sales manager**, **Finance** et **Administrator**.
> - **Ce que vous voyez** : les commandes de votre région ; **Finance** et **Administrator** voient toutes les régions (voir [le filtrage par périmètre](#/examples/technical~le-filtrage-par-perimetre)).
> - **New order** : [[droit orders:write]] (**Sales rep**, **Sales manager**, **Administrator**). Sans ce droit, le bouton est masqué et le serveur refuse le formulaire.
