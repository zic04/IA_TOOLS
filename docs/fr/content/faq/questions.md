## En bref

Des réponses courtes aux questions que l'on se pose avant et pendant son premier site. Chaque réponse renvoie à la
page qui en dit plus.

| Thème | Questions |
|---|---|
| [Le site](#/faq/questions~le-site) | Ce qu'il faut aux lecteurs, poids, hébergement, impression |
| [L'application](#/faq/questions~l-application) | Quelles applications, connexion, sites publics, versions |
| [Rédiger](#/faq/questions~rediger) | Langues, HTML, schémas, apparence |
| [Espaces, reprise et agents](#/faq/questions~espaces-reprise-et-agents) | Métier contre reprise, usage d'un LLM, coût en jetons, rester à jour |
| [Le kit](#/faq/questions~le-kit) | Réseau, données, licence, nom |

## Le site

### Que faut-il à un lecteur ?

Un navigateur récent. Le site est un seul fichier HTML qui contient tout : il s'ouvre depuis un disque, un partage de
fichiers, une bibliothèque de documents ou une pièce jointe, sans serveur et sans accès au réseau.

### Quel est son poids ?

Cela dépend des captures : environ 18 Mo pour 200 images, 35 Mo pour 400. Cadrez les captures sur leur panneau, et
lancez `doc-kit optimize` avant le dernier build. Au-delà d'environ 10 Mo, partagez un lien plutôt qu'une pièce
jointe.

### Peut-on l'héberger ?

Oui, sur n'importe quel hébergement statique ou espace documentaire : c'est un seul fichier. Ses adresses
(`#/utiliser/commandes~l-ecran`) fonctionnent de la même façon en ligne et hors ligne.

### Peut-on l'imprimer ?

Oui : **Imprimer** imprime la page courante, ou toute la documentation avec son plan, prête à être enregistrée en PDF.

## L'application

### Quelles applications peut-on documenter ?

Toute application web que Chromium peut ouvrir : rendue par le serveur ou dans le navigateur, derrière une connexion
ou publique. Les applications Next.js (App Router) et React Router disposent d'un adaptateur de couverture prêt à
l'emploi ; pour les autres, l'adaptateur `glob`, ou un adaptateur propre au projet, liste ce qui doit être documenté
([Les adaptateurs](#/reference/adapters)).

### Cela fonctionne-t-il avec l'authentification unique et l'authentification multifacteur ?

Oui : `doc-kit connect` ouvre une vraie fenêtre de navigateur, et vous vous connectez comme d'habitude. Le kit ne
garde que la session qui en résulte ([Connexion et sessions](#/capture/sessions)).

### Et un site web public ?

`auth: { adapter: "none" }` : pas de session, pas de `connect`. La lecture seule reste désactivée, sauf si
`capture.readOnly` vaut `true`.

### Comment suivre les versions ?

Le site affiche la version lue dans `version.file`. Chaque capture enregistre la version sur laquelle elle a été
prise ; `doc-kit check images` et `doc-kit audit` listent les captures d'une version plus ancienne, à refaire par
motif : `doc-kit capture "utiliser-commandes-*"`.

## Rédiger

### Quelles langues ?

L'anglais et le français : le site, les gabarits, les messages et le standard. Chaque projet en choisit une ; une
documentation bilingue, ce sont deux projets, comme ce site (`docs/en` et `docs/fr`). Chaque commande parle la langue
du projet dans lequel elle s'exécute ; `--lang` la change le temps d'une exécution.

### Puis-je écrire du HTML dans les pages ?

Le moteur Markdown laisse passer le HTML, et le build ne le nettoie pas : tenez-vous-en aux extensions, que les
contrôles comprennent, et ne mettez jamais de script dans une page.

### Puis-je utiliser un autre outil de schémas ?

Tout outil qui produit du SVG, à condition que le résultat utilise les classes `d-*` du site au lieu de couleurs,
pour suivre les thèmes ([Les schémas](#/write/diagrams)). Les images de schémas ne sont pas prises en charge.

### Le site peut-il ressembler à notre produit ?

Les couleurs, le logo, les icônes et chaque texte : oui ([Thème, couleurs et logo](#/reference/theme),
[Langues et textes](#/reference/i18n)). La mise en page du site est celle du kit, la même pour chaque projet : les
lecteurs s'y retrouvent d'une documentation à l'autre.

## Espaces, reprise et agents

### Puis-je diffuser seulement les pages métier, ou seulement le dossier de reprise ?

Oui : déclarez `spaces` dans `content/toc.json`, puis lancez `doc-kit build` — il écrit le site complet plus un
export par espace, chacun avec le contenu des autres espaces physiquement retiré, pas seulement caché
([Deux espaces, une seule source](#/spaces/overview)).

### Le kit utilise-t-il un LLM pour trouver les risques ou écrire les constats ?

Non. Le kit ne fait appel à aucun LLM, où que ce soit : `doc-kit facts` lit le code de l'application avec des
analyseurs ordinaires, et les puces d'affirmation et le registre des risques sont écrits par une personne ou un
agent, jamais générés automatiquement ([Reprendre une application vibe-codée](#/spaces/takeover)).

### Combien coûte, en jetons, l'exécution du skill ?

Cela dépend de ce qu'un agent lit, pas de la taille du kit : `doc-kit context` limite cela aux dépendances propres
d'une page (de quelques centaines à quelques milliers de jetons) au lieu de tout l'inventaire du code (environ
15 000) ([Coût et vitesse](#/skill/cost-and-speed)).

### Comment savoir si la documentation est encore exacte après une version ?

`doc-kit sync` compare les dépendances enregistrées de chaque page marquée avec l'application maintenant, ou avec
un commit git, et liste exactement ce qu'il faut relire — rien de mécanique n'est laissé à une personne
([Suivre l'évolution de l'application](#/publish/sync)).

## Le kit

### Le kit a-t-il besoin d'internet ?

Seulement pour l'installer (npm et le téléchargement de Chromium). Ensuite, il ne parle qu'à l'application que vous
capturez : aucune télémétrie, aucune police ni aucun script chargé depuis le réseau, ni dans le kit ni dans le site.

### Où sont mes données ?

Dans votre projet de documentation : les pages, les images, la session dans `.doc-kit/`. Le kit ne garde rien
ailleurs, sauf le skill Claude Code si vous l'installez.

### Sous quelle licence ?

MIT : utilisez-le, modifiez-le, distribuez-le, dans n'importe quelle entreprise, avec la mention de licence.

### Pourquoi s'appelle-t-il doc-kit ?

Le nom est provisoire. Il est défini à un seul endroit, `engine/brand.mjs` (et `package.json`), pour pouvoir changer
sans toucher au reste du code.

## Pour aller plus loin

- [Diagnostic par symptôme](#/faq/troubleshooting) : quand quelque chose ne va pas.
- [Les cinq premières minutes](#/start/first-five-minutes) : essayez sur l'application de démo.
