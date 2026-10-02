## En bref

Avant chaque capture, le kit remplace les valeurs sensibles par des points (`••••••••`) **dans la page elle-même** :
le texte, les valeurs des champs, les attributs `title` et `placeholder`. Ce qu'il masque :

1. **Les GUID** (8-4-4-4-12 caractères hexadécimaux), avec `masking.guid: true` (par défaut).
2. **Les valeurs des fichiers `.env` locaux de l'application** listés dans `masking.env`, quand le nom de leur clé
   évoque une URL, un hôte, un tenant, un client, un compte, une adresse e-mail, un utilisateur ou un secret, et que
   la valeur fait au moins 7 caractères. Les valeurs qui correspondent à `masking.exclude` (par défaut
   `localhost|127\.0\.0\.1`) sont conservées.
3. **Vos motifs** : les expressions régulières JavaScript de `masking.patterns`.
4. **Les `masks` d'une entrée** : chaque élément qui correspond à l'une de ses cibles, remplacé en entier.

Ce sont ces mêmes valeurs que `doc-kit check secrets` recherche dans les pages et dans le site ; `masking.allow` liste
les valeurs connues pour être publiques, que le contrôle ne doit pas signaler
([plus bas](#/capture/masking~valeurs-connues-pour-etre-publiques)).

## Une capture masquée

:::ecran{capture="settings-profile" titre="La page des réglages de l'application de démo, masquée"}
1. **Profile** : un nom, une langue et un thème. Rien ici ne correspond à une règle de masquage : tout est montré tel
   quel.
2. **Workspace** : le **Workspace ID** est un GUID, remplacé par des points par `masking.guid`. L'adresse
   **Integration** serait masquée elle aussi si le `.env` de l'application la contenait sous une clé comme `API_URL`.
3. **Save** : jamais cliqué pendant une capture ; sur cette page, le signal de présence envoyé à l'ouverture de la
   page est une requête d'écriture, bloquée par la lecture seule.
:::

## La configuration

```js
masking: {
  env: ["../../.env", "../../.env.local"],   // les fichiers .env locaux de l'application, relatifs au projet
  exclude: "localhost|127\\.0\\.0\\.1",       // valeurs conservées même quand leur clé semble sensible
  guid: true,                                 // les GUID
  patterns: ["ACME-\\d{6}", "[A-Z]{2}\\d{2}(?: ?\\d{4}){4}"],   // d'autres expressions régulières (drapeaux g et i)
  allow: ["^pk\\.acme-public-maps$"],      // valeurs connues pour être publiques : non signalées par check secrets
},
```

| Le nom de la clé contient | Exemples |
|---|---|
| URL, URI, HOST, DOMAIN, ENDPOINT | `API_URL`, `DB_HOST`, `AUTH_DOMAIN` |
| TENANT, CLIENT, AUDIENCE, ACCOUNT | `AUTH_TENANT`, `CLIENT_ID`, `STORAGE_ACCOUNT` |
| EMAIL, MAIL, USER, LOGIN | `SUPPORT_EMAIL`, `DB_USER` |
| SECRET, PASSWORD, PASSWD, PWD, TOKEN, KEY, DSN, CONNECTION | `CLIENT_SECRET`, `API_KEY`, `SENTRY_DSN` |

L'analyseur de `.env` comprend `KEY=value`, `export KEY=value`, les valeurs entre guillemets et les commentaires.
`doc-kit init` liste les fichiers `.env` et `.env.local` qu'il trouve à la racine de l'application et dans le dossier
de son front-end (jamais les `*.example`), et `doc-kit doctor` signale un fichier de `masking.env` qui n'existe pas.

## Valeurs connues pour être publiques

`doc-kit check secrets` signale les valeurs masquées qu'il trouve dans le texte de la documentation. Certaines sont
publiques par nature : la clé navigateur d'un service de cartes, publiée par son fournisseur ; un identifiant public.
Listez-les dans `masking.allow` :

```js
masking: {
  env: ["../../.env"],
  allow: ["^pk\\.acme-public-maps$", "^https://tiles\\.example\\.org/"],
},
```

- Chaque entrée est une expression régulière JavaScript, sensible à la casse, cherchée dans la valeur : ancrez-la
  (`^…$`) pour autoriser une valeur exacte.
- `allow` ne fait taire que `check secrets` : les captures restent masquées.
- Une expression invalide arrête le contrôle avec le code de sortie 2 et son chemin : `masking.allow[0]`.

Sans aucune configuration, le contrôle ne signale jamais :

- `0.0.0.0`, `::`, les adresses de bouclage et privées (`127.0.0.1`, `10.…`, `172.16.…` à `172.31.…`, `192.168.…`,
  `169.254.…`), seules, avec un port, ou comme hôte d'une URL sans identifiants ;
- une valeur à l'intérieur d'un modèle d'URL, une URL à variables `{…}` : `https://tiles.example.org/{z}/{x}/{y}.png?key=…` ;
- une valeur qui correspond à `masking.exclude`.

Les GUID restent signalés : seul leur propriétaire sait si l'un d'eux est public. Autorisez-le par sa valeur une fois la
décision prise.

## Les masques dans un plan

```js
{
  id: "admin-users",
  route: "/admin/users",
  masks: [{ css: "td.email" }, { text: "Last sign-in", up: 1 }],
}
```

Chaque correspondance d'une cible de masque est remplacée, sauf si la cible en désigne une avec `nth` ou `last`. Un
champ reçoit des points comme valeur ; tout autre élément reçoit des points comme texte.

## Pièges et écarts constatés

> [!ATTENTION] Le masquage ne connaît que ce que vous lui dites
> Une valeur propre à la production (l'adresse d'une passerelle, un nom d'index, une clé affichée en partie) n'est
> pas dans le `.env` local : elle n'est pas masquée. **Relisez chaque image** avant de la garder.

> [!NOTE] Le masquage a lieu avant la mesure
> Les points sont plus courts ou plus longs que la valeur : une zone autour d'un texte masqué est mesurée sur la page
> masquée, les pastilles restent donc justes.

> [!NOTE] Du texte dans les images
> Une valeur dessinée dans une image ou un canevas (un graphique, une tuile de carte) ne peut pas être remplacée :
> cadrez la capture pour la laisser hors champ, ou couvrez-la avec une cible `masks` sur son conteneur.

## Pour aller plus loin

- [Clés de capture et de masquage](#/reference/configuration/capture) : `masking.*` avec types et valeurs par défaut.
- [Les contrôles](#/publish/checks~secrets) : le contrôle des secrets, qui applique les mêmes règles.
- [Démo ou production](#/capture/safety) : des données réelles ou une démo préparée.
