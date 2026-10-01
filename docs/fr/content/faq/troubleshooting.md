## En bref

Partez de ce que vous voyez : un message, une page absente, une capture qui échoue. Cette partie vous mène en une
minute à la cause, à la vérification qui la confirme, à la correction, et à la page qui explique le mécanisme. Chaque
message du kit a la même forme : `✖` ce qui ne va pas, puis `→` ce qu'il faut faire. Lisez d'abord la ligne `→` :
elle contient souvent toute la réponse.

> [!MECANISME] Trois réflexes avant de chercher plus loin
> - **Lancez `doc-kit doctor`.** Il vérifie Node, le kit, Chromium, les dépendances du projet, la configuration, la
>   session et `.gitignore`, et affiche la correction de chaque problème.
> - **Construisez en mode brouillon.** `doc-kit build --draft` liste d'un coup tous les problèmes du contenu, sans
>   s'arrêter au premier ; `doc-kit dev` les affiche par-dessus la page à chaque enregistrement.
> - **Regardez le code de sortie.** 1 : un contrôle de votre contenu a échoué ; 2 : une erreur d'usage ou de
>   configuration ; 3 : l'environnement (version du kit, navigateur, application, session).

## Le schéma

::schema{id="troubleshooting" titre="Par où commencer : le code de sortie dit à quelle famille appartient le problème, et chaque famille a sa première vérification et sa sous-page."}

## Avant tout : les vérifications qui expliquent la moitié des symptômes

| Vérification | Où regarder | Ce qui piège |
|---|---|---|
| Êtes-vous dans le bon dossier ? | La première ligne de `doc-kit doctor` nomme le projet | La ligne de commande cherche `doc.config.mjs` en remontant : un projet parent peut répondre |
| Les dépendances du projet sont-elles installées ? | `doctor` : « dépendances du projet installées » | `doc-kit` fonctionne en global, mais la configuration importe `doc-kit/config` depuis le projet |
| Le kit est-il accepté par le projet ? | `doctor` : « kit … accepté par le projet » | Chaque commande s'arrête avec le code de sortie 3 quand la plage refuse le kit |
| Chromium est-il installé ? | `doctor` : « Chromium pour Playwright » | `build` fonctionne sans lui ; `capture`, `view` et `check tables` non |
| La session est-elle toujours valide ? | `doctor` : l'âge de la session | Un fichier de session peut exister et être expiré |
| L'application tourne-t-elle, à `app.url` ? | `doc-kit doctor --network` | `<PREFIXE>_URL` ou `DOC_KIT_URL` peut pointer ailleurs |
| Le build strict a-t-il échoué ? | La dernière ligne : « N erreurs — site NON généré. » | Le fichier précédent de `dist/` est toujours là, inchangé |

## Où regarder

### Les commandes qui renseignent

| Commande | Ce qu'elle dit |
|---|---|
| `doc-kit doctor` | L'environnement et le projet, avec une correction par problème |
| `doc-kit build --draft` | Chaque problème du contenu, sous forme d'avertissements |
| `doc-kit check all` | Couverture, liens, tableaux, images, secrets |
| `doc-kit audit` | Ce qui sépare le site du niveau de maturité suivant |
| `--verbose` | La correction de chaque avertissement ; la pile d'appels d'une erreur interne |
| `--json` | Le résultat complet, pour un script ou un ticket |

### Le dossier de travail

| Fichier | Ce qu'il contient |
|---|---|
| `.doc-kit/<id>.zones.png` | Les zones d'une capture, dessinées en rouge (`capture --preview`) |
| `.doc-kit/audit.md`, `audit.json` | Le dernier audit |
| `.doc-kit/page.png` | Le dernier `doc-kit view` |
| `.doc-kit/session.json` | La session : ne l'ouvrez jamais sur un écran partagé, ne l'envoyez jamais |

### Les textes des messages

Chaque message est un texte du kit (`cli.*` dans `i18n/en.json` et `i18n/fr.json`) : y chercher le message exact
mène au code qui le produit.

## Dans cette partie

| Sous-page | Symptômes traités |
|---|---|
| [1. Problèmes de build et de rédaction](#/faq/troubleshooting/build) | Le site n'est pas généré, un lien, une ancre, une légende, une section, une clé de configuration, une page qui ne peut pas être créée |
| [2. Problèmes de capture et de session](#/faq/troubleshooting/capture) | Pas de session, une session expirée, l'application injoignable, une zone ou une action introuvable, une route interdite, un navigateur absent |

## Pour aller plus loin

- [Questions fréquentes](#/faq/questions) : avant que quelque chose n'aille mal.
- [La ligne de commande](#/reference/cli) : les codes de sortie, commande par commande.
- [La configuration](#/reference/configuration) : les clés et leur validation.
