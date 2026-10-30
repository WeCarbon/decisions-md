## decs : les tâches et décisions de ce projet vivent dans decisions/ (MUST FOLLOW)

Le responsable ne demande pas en chat le statut, l'avancement ou la
suite — tout est dans `decs bench`. Hors decs, invisible. Détails :
`decs --help`, ou le skill decs.

- **Nœuds** : tâche et décision sont la même chose. `--task` pour ce que
  vous savez faire seul ; `-o` si le responsable doit répondre avant de
  continuer. Pas de `decisions/` ? `decs init`.
- **Seul decs écrit dans `decisions/`** : add / note / ask / attach /
  start / done / close / retitle / move … — jamais un éditeur, `sed`,
  une redirection, ni fichier déplacé, front matter modifié ou `.ids/`
  supprimé à la main. Commande insuffisante ? Notez un nœud disant ce
  qui manque, sans contourner.
- **Ouvrez un nœud avant de commencer** : `decs add --task "<titre, ≤16
  car.>" --author "<agent> · <ce qu'il fait>"`, `decs start <id>`,
  `export DECS_NODE=<id>`. Le nœud d'une voie va sous celui de son agent
  principal (`--parent`).
- **Les plans sont des nœuds enfants** : étapes pas encore faites →
  nœuds enfants (`--parent`), ordonnés par `--after`, estimés par
  `--est 30m`. Un imprévu devient un nœud enfant, pas une mention au
  chat.
- **La progression avance seule** : connectez les longues commandes à
  `decs progress` (`pytest … | decs progress --parse pytest`) ;
  plusieurs étapes → `decs steps` / `decs step`. Pas de mise à jour
  depuis 30 min = bloqué.
- **En attente côté extérieur** : `decs hold <id> --on "<qui/quoi>"`
  (statut « en attente », pas bloqué) ; `decs start <id>` une fois
  réglé.
- **Décision requise** : `decs ask <id> -o …` sur le nœud courant, ou un
  nœud enfant à options ; la réponse arrive via decs monitor (plus bas).
- **Pour conclure** : `decs done <id> --note "<résultat>"` ; sinon →
  `decs close <id> --reason obsolete|superseded|merged-into:<id>`.
  `decs read` récupère la réponse ; `done` seulement une fois la
  question réglée.
- **Contenu qui sort** : `decs attach <id> brouillon --approval-content
  --approve-on <option>` avant d'envoyer ; `decs approved <id> --check
  brouillon` doit réussir d'abord. Jamais `--human` pour approuver à sa
  place.
- **Sources externes** : l'agent principal enregistre un suivi de
  tickets, une boîte mail ou un formulaire avec `decs source register` ;
  le script ne synchronise qu'identifiants et titres. Nouveautés via
  decs monitor ; `decs source ack` une fois traitées.
- **Reporter** : le responsable peut reporter un nœud (`d` au bench, ou
  `decs defer`) — il quitte disponible/actif/à décider sans changer
  d'état ; voir 「owner 延迟」signifie s'arrêter jusqu'à sa reprise.
- **Relayez les réponses du chat** : avant de répondre, enregistrez ce
  que le responsable a dit d'un nœud (W305, X4, ou un repéré) :
  `decs note <id> --human --by "owner (dit dans le chat, relayé par
  <vous>)" "<ses mots>"` (captures via `decs attach`), puis
  `decs read <id>` ; notez ce que vous avez fait avec `--agent` une fois
  traité. Un nœud où il a répondu est à vous ; `decs ask <id>` pour le
  remettre devant lui.

## Être notifié : decs monitor (MUST FOLLOW)

- **La session principale n'arme rien** : le plugin démarre
  `decs monitor --here` à chaque session (projet courant, toute la
  session, n'expire jamais). Chaque ligne, une chose à traiter :
  réponse → `decs read` ; `DECS-UNCLAIMED` → réponse non prise, à
  prendre ; élément externe → traitez, puis `decs source ack` ;
  `DECS-ERROR` → regardez, le monitor continue.
- **`DECS-IDLE`** : après 2 heures de calme, le monitor s'arrête seul.
  Besoin d'attendre une réponse ensuite ?
  `Monitor({ command: "decs monitor", description: "decs", timeout_ms:
  1800000 })`, réarmé à l'identique à l'expiration (il se souvient d'où
  il s'est arrêté).
- **Sous-agents et teammates ne traitent que leurs propres nœuds, toujours
  avec `--mine`** : armez `Monitor({ command: "decs monitor --mine",
  description: "decs", timeout_ms: 1800000 })` au démarrage et réarmez-le à
  l’identique à l’expiration. Dans une session teammate, le monitor lancé
  par le plugin reconnaît le teammate et ne signale que ses nœuds. Un nœud
  qui n’est pas le vôtre revient au lead : n’y touchez pas.
- L'agent principal n'ajoute jamais `--mine` (le nœud d'un sous-agent
  est signé de son nom — l'ajouter fait manquer la notification).
- Pas de `decs wait` en arrière-plan, pas de script de sondage maison,
  pas de `decs watch` (pour les humains).
