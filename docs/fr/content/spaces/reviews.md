## En bref

Deux revues, à la demande, écrites de la même façon que le reste de l'espace de reprise : des faits déterministes
d'abord, aucune supposition, puis un agent rédige la page à partir d'eux.

1. **`security-review`** : authentification, contrôle d'accès, traitement des entrées, secrets et configuration,
   constats rattachés à l'OWASP Top 10 — construite à partir des faits `api` et `security`, complétée par une
   vérification en lecture seule d'une instance en cours d'exécution (`doc-kit probe`).
2. **`maintainability-review`** : notes (A à E) pour la duplication, la complexité, la taille et les tests, les
   points chauds qui les combinent, et des recommandations classées par effort — construite à partir des seuls
   faits `quality`, aucune sonde impliquée.

Les deux sont optionnelles : demandez-les au cadrage, comme n'importe quelle autre page de reprise.

## Les faits derrière une revue de sécurité

```bash
doc-kit facts --source api --source security
```

- `api` rapporte maintenant aussi `auth` et `guards` pour chaque route : `"none"` (aucune garde trouvée),
  `"user"` (une garde qui ressemble à un contrôle de session), `"role"` (une garde qui ressemble à un contrôle de
  rôle ou de permission, vérifiée en premier), ou `"unknown"` (une garde est présente, mais ne correspond à
  aucun des deux motifs — à regarder de plus près). `review.guards.role` et `review.guards.user`
  ([Configuration](#/reference/configuration)) remplacent les motifs intégrés quand le nommage propre à un
  projet ne leur correspond pas.
- `security` lance onze heuristiques déterministes sur les fichiers de l'application — jamais une valeur,
  seulement où un motif a été trouvé : `rule`, `file`, `line`, `severity`, `owasp`. `xss.dangerouslySetInnerHTML`,
  `code.eval`, `sql.concat`, `tls.disabled`, `cors.wildcardCredentials`, `debug.enabled`, `jwt.noVerify`,
  `secret.default`, `redirect.open`, et l'heuristique `auth.noRateLimit` (sévérité `info`) : une route de
  connexion sans décorateur ni middleware de limitation de débit à proximité.
  `::facts{source="api" columns="method,route,auth,guards,file"}` est la matrice d'accès statique ;
  [Exemple · Revue de sécurité](#/examples/security-review) la montre complétée à la main.

## Les faits derrière une revue de maintenabilité

```bash
doc-kit facts --source quality
```

Les fonctions, leur longueur et une complexité approchée (1 + les branches), les lignes dupliquées (fenêtres de 6
lignes, hachées, trouvées deux fois ou plus), et les TODO, par fichier ; un résumé pour tout le projet avec les
quatre notes et l'outillage trouvé (linter, types, formateur, CI). [Exemple · Revue de
maintenabilité](#/examples/maintainability-review) montre une fonction qui est à la fois la plus complexe du
projet et le sujet d'un constat de contrôle d'accès — l'histoire habituelle : la complexité et le risque ont
tendance à tomber au même endroit.

## Vérifier une instance en cours d'exécution : `doc-kit probe`

```bash
doc-kit probe                 # l'anonyme seulement
doc-kit probe --as manager    # aussi en tant que rôle enregistré
```

`probe` est un GET vérifié pour la sécurité : en-têtes de sécurité, cookies et CORS sur `/` et sur une route API,
puis chaque route `GET` de `facts/api.json`, une fois par identité (l'anonyme, plus une par `--as <rôle>`, dont la
session a été enregistrée par [`connect --as <rôle>`](#/capture/sessions)). Comparer l'`auth` d'une route avec ce
qu'elle répond réellement donne deux sortes de constat : `probe.unprotected` (une route `user` ou `role` répond à
un appelant anonyme avec un simple 2xx au lieu d'un 401, 403 ou une redirection vers la connexion) et
`probe.publicData` (une route `none` renvoie à un appelant anonyme une liste d'objets portant un champ `email` —
une heuristique, pas une certitude). Tout est écrit dans `facts/probe.json` ; la commande est informative, code de
sortie 0 quoi qu'elle trouve.

Trois règles ne sont jamais assouplies par aucune option :

- **GET et HEAD seulement.** `probe` n'envoie jamais une requête qui pourrait changer quoi que ce soit.
- **Au plus 4 requêtes par seconde.** Une revue est un coup d'œil rapide, pas un test de charge.
- **Aucun corps de réponse n'est jamais enregistré.** Un corps n'est lu que le temps de décider
  `probe.publicData`, puis jeté ; `facts/probe.json` ne contient jamais ce qu'une route a réellement renvoyé.

## Pourquoi `probe` ne touche jamais la production

`probe` refuse de s'exécuter (code de sortie 2) sauf si l'adresse de l'application est une adresse locale
(`localhost`, `127.x`, `[::1]`) ou si `capture.target` vaut `"demo"` ; `capture.target: "production"` est
toujours refusé, et aucune option ne contourne cette règle. Une revue de sécurité est exactement le moment où
l'on est le plus tenté de pointer un scanner sur l'application réelle — et exactement le moment où une erreur
coûte le plus cher : une sonde de contrôle d'accès qui exerce accidentellement un chemin d'écriture, une
limitation de débit qui déclenche une vraie alerte, un corps de réponse qui contient les données d'un vrai
client. Le kit préfère qu'on la vérifie sur une copie locale ou une démo préparée, comme chaque capture d'écran
([Démo ou production : capturer sans risque](#/capture/safety)) — les sources de faits (`api`, `security`,
`quality`) n'ont pas cette restriction, puisqu'elles ne font jamais que lire des fichiers, jamais le réseau.

## Pièges et écarts constatés

> [!ATTENTION] `auth` concerne l'authentification, pas l'isolation par locataire
> Une route notée `auth: "role"` peut encore divulguer les données d'un autre locataire si elle ne filtre jamais
> sa requête par portée — `probe` ne peut pas le voir non plus, puisqu'il n'a pas de second locataire depuis
> lequel appeler. [Exemple · Revue de sécurité](#/examples/security-review) montre exactement ce cas : une route
> correctement gardée par rôle avec un contrôle de portée manquant en dessous.

> [!NOTE] Les constats d'une revue alimentent le registre des risques
> Un constat écrit sur une page `security-review` ou `maintainability-review` est un candidat pour [le registre
> des risques](#/spaces/takeover~le-registre-des-risques) — déplacez-le là une fois confirmé, plutôt que de le
> suivre à deux endroits.

## Pour aller plus loin

- [Reprendre une application vibe-codée](#/spaces/takeover) : les autres pages de reprise, et `doc-kit facts`.
- [Connexion et sessions](#/capture/sessions) : `connect --as <rôle>`, le fichier de session.
- [Exemple · Revue de sécurité](#/examples/security-review), [Exemple · Revue de
  maintenabilité](#/examples/maintainability-review).
