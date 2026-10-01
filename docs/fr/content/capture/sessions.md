## En bref

La plupart des applications demandent une connexion. `doc-kit connect` ouvre l'application dans une fenêtre Chromium
**visible**, **vous** vous connectez (l'authentification unique et l'authentification multifacteur fonctionnent :
c'est un vrai navigateur), et le kit enregistre la session. Chaque `doc-kit capture` suivant la réutilise, sans
interface, jusqu'à son expiration.

1. **La session est un fichier** : `.doc-kit/session.json`, un état de stockage Playwright (cookies et stockage
   local).
2. **C'est un secret** : tant qu'elle est valide, elle donne accès à l'application avec vos droits.
3. **Elle ne quitte jamais le dossier de travail** : `.doc-kit/` reçoit son propre `.gitignore` qui ignore tout, et
   `doc-kit check secrets` signale un fichier de session trouvé n'importe où ailleurs ou suivi par git.
4. **Supprimez-la quand vous avez fini** : `doc-kit connect --forget`.

## Se connecter avec `connect`

```bash
doc-kit connect
```

:::etapes
1. Le kit ouvre l'application sur `auth.start` (`/` par défaut) :
   `Une fenêtre Chromium est ouverte sur http://127.0.0.1:4173 : connectez-vous (SSO et MFA fonctionnent).`
2. Connectez-vous comme d'habitude, dans cette fenêtre. Sur l'application de démo, n'importe quels e-mail et mot de
   passe sont acceptés.
3. De retour dans le terminal, appuyez sur Entrée (avec l'adaptateur `manual`). Les adaptateurs `nextauth` et
   `api-me` détectent la connexion d'eux-mêmes.
4. Le kit demande à l'adaptateur si un onglet de la fenêtre est connecté, puis enregistre la session :
   `✔ Session enregistrée : .doc-kit/session.json`.
:::

Si vous appuyez sur Entrée trop tôt, le kit répond `pas encore connecté (toujours sur une page de connexion)` et
attend de nouveau. Il abandonne au bout de 15 minutes, ou quand la fenêtre est fermée.

| Option | Effet |
|---|---|
| `--url <url>` | Ouvre une autre adresse que `app.url` (un autre environnement) |
| `--forget` | Supprime le fichier de session et s'arrête |

## Quand une page est une page de connexion

Une page est considérée comme une **page de connexion** quand elle quitte l'origine de l'application (un fournisseur
d'identité), ou quand son chemin et ses paramètres correspondent à `auth.loginPattern` (par défaut
`login|signin|sign-in|oauth|authorize`, sans tenir compte de la casse). Une réponse 401 compte aussi comme une
déconnexion. Cette règle sert à `connect`, à la vérification de la session avant une capture, et pendant la capture
elle-même.

## Expiration

| Moment | Ce qui se passe | Code de sortie |
|---|---|---|
| Avant la première capture | Le kit ouvre `auth.start` avec la session ; une page de connexion signifie qu'elle a expiré : `la session a expiré (page de connexion : …)` | 3 |
| Pendant la campagne | Une capture tombe sur une page de connexion : la campagne s'arrête, les captures déjà prises sont gardées | 3 |
| `doc-kit doctor` | Signale l'âge de la session : ⚠ au-delà de 24 heures, et ⚠ expirée quand tous les cookies qui ont une date d'expiration sont périmés | — |

Reconnectez-vous avec `doc-kit connect`, puis capturez les ids restants. Ne contournez jamais une expiration.

## Où se trouve la session

| Réglage | Effet |
|---|---|
| par défaut | `.doc-kit/session.json` dans le projet de documentation |
| `<PREFIXE>_SESSION` ou `DOC_KIT_SESSION` | Un autre fichier, relatif au projet : une session par environnement |
| `auth.adapter: "none"` | Aucune session : `connect` n'a rien à faire, `capture` n'en charge jamais |
| `doc-kit capture --no-session` | Une campagne sans la session (pages publiques) |

## Les adaptateurs d'authentification

| Adaptateur | Session reconnue quand | `connect` |
|---|---|---|
| `manual` (par défaut) | L'application n'envoie pas le navigateur vers une page de connexion | Vous appuyez sur Entrée |
| `none` | Toujours (application publique) | Rien à faire |
| `nextauth` | `GET /api/auth/session` (option `endpoint`) répond un utilisateur | Détecte seul |
| `api-me` | `GET /api/me` (option `url`) répond du JSON avec le champ `proof` (`id` par défaut) | Détecte seul |

Chaque adaptateur accepte aussi `start`, `loginPattern` et `browser` (`chromium`, ou `chrome` pour le Google Chrome
installé, utile derrière un contrôle anti-robot). Voir [Les adaptateurs](#/reference/adapters) pour écrire le vôtre.

## Pièges et écarts constatés

> [!ATTENTION] Jamais un compte partagé
> Connectez-vous avec un compte qui est le vôtre, avec les droits nécessaires pour voir les écrans. La session donne
> ces droits à quiconque détient le fichier : ne le copiez, ne l'affichez, ne le joignez à un ticket et ne le
> transmettez jamais.

> [!NOTE] Pas de terminal, pas d'Entrée
> Dans un tube ou une tâche de CI, `connect` avec l'adaptateur `manual` s'arrête : « pas de terminal où appuyer sur
> Entrée ». Utilisez un adaptateur qui détecte la session, ou connectez-vous depuis un terminal. De toute façon, les
> captures n'ont pas leur place en CI.

> [!NOTE] Contrôles anti-robot
> Une page intermédiaire « Just a moment… » est attendue jusqu'à 20 s. Si elle ne se lève jamais, mettez l'option
> `browser` de l'adaptateur à `chrome`, reconnectez-vous, et capturez avec le même navigateur.

## Pour aller plus loin

- [Démo ou production](#/capture/safety) : la lecture seule qui accompagne une session.
- [Les cinq premières minutes](#/start/first-five-minutes) : `connect` sur l'application de démo.
- [Problèmes de capture et de session](#/faq/troubleshooting/capture) : les messages et leur correction.
