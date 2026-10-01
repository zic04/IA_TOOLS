## Les plans et la démo

| Clé | Type · défaut | Rôle | Exemple |
|---|---|---|---|
| `capture` | objet · `{}` | Tout ce qui concerne les captures | |
| `capture.plans` | chemin · `"captures/plans"` | Dossier des plans de capture ; `--plans` et `<PREFIXE>_PLANS` l'emportent sur lui | `"captures/plans-prod"` |
| `capture.setup` | chemin ou `null` · `null` | Script idempotent qui prépare les données de démo, lancé par `doc-kit demo` | `"captures/setup-demo.mjs"` |

## Le navigateur

| Clé | Type · défaut | Rôle | Exemple |
|---|---|---|---|
| `capture.locale` | texte ou `null` · déduite de `language` | Locale du navigateur : dates, nombres, `Accept-Language` | `"fr-CA"` |
| `capture.timezone` | texte · `"UTC"` | Fuseau horaire du navigateur | `"Europe/Paris"` |
| `capture.viewports` | objet · `desktop` 1600 × 1000, `mobile` 390 × 844 | Tailles de fenêtre nommées ; une entrée en choisit une avec `context` | `{ desktop: { width: 1440, height: 900 } }` |
| `capture.webpQuality` | nombre de 0 à 1 · `0.82` | Qualité de l'encodage WebP | `0.9` |
| `capture.geolocation` | `{ latitude, longitude }` ou `null` · `null` | Position donnée aux pages, avec l'autorisation | `{ latitude: 48.85, longitude: 2.35 }` |

- Chaque fenêtre est `{ width, height }`, l'une et l'autre d'au moins 200. Le contexte `mobile` émule aussi un écran
  tactile.
- Les captures sont prises avec un facteur d'échelle de 1, dans le thème de couleurs clair.

## Ce qui est posé avant chaque page

| Clé | Type · défaut | Rôle | Exemple |
|---|---|---|---|
| `capture.storage` | objet de textes · `{}` | Clés de `localStorage` posées avant chaque capture ; `{version}` est remplacé par la version documentée | `{ theme: "light", tour: "done-{version}" }` |
| `capture.cookies` | liste · `[]` | Cookies posés avant chaque capture : `name`, `value`, et tout autre champ de cookie de Playwright | `[{ name: "NEXT_LOCALE", value: "fr" }]` |

Un cookie sans `url` ni `domain` est posé pour `app.url`. Le `storage` propre à une entrée s'applique par-dessus
`capture.storage`, lui-même appliqué par-dessus le stockage local de la session.

## Cibles et cartes

| Clé | Type · défaut | Rôle | Exemple |
|---|---|---|---|
| `capture.selectors` | objet · `{}` | Sélecteurs CSS des conteneurs de l'application | |
| `capture.selectors.block` | sélecteur CSS ou `null` · `null` | Conteneurs trouvés par la cible `{ block: "…" }` | `"section.card"` |
| `capture.selectors.frame` | sélecteur CSS ou `null` · `null` | Cadres trouvés par l'option `framed` ; `null` : tout élément bordé sur ses quatre côtés | `".panel"` |
| `capture.map` | `{ x, y, z }` ou `null` · `null` | Noms des paramètres d'URL qui cadrent une carte, remplis à partir du `view` d'une entrée | `{ x: "mx", y: "my", z: "mz" }` |

## Sécurité

| Clé | Type · défaut | Rôle | Exemple |
|---|---|---|---|
| `capture.forbidden` | liste d'expressions régulières · `[]` | Chemins de routes jamais ouverts : une entrée est refusée, une requête est annulée | `["^/orders/[^/]+/approval$"]` |
| `capture.readOnly` | `"auto"`, `true` ou `false` · `"auto"` | Annule toute requête autre que `GET`, `HEAD`, `OPTIONS` ; `"auto"` : dès qu'une session est utilisée | `true` |

Voir [Démo ou production](#/capture/safety) pour comprendre pourquoi les deux existent.

## Masquage

| Clé | Type · défaut | Rôle | Exemple |
|---|---|---|---|
| `masking` | objet · `{}` | Valeurs remplacées par des points dans les captures, et recherchées par `check secrets` | |
| `masking.env` | liste de chemins · `[]` | Les fichiers `.env` locaux de l'application | `["../../.env"]` |
| `masking.exclude` | expression régulière ou `null` · `"localhost\|127\\.0\\.0\\.1"` | Valeurs jamais masquées | `"localhost\|example\\.org"` |
| `masking.guid` | booléen · `true` | Masque les GUID | `false` |
| `masking.patterns` | liste d'expressions régulières · `[]` | D'autres valeurs à masquer | `["ACME-\\d{6}"]` |
| `masking.allow` | liste d'expressions régulières · `[]` | Valeurs connues pour être publiques : jamais signalées par `check secrets` (toujours masquées dans les captures) | `["^pk\\.acme-public-maps$"]` |

Voir [Le masquage](#/capture/masking) pour les clés d'un fichier `.env` considérées comme sensibles.

## Pour aller plus loin

- [Les plans de capture](#/capture/plans) : les entrées qui utilisent ces réglages.
- [Clés du projet, de la version et de la connexion](#/reference/configuration/project) : `app.url` et `auth`.
- [Clés de couverture, de thème et de textes](#/reference/configuration/site).
