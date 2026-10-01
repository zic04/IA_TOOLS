> [!NOTE] À propos de cet exemple
> Cette page est l'exemple du gabarit `editor`, écrit pour Acme Orders, le produit fictif du kit. Ses preuves `fichier:ligne` renvoient à un code fictif.

## À quoi ça sert

**Settings** réunit les préférences personnelles de la personne connectée : le nom (**Name**) affiché dans l'en-tête et inscrit au journal d'audit, la langue de l'interface (**Language**) et le thème (**Theme**). L'écran affiche aussi deux valeurs de l'espace de travail, en lecture seule. Chacun ne modifie que ses propres réglages.

Sans aucun réglage, Acme Orders fonctionne quand même. Le nom est la revendication (claim) `name` envoyée par le fournisseur d'identité à la première connexion (`lib/auth/index.ts:88`). La langue est la langue préférée du navigateur quand c'est l'anglais ou le français, et l'anglais sinon (`lib/i18n/locale.ts:14-22`). Le thème est **System** : il suit le mode clair ou sombre de l'appareil.

> [!NOTE] Où se trouve ce réglage
> [[menu Settings]] ([[route /settings]]), le lien **Settings** de la barre du haut. Pages liées : [la connexion](#/examples/technical-sub~le-parcours-de-connexion), d'où vient le nom par défaut, et [les variables d'environnement](#/examples/variables), d'où viennent les valeurs de l'espace de travail.

## Comment ça marche

Les trois préférences sont enregistrées ensemble, par une seule action serveur, mais ne s'appliquent pas au même moment : le nom et la langue sont lus par le serveur, le thème par un script dans le navigateur.

::schema{id="ex-settings-flow" titre="Ce qui se passe quand vous cliquez Save. Rangée du haut, de gauche à droite : le formulaire, l'action serveur, la validation, une transaction, les cookies. Un champ invalide s'arrête à Refusé ; un enregistrement valide recalcule le layout, qui affiche le nouveau nom, la nouvelle langue et le nouveau thème."}

> [!MECANISME] Quand et comment le réglage s'applique
> 1. À l'ouverture de la page, le serveur lit `user_preferences` et le nom de l'utilisateur (`app/(app)/settings/page.tsx:15-22`).
> 2. **Save** appelle l'action serveur `saveProfile` avec les trois champs de **Profile**, et eux seuls (`app/(app)/settings/actions.ts:12`).
> 3. `profileSchema` les vérifie (`lib/validation/profile.ts:4-11`). Un champ invalide renvoie son message, affiché sous le champ ; rien n'est écrit.
> 4. Une seule transaction écrit `users.display_name`, `user_preferences.locale` et `user_preferences.theme`, puis l'entrée d'audit `profile.update` (`actions.ts:24-37`).
> 5. L'action pose deux cookies, `acme_locale` et `acme_theme`, pour que l'affichage suivant n'ait pas besoin de la base de données (`actions.ts:39-40`).
> 6. `revalidatePath("/", "layout")` recalcule le layout, la mise en page commune à toutes les pages : l'en-tête affiche le nouveau nom et les libellés changent de langue sans rechargement (`actions.ts:42`).

| Réglage | Enregistré dans | Lu par | Prend effet |
|---|---|---|---|
| **Name** | `users.display_name` | Le serveur, à chaque affichage ; les modèles d'e-mail, à leur envoi | Aussitôt ; pour les e-mails envoyés ensuite |
| **Language** | `user_preferences.locale`, cookie `acme_locale` | Le serveur (`lib/i18n/locale.ts:14`) | Aussitôt, pour l'interface seulement |
| **Theme** | `user_preferences.theme`, cookie `acme_theme` | Un script dans le navigateur, avant le premier rendu à l'écran (`app/ThemeScript.tsx:8-15`) | Aussitôt ; **System** n'est lu qu'au chargement d'une page |

## L'écran

:::ecran{capture="settings-profile" titre="Settings"}
1. **Profile**. **Name** (texte, de 1 à 80 caractères), **Language** (**English**, **Français**) et **Theme** (**Light**, **Dark**, **System**). Les champs montrent vos préférences enregistrées ; rien ne change tant que vous ne cliquez pas **Save**.
2. **Workspace**. En lecture seule. **Workspace ID** est l'identifiant de l'espace de travail de votre organisation, que le support vous demande ; c'est un GUID, la capture montre donc des points (voir [le masquage](#/capture/masking)). **Integration** est l'adresse qu'appellent les systèmes partenaires, ici `https://orders.example.org/api/v1`. **Save** n'envoie jamais ces deux valeurs.
3. **Save**. Envoie les trois champs de **Profile**. En cas de succès, « Saved. » apparaît à côté du bouton ; en cas d'erreur, le message apparaît sous le champ concerné. Le bouton reste actif même quand rien n'a changé.
:::

## Ce que ça change

Les captures de ce site montrent un seul état de **Settings** : cette section n'a donc pas de curseur avant / après, et l'effet est décrit d'après le code.

| Réglage | Où l'utilisateur voit le changement | Quand |
|---|---|---|
| **Name** | En haut à droite de l'en-tête ; les nouvelles entrées d'audit ; les e-mails de validation envoyés aux autres | Juste après **Save** |
| **Language** | Menus, libellés, messages, dates et montants de l'interface | Juste après **Save** ; les e-mails restent en anglais ([R1](#/examples/findings~reglages-sans-effet)) |
| **Theme** | Les couleurs de toutes les pages | Aussitôt ; **System** suit un changement de l'appareil au chargement de page suivant ([M3](#/examples/findings~constats-mineurs)) |

Les objets existants gardent ce qu'ils ont enregistré. Une entrée d'audit conserve le nom de son auteur à ce moment-là (`lib/audit.ts:31`), et une étape de validation déjà décidée garde le nom de son valideur.

## Référence de chaque réglage

### Le panneau Profile

| Réglage | Contrôle | Valeurs · défaut | Effet |
|---|---|---|---|
| **Name** | Champ texte | De 1 à 80 caractères · la revendication `name` à la première connexion | En-tête, journal d'audit, e-mails de validation |
| **Language** | Liste | **English**, **Français** · la langue du navigateur, sinon l'anglais | Libellés, dates et montants de l'interface ; pas les e-mails |
| **Theme** | Liste | **Light**, **Dark**, **System** · **System** | Couleurs de l'interface, appliquées avant le premier rendu à l'écran |

### Le panneau Workspace

| Réglage | Contrôle | Valeurs · défaut | Effet |
|---|---|---|---|
| **Workspace ID** | Texte en lecture seule | Le GUID de l'espace de travail · fixé à l'installation | Aucun ; à citer au support |
| **Integration** | Texte en lecture seule | La variable `PUBLIC_API_URL` · ligne masquée quand elle est vide (`page.tsx:27`) | Aucun ; l'adresse à donner aux systèmes partenaires |

## Pas à pas : passer en français et au thème sombre

:::etapes
1. Cliquez **Settings** dans la barre du haut ([[route /settings]]).
2. Dans **Language**, choisissez **Français**.
3. Dans **Theme**, choisissez **Dark**.
4. Cliquez **Save** : « Saved. » apparaît, puis la page passe en français et en couleurs sombres.
5. Ouvrez [[menu Orders › All orders]] : les libellés sont en français sur cette page aussi.
6. Faites vérifier par un administrateur si besoin : [[menu Administration › Audit log]] montre une entrée `profile.update` qui cite `locale` et `theme`.
:::

## Pièges et limites à connaître

> [!ATTENTION] La langue n'atteint pas les e-mails
> Tous les e-mails d'Acme Orders partent en anglais, quelle que soit la langue choisie par le destinataire dans **Language** (`lib/mail/send.ts:22`). Prévenez les valideurs francophones avant qu'ils ne cherchent un e-mail en français ([R1](#/examples/findings~reglages-sans-effet)).

> [!ATTENTION] Un nouveau nom ne réécrit pas le passé
> Le journal d'audit et les étapes de validation décidées gardent le nom de l'époque. Une recherche dans le journal d'audit par le nouveau nom manque les entrées plus anciennes : cherchez plutôt par personne.

> [!ATTENTION] System ne suit l'appareil qu'au chargement d'une page
> Passer l'appareil en mode sombre pendant une visite ne change rien avant le chargement de page suivant ([M3](#/examples/findings~constats-mineurs)).

> [!NOTE] Écarts constatés (v2.4.0)
> - Un nom fait uniquement d'espaces est accepté : la longueur est vérifiée avant la suppression des espaces, et l'en-tête n'affiche alors aucun nom ([M2](#/examples/findings~constats-mineurs), `lib/validation/profile.ts:6`).
> - **Save** écrit une entrée `profile.update` même quand rien n'a changé (`app/(app)/settings/actions.ts:37`).
> - Ouvrir **Settings** écrit sur le serveur : la page envoie un signal de présence, `POST /api/presence`, pour la vue **Who is online** des administrateurs (`app/(app)/settings/PresencePing.tsx:9`). Une capture en lecture seule le bloque (voir [capturer sans risque](#/capture/safety)).

## Droits requis

> [!DROITS] Qui peut faire quoi sur cet écran
> - **Voir et modifier** ses propres réglages : [[droit settings:write]], détenu par les quatre rôles livrés avec le produit (`lib/permissions.ts:22-40`). Personne, pas même un administrateur, ne peut modifier les réglages de quelqu'un d'autre depuis cet écran.
> - Valeurs de **Workspace** : en lecture seule pour tous ; elles ne changent que par les variables du déploiement.
> - Chaque **Save** écrit `profile.update` avec les noms des champs modifiés, jamais leurs valeurs, lisible dans [[menu Administration › Audit log]] avec [[droit audit:read]].
