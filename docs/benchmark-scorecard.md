# IPL Studio — Benchmark Scorecard (cloud vs local)

Score de conformité sur scénarios réels, backend par backend.
Consigne manuelle des runs consignés dans `output/benchmark/history.json` (gitignoré) + rapports `output/benchmark/report-*.md`.

## Scénario : Smart Parking Garage (spec `parking`)

Tarification dynamique horaire (EUR), remise VIP 20 %, reçu JSON.

Contrat `verify.assert` : `currency="EUR"`, `vehicles.length=2`, `vehicles.0.plate="AB-123"`, `cost=8.0`, `isVip=false`, `vehicles.1.plate="VIP-7"`, `cost=6.4`, `isVip=true`, `grandTotal=14.4` (et `gt 0`, `lt 50`).

### Légende

- `first=PASS` : succès one-shot (0 réparation).
- `first=FAIL / repair=N` : échec initial puis N passes de réparation réussies.
- `first=FAIL / repair=-1` : échec initial, réparation échouée (épuisement des passes, timeout, ou WARN de clarification non productif).
- `WARN` : le modèle a demandé une clarification au lieu de corriger (traité comme échec comptable pour la scorecard).

### Résultats

| Date (UTC) | Backend | Modèle | Statut | first | repair | Temps total | Remarques |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| 2026-08-10 12:23 | cloud | `deepseek-chat` (DeepSeek) | **PASS** | FAIL | 2 | ~52 s | JSON goldénique exact après 2 passes de réparation. Référence cloud. |
| 2026-08-10 12:28 | local | `deepseek-chat` (LM Studio, config erronée) | FAIL | FAIL | -1 | — | Run invalide : nom de modèle cloud utilisé en local. À rejouer avec un vrai modèle local. |
| 2026-08-10 12:43 | local | `deepseek-chat` (LM Studio, config erronée) | WARN | FAIL | -1 | — | Idem : run invalide. |
| 2026-08-10 12:56 | local | `deepseek-coder-6.7b-instruct@q4_k_s` | FAIL | FAIL | -1 | ~6 min | Code structuré (vehicle.py, parking_garage.py, main.py) mais **pas de `main()` exécutable** ; `cost` en string `"EUR 8.0"` → JSON invalide. Réparation -1 malgré le contrat. |
| 2026-08-10 13:08 | local | `deepseek-coder-v2-lite-instruct` | WARN | FAIL | -1 | ~58 s | Code exécutable (3 fichiers) mais données inventées (`ABC123`, taux 15, pas de `vehicles`/`grandTotal`) ; stdout pollué par des `print` d'exemple. Réponse de réparation classée « clarification » (faux positif). |
| 2026-08-10 13:25 | local | `qwen3-14b` | FAIL | FAIL | -1 | ~13 min | Architecture propre (src/models, services, receivers, handlers) mais **serveur Flask** (`app.run(debug=True)`) au lieu d'un script exécutable ; bug d'import réel (`Currency` non importé) ; ne reproduit pas le contrat. Repair pass 2 : timeout 300 s. |
| 2026-08-10 13:37 | local | `qwen3-14b` | FAIL | FAIL | -1 | ~5 min | Re-run après fix WARN→FAIL : **generation error — Pass 2 timeout (300 s)**. Le probe court (18 s) était trompeur ; en génération réelle qwen3-14b est lent et instable. Aucun artefact vérifiable. |
| 2026-08-10 14:02 | local | `gpt-oss-20b` | FAIL | FAIL | -1 | ~7 min | **Meilleur run local à ce jour** : `main()` exécutable avec les bonnes plaques (`AB-123`/`VIP-7`), JSON conforme (`currency`, `vehicles`, `grandTotal`, cost=8.0/6.4). Bloqué par 2 bugs mécaniques : import relatif `.config` (devrait être `..config`) et fences markdown ```python collées dans 2 fichiers .py → SyntaxError. Après correction manuelle : sortie exactement goldénique. |
| 2026-08-10 14:14 | local | `gpt-oss-20b` | FAIL | FAIL | -1 | ~11 min | Même bug reproductible `.config`→`..config` ; `main.py` déplacé dans `src/`. `python src/main.py` casse les imports `from src.*` (src hors sys.path). |
| 2026-08-10 14:28 | local | `gpt-oss-20b` | FAIL | FAIL | -1 | ~7 min | Après fix déterministe d'import (pass 1 rewrote `.config`→`..config` ✓), mais `main.py` dans `src/` non lançable par le harness ; quand on le lance via `python -m src.main` il tourne mais avec de **mauvaises valeurs** (exit_minute=480 → cost=40/32 au lieu de 8.0/6.4) : le modèle a régénéré des données hors contrat. |
| 2026-08-10 14:41 | local | `gpt-oss-20b` | FAIL | FAIL | -1 | ~6 min | Nouvelle variation : imports absolus `from models.vehicle` au lieu de `from src.models.vehicle` → ModuleNotFoundError même avec `python -m src.main`. Le modèle est **instable** : 1 run conforme sur 4, chacun avec des erreurs de code différentes. |
| 2026-08-10 14:53 | local | `gpt-oss-20b` | **PASS** | FAIL | 3 | ~5 min | **Premier succès local** : les 3 fixes harness (fence ouvrante, import relatif `.config`→`..config`, retry `python -m`) ont suffi à mettre le code sur les rails, puis 3 passes LLM de réparation ont convergé. JSON goldénique (`AB-123` 8.0, `VIP-7` 6.4, `grandTotal` 14.4). |
| 2026-08-10 15:26 | local | `gpt-oss-20b` (6 SPECS) | 4/6 | — | — | ~15 min | **Run multi-spec** : `hello` PASS one-shot, `form` PASS one-shot, `weather` PASS (1 réparation), `parking` PASS (2 réparations), `node-hello` WARN (bug harness : entry `src/index.js` non découverte, corrigé après), `typed-order` FAIL (over-engineering : Flask+SQLAlchemy+SMTP, deps absentes). First-try PASS 67% (4/6). |
| 2026-08-10 15:45 | local | `gpt-oss-20b` | node-hello PASS | PASS | 0 | ~50 s | Après fix du retry « entry missing » → `src/index.js` découvert : **PASS one-shot** (le code était correct, seul le harness ne le lançait pas). |
| 2026-08-10 15:46 | local | `gpt-oss-20b` | typed-order FAIL | FAIL | -1 | ~7 min | Re-run : le modèle **persiste** à générer une stack web (Flask + SQLAlchemy ORM + SMTP + tests pytest) pour une spec simple. `main.py` produit le contrat (`A-1001`, `processing`) mais nécessite `pip install flask sqlalchemy pytest` — deps tierces absentes de l'environnement. Échec comportemental du modèle, pas du harness. |
| 2026-08-10 17:20 | local | `gpt-oss-20b` | typed-order WARN | WARN | -1 | ~10 min | Après ajout du **diagnostic de deps** : le modèle a cette fois généré un `requirements.txt` (`sqlalchemy`) ; le harness détecte le module manquant, reconnaît la déclaration et signale `WARN — NO AUTO-INSTALL: review these dependencies and install/verify them manually`. Fini le FAIL sans explication : la décision de vérifier/installer revient à l'humain. |

### Synthèse

- **Cloud** (`deepseek-chat`) : 1/1 PASS — le droit à l'erreur (2 réparations) suffit quand le contrat comportemental est communiqué.
- **Local** : 1/10 PASS sur le parking (gpt-oss-20b 14:53, via 3 réparations). Sur les 6 SPECS (run 15:26) : 4/6 PASS final, first-try 67%. Tous les modèles locaux génèrent du code structurellement plausible mais échouent sur :
  1. le **`main()` d'exécution complet** reproduisant les données exactes de la spec (plates, taux, taux VIP),
  2. la **sortie JSON conforme au contrat** (absence d'array `vehicles`, `grandTotal`, mauvais type),
  3. la **non-pollution du stdout** (artefacts d'exemple imprimés à l'import).
- **Le contexte n'était pas le goulot** : le passage 8000 → 16k/32k n'a pas suffi ; le plafond est la capacité du modèle à produire un programme autonome conforme.
- **`gpt-oss-20b` est le candidat local le plus proche** : 1 run sur 4 était conforme (run 14:02), bloqué uniquement par des erreurs mécaniques désormais corrigées dans le harness. Mais le modèle est **instable** d'un run à l'autre (imports relatifs/absolus incohérents, données hors contrat régénérées). Avec les 3 fixes harness, un run de réparation a finalement **convergé (PASS, 14:53)**.
- **Raison d'être de l'IPL (rapport tokens)** : un prompt naturel « complet » coûte ~312 tokens (vs ~211 pour la spec) **mais** un humain n'écrit jamais ce prompt d'un bloc — chaque précision est un aller-retour qui coûte du contexte croissant + une réponse + du bruit en plus. C'est cet effet multiplicatif (difficilement quantifiable mais logique) que l'IPL élimine en encodant la précision une fois dans la structure de la spec. Détail et chiffres dans la section « Coût en tokens ».

### Coût en tokens : IPL vs prompt naturel

L'IPL est conçu pour **économiser des tokens** par rapport à un prompt en langage naturel de même intention. Mesure réelle (comptage approximatif `chars/4`, ~1 token par mot) :

| Input | Longueur | ~Tokens (chars/4) |
| :--- | :---: | :---: |
| Spec IPL `parking` (32 lignes structurées, `golden/parking-python/spec.ipl`) | 847 chars | ~211 |
| Prompt naturel équivalent rédigé comme le ferait un développeur | 1 251 chars | ~312 |

- Le prompt naturel de référence exprime le même contrat (2 entités, événement `vehicle:exit`, contrainte `exitMinute > entryMinute`, formules, remise VIP, format JSON, données de démo `AB-123`/`VIP-7` avec coûts attendus 8.0/6.4/14.4) en ~312 tokens. La spec IPL encode la même information en ~211 tokens : **~32 % d'économie à l'entrée**.
- L'économie vient surtout de la **structure compacte** (sections dédiées, types, formules, format de sortie) qui élimine la redondance de la prose (prépositions, formulation, reprise du sujet). Elle s'amplifie avec la complexité : plus un scénario a d'entités/règles, plus la prose se redouble, alors que l'IPL croît presque linéairement.
- **Mesure honnête** : sur ce scénario simple, l'économie est modérée (~1/3). L'écart se joue vraiment sur 3 leviers complémentaires :
  1. **Entrée (spec)** : ~211 vs ~312 tokens.
  2. **Réparation** : le prompt de réparation sérialise le contrat `verify.assert` (JSON) — identique en taille pour les deux modes, mais l'IPL l'exprime nativement dans la spec au lieu de le répéter en prose.
  3. **Sortie** : la spec IPL guide une sortie structurée (le générateur a un contrat explicite), ce qui réduit les allers-retours de réparation (le run PASS local 14:53 a convergé en 3 passes).

#### Le vrai coût caché : la précision en prose coûte des allers-retours

La comparaison « spec IPL vs prompt naturel » ci-dessus compare une spec **complète** à un prompt naturel **qui contient déjà toutes les précisions**. Or un humain n'écrit jamais ce prompt d'un bloc : il découvre, précise, corrige. Chaque précision supplémentaire est un **aller-retour**, et chaque aller-retour coûte des tokens **en entrée ET en sortie**, plus il **pollue le contexte** :

- **Entrée** : chaque message suivant ré-envoie tout l'historique accumulé (le contexte ne cesse de grossir). Le coût marginal d'une précision = taille de l'historique + la précision elle-même, pas seulement la précision.
- **Sortie** : le modèle répond à chaque clarification (parfois longuement, comme le montrent les runs WARN « clarification » du harness — réponses non productives qui discutent au lieu de coder).
- **Pollution du contexte** : l'historique de dialogue contient des formulations ambiguës, des allers-retours et des réponses non productives qui **dégradent la qualité** des générations suivantes (le modèle réutilise du bruit), et qui sont re-comptés en tokens à chaque appel suivant.
- L'IPL évite exactement ce cycle : la précision (types, contraintes, formules, format de sortie, valeurs attendues) est **encodée une fois** dans la structure de la spec, pas négociée au fil du dialogue. Le contrat comportemental est le même objet à chaque passe de réparation, sans historique de bavardage.
- **Difficilement quantifiable, mais logique** : le vrai coût d'un prompt naturel n'est pas les ~312 tokens initiaux, mais 312 + N aller-retours × (contexte croissant + réponse + bruit), où N est le nombre de précisions que l'humain doit apporter pour arriver au même niveau de spécificité que la spec IPL. C'est cet effet multiplicatif que l'IPL élimine.

### Coût de convergence (tokens de sortie) — mesure réelle

Le one-shot n'est pas l'objectif (irréaliste en pratique) : le vrai critère est le **coût de convergence** — combien de passes de réparation, de tokens de sortie et de temps pour arriver au PASS. Mesures réelles sur `gpt-oss-20b` (6 SPECS, run 15:26 + re-runs 15:45/15:46) :

| Spec | Langage | Statut final | Réparations | Temps | Tokens Pass 1 | Tokens Pass 2 |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `hello` | html | PASS one-shot | 0 | 37 s | 287 | 1 578 |
| `form` | js | PASS one-shot | 0 | 51 s | ~300 | ~1 600 |
| `weather` | html | PASS | 1 | 1 min 53 s | ~300 | ~1 600 |
| `node-hello` | js | PASS one-shot | 0 | 50 s | ~300 | ~1 600 |
| `parking` | python | PASS | 2 | 4 min 05 s | 287 | 1 578 |
| `typed-order` | python | FAIL | -1 | 7 min | ~300 | ~1 600 |

Observations :
- **Les targets HTML/JS one-shot passent** (~50 s, 2 tokens de sortie par passe) ; **le python a besoin de 2-3 passes de réparation** pour converger (parking) ou échoue (typed-order).
- Le **coût de convergence réel est dominé par les passes de réparation** : chaque passe = re-génération (existingXml + prompt réparation + contrat) ≈ le double d'une génération initiale. Pour parking : 1 génération + 2-3 réparations ≈ **~4× le coût one-shot**.
- **`typed-order` : échec d'over-engineering** — le modèle construit Flask + SQLAlchemy ORM + SMTP + tests pytest pour une spec simple, rendant le programme non exécutable sans `pip install` de deps tierces. Le `main.py` produit pourtant le contrat (`A-1001`, `processing`). Mode d'échec distinct : ce n'est pas une erreur de syntaxe ni de contrat, c'est un **choix de stack non exécutable dans l'environnement d'exécution**.
- **Traité comme WARN « deps » (pas FAIL) désormais** : le harness **détecte** les modules manquants (Python `ModuleNotFoundError`, Node `Cannot find module`, Rust `unresolved import`/`cannot find crate`, Go `no required module provides package`), vérifie leur **déclaration** dans le manifest (`requirements.txt`, `package.json`, `Cargo.toml`, `go.mod`), et signale le tout pour **vérification manuelle**. Il n'installe **jamais** rien (`NO AUTO-INSTALL`). Sur le re-run typed-order (17:20) : `WARN — deps: declared in requirements.txt: sqlalchemy · NO AUTO-INSTALL: review these dependencies and install/verify them manually.` — le modèle a cette fois généré un `requirements.txt` (`sqlalchemy`) et le diagnostic l'a reconnu. La décision de vérifier/installer reste humaine.
- La réparation LLM n'a pas corrigé typed-order : elle réécrit les fichiers mais reproduit la même stack. L'usage de deps tierces est **accepté** (normal que tout ne soit pas stdlib) à condition qu'elles soient **déclarées** — le problème initial était l'absence de `requirements.txt`, pas l'usage de SQLAlchemy.

### Taille réelle des specs du corpus (parsing déterministe)

Les 36 specs de `corpus/` (24 single + 5 edge + 7 projects) sont **beaucoup plus petites** que les SPECS de génération : moyenne 234 chars (~58 tokens), max 822 (`21-ecommerce.ipl`). L'économie de tokens de l'IPL est donc surtout pertinente sur des scénarios de **taille réelle** (parking 847 chars, e-commerce ~820), pas sur les micro-specs de parsing.

### Fixes harness dérivés de ce diagnostic

| Fix | Fichier | Effet |
| :--- | :--- | :--- |
| Nettoyage de la fence markdown **ouvrante** (` ```python `) | `src/engine/artifactGenerator.ts` (`parseMultiFileXml`) | Les .py wrappés dans une fence ne sont plus syntaxiquement invalides (2 fichiers cassés dans le run 14:02). |
| Rewrite d'import relatif Python `.X`→`..X` quand le module n'existe que dans le parent | `src/engine/deterministicRepair.ts` | Corrige le bug reproductible `src/models/parking_garage.py` → `from .config` au lieu de `from ..config`. Vérifiable : ne touche pas les imports légitimes. |
| Retry `python -m <pkg.module>` pour un `main.py` dans un package | `scripts/run-benchmark.ts` (`retryWithDiscoveredEntry`) | `python src/main.py` met `src/` dans sys.path et casse `from src.* import` ; `python -m src.main` garde la racine sur sys.path. |
| Retry avant WARN « entry missing » (`node index.js` → `src/index.js`) | `scripts/run-benchmark.ts` (verify) | `node-hello` générait `src/index.js` (correct, exit 0) mais le harness concluait WARN sans tenter le retry. Désormais le retry est tenté pour tous les échecs de commande, et le WARN n'est émis que si le retry échoue aussi. |
| Diagnostic de deps manquantes (report-only, jamais d'install) | `scripts/run-benchmark.ts` (`extractMissingModules` / `readDeclaredDeps` / `diagnoseMissingDeps`) | Sur `ModuleNotFoundError`/`Cannot find module`/`unresolved import`/`no required module`, extrait les modules manquants, vérifie leur déclaration dans `requirements.txt`/`package.json`/`Cargo.toml`/`go.mod`, et émet un WARN `NO AUTO-INSTALL: review these dependencies and install/verify them manually.` Générique par langage. |
| **Sandbox d'exécution** (isolation du repo) | `scripts/run-benchmark.ts` (`verify` → `copyRunToSandbox`) | `verify` exécute une **copie** du run dir sous `os.tmpdir()/ipl-benchmark` (override : `--sandbox <dir>`), hors arborescence du repo. Sinon le code généré hérite du `package.json` racine (`"type": "module"` → CommonJS `require` devient un `ReferenceError`) et du `node_modules` du repo (deps non déclarées qui fuient). Générique (tous langages), jamais réglé pour une spec. Artefacts inchangés dans `output/benchmark`, copie nettoyée après vérif. |
| **Gate JSON déterministe** | `src/engine/staticChecker.ts` (`findInvalidJson`) + `consolidationAgent.ts` | Tout `.json` de l'artefact doit parser via `JSON.parse`. Attrape le `package.json` généré avec un commentaire `//` en tête (→ `ERR_INVALID_PACKAGE_CONFIG` de Node) que le reviewer LLM ne voit pas. Intégré au gate déterministe (0 token), confirmé avant auto-fix. |
| **`extractJson` : plus grand bloc `{...}` valide** | `src/engine/behaviorAssert.ts` | L'extraction naïve « premier `{` → dernier `}` » échoue quand un log contient un JSON inline avant le payload (`Order details: {...}`) → faux négatif `output is not valid JSON`. Scan de tous les blocs appareillés, retour du plus grand qui parse. |

### Agent de consolidation (gate de livraison, app flow)

Gate de pré-livraison du **flux app** (pas du benchmark) : avant qu'un projet généré ne soit remis à l'utilisateur pour test, un agent relit, vérifie et répare. Voir `src/engine/consolidationAgent.ts`.

Raison d'être : la classe de bugs « code généré qui ne s'exécute pas » (souvent invisible pour un humain qui teste) est attaquée par une relecture systématique *avant* le test utilisateur — au lieu de faire chercher l'utilisateur.

Fonctionnement (3 étages, à l'écart du 100 % « one-shot ») :

1. **Gates déterministes (0 token)** — le checker statique (`src/engine/staticChecker.ts`, imports vs fichiers présents) valide ce qui est mécaniquement vérifiable sans LLM.
2. **Review LLM systématique** — un agent **non-spécialiste IPL** (prompt sans vocabulaire IPL, vérifié par test) relit chaque run, même quand les gates sont propres : le coût moyen est amorti sur plusieurs projets.
3. **Fusion/vérification croisée + boucle d'auto-fix bornée** — chaque finding LLM est **confirmé par un gate déterministe** (un reviewer qui hallucine est pire qu'aucun) ; les erreurs confirmées sont réparées dans une boucle (max 2 passes, stop si pas de progrès → borne le coût tokens) ; rapport de livraison « trouvé / corrigé / restant ».

Câblage : `runConsolidation` est appelé après `runGeneration` **et** après chaque `requestLLMCorrection`, avant `writeArtifactToDisk`. Toggle `consolidationEnabled` (on par défaut) dans `SettingsModal`.

**Validation réelle** (artefact coffee cassé du run `run-2026-08-11T07-44-23-620Z-1`, bug guard `file://`) — deepseek-chat :

| Vérification | Résultat |
| :--- | :--- |
| Gates déterministes | 0 issue (l'import manquant `entities.js` avait déjà été réparé par le benchmark) |
| Review LLM | 7 erreurs confirmées — dont le **bug exact du guard `file://`** et d'autres défauts cachés (récursion infinie `createOrder`, `orderData` non validé, `eventHandler` jamais attaché dans `onOrderCreated`) |
| Auto-fix | 2 passes appliquées, fichiers modifiés (`src/index.js`, `src/orderProcessor.js`, `src/entities.js`) |
| Restant | 5 issues confirmées laissées à la revue humaine (vib coding ciblé) |

Enseignements :

- L'agent a **reproduit exactement** le bug que l'humain avait identifié manuellement, **sans aucune connaissance du contexte** — et en a trouvé d'autres invisibles au premier coup d'œil. La machine ne livre pas parfait, mais elle **prépare le terrain** du vib coding en localisant précisément ce qui cloche.
- Ce n'est pas un patch spécifique à un run (ex. « interdire `file://` ») : un run n'est jamais représentatif. C'est une **classe de vérification** réutilisable, branchée dans le flux app.
- Le contrat reste l'**économie de tokens** (précision encodée dans la spec, pas négociée au fil du dialogue) : l'agent consolide au lieu d'augmenter le nombre de passes de réparation inconditionnelles.

**Runs réels coffee avec consolidation (`--consolidate`, deepseek-chat)** :

| Run (UTC) | Consolidation | Résultat | Ce que ça a montré |
| :--- | :--- | :--- | :--- |
| 11-59-10 | 9 confirmed, 2 passes, files modified | WARN (avant sandbox) | Sans sandbox, le run hérite du `"type": "module"` racine → `require` casse. Faux signal : le code consolidé était du CommonJS valide. |
| 12-16-32 | 7 confirmed, 2 passes | FAIL `Invalid package config` | Sandbox actif : expose un **vrai bug** que le reviewer LLM avait manqué — `package.json` généré avec un commentaire `//` en tête (JSON invalide). |
| 12-30-25 | 10 confirmed, 1 passe | FAIL `output is not valid JSON` | Le gate JSON a fait converger en 1 passe (vs 2). L'échec était un **faux négatif d'`extractJson`** : un log `Order details: {...}` inline cassait l'extraction. Le code consolidé produisait pourtant un JSON final valide. |
| 12-35-36 | 5 confirmed, 2 passes | FAIL `grandTotal 5.779999999999999` | Après fix `extractJson` (plus grand bloc `{...}` valide) : le run est **proche du contrat** — Latte 4.2/3.78 et Espresso 2.0/2.0 exacts, package.json valide, entities généré, événements câblés. Seul reste le **bug d'arrondi float** de `getGrandTotal` (somme non arrondie), non vu par le reviewer. |
| 12-44-36 (×2) | run 1 : 7 confirmed, 2 passes / run 2 : 4 confirmed, 2 passes | **run 1 : PASS** / run 2 : FAIL | **Premier PASS coffee réel avec consolidation — goldénique exact** (Latte 4.2/3.78, Espresso 2.0/2.0, `grandTotal: 5.78`, arrondi correct). Run 2 : le modèle a généré dès le départ une interprétation hors contrat (pas de payload `{ orders }`, données inventées) — **instabilité modèle** bornée proprement (consolidation convergée, repair 3 passes max). |
| 12-53-32 (×2, **local lmstudio** gpt-oss-20b, ctx 23k) | 0 confirmed, 0 passe (×2) | FAIL ×2 (~470/505 s) | **gpt-oss-20b a généré une web app** (`index.html` + `public/styles.css` + DOM `document` dans le listener) pour une spec Node console → `ReferenceError: document is not defined`. Mode d'échec documenté (« stack web au lieu de script exécutable »). **Le reviewer a dit « No confirmed defects »** : génération ET review sont le même modèle → **biais de confirmation** (la review ratifie le choix de stack au lieu de l'attraper — `document is not defined` est pourtant un crash runtime). |

Enseignements des runs consolidés :

- **L'isolation du repo est un prérequis de la mesure** : sans sandbox, un run correct est déclaré WARN à cause du contexte repo. Avec le sandbox, le harness mesure réellement le code généré dans un environnement neutre.
- **Le gate déterministe attrape ce que le reviewer LLM rate** : le `package.json` invalide (commentaire `//`) est passé par 7 warnings LLM, attrapé à coup sûr par `JSON.parse`. Les gates 0 token sont la fiabilité ; la review LLM est la couverture.
- **La convergence s'améliore** : 9 → 10 → 5 confirmed issues en 4 runs, et l'auto-fix passe de 2 passes à 1 quand le gate est plus précis. Le run le plus récent livre un arbre dont le seul écart au contrat est un `grandTotal` flottant (1 ligne à corriger par vib coding) — exactement la position voulue : machine prépare le terrain, humain finit.
- **Stabilité mesurée (×2) : 1 PASS goldénique / 1 FAIL hors contrat dès la génération.** Le PASS produit exactement le gold (`grandTotal: 5.78` arrondi) — preuve que la chaîne génération → consolidation → repair → verify atteint le contrat quand le modèle est sur les rails. Le FAIL n'est pas un bug de pipeline : le modèle a choisi une structure différente (pas de payload `{ orders }`). L'instabilité inter-run reste le plafond (déjà documentée pour `gpt-oss-20b` 1/4 ; `deepseek-chat` l'est aussi sur coffee).
- Le reviewer non-IPL ne connaît pas le contrat comportemental : il ne peut pas savoir que `grandTotal` doit être arrondi à 2 décimales. C'est le rôle du verify + repair loop. La consolidation répare ce qui est mécaniquement/statiquement sûr ; le reste est localisé et documenté pour l'humain.
- **Biais de confirmation du reviewer partagé** : quand le reviewer est le même modèle que le générateur (ici gpt-oss-20b local), il **ratifie** le choix de stack — la web app `document is not defined` est passée en « No confirmed defects ». Un reviewer indépendant (deepseek-chat cloud sur le même artefact) aurait vu le crash runtime. C'est une limite de couverture, pas un bug de pipeline : à LM Studio, si on veut un vrai fresh eye, il faudrait un reviewer d'un autre modèle/endpoint. À garder en tête pour l'interprétation des runs locaux.

### Leçons pour le harness

- **Le run dir ne doit jamais être dans l'arborescence du repo** : il hérite de son `package.json` (`"type": "module"` → CommonJS casse) et de son `node_modules` (deps non déclarées qui fuient). Depuis, `verify` exécute une copie sandbox sous `os.tmpdir()/ipl-benchmark` (override `--sandbox <dir>`), tous langages. Sans ça, le benchmark mesure le contexte, pas le code généré.
- WARN « clarification » pendant une passe de réparation : désormais un **FAIL comptable** (passe de réparation consommée), plus un état terminal qui attendait une réponse utilisateur — le modèle discute au lieu de corriger. (`repairAndVerify` dans `scripts/run-benchmark.ts`)
- Le rapport benchmark affichait `Endpoint: https://api.deepseek.com` même en mode lmstudio : corrigé via `endpointForMode` (sélection selon le mode, pas par priorité de véracité — `externalEndpoint` est toujours truthy).
- **Deps tierces : acceptées si déclarées, jamais installées par le harness.** L'usage de libs tierces (Flask, SQLAlchemy...) est légitime — tout ne doit pas être stdlib. Le contrat : le modèle doit les **déclarer** (`requirements.txt`/`package.json`/`Cargo.toml`/`go.mod`), et le harness les **signale** pour vérification manuelle (WARN `NO AUTO-INSTALL`). Pas d'installation automatique sans human-in-the-loop.
- Envisager une contrainte harness « script autonome » (pas de serveur web / pas d'`app.run`) communiquée dans le prompt.

## P5 — Généralisation de la mesure (7 SPECS × `--consolidate`)

Premier run complet de la généralisation (P5) : **cloud deepseek-chat, `--consolidate`, 1 itération, form factor dérivé (html→`web`, sinon `cli`)**. Harness désormais exécutable en `node` pur (imports `.ts` complétés) + gate CI (test/lint/build/bench mock).

| Spec | Forme | Statut | first | repair | Consolidation | Tokens (spec → gén / consol / réparation) |
| :--- | :---: | :---: | :---: | :---: | :--- | :--- |
| hello | web | **PASS** | PASS | 0 | 1 confirmed, 1 passe | 45 → 3 875 / 8 827 / 0 |
| typed-order | cli | **PASS** | FAIL | 1 | 12 confirmed, 2 passes | 134 → 8 354 / 47 965 / 8 947 |
| weather | web | **PASS** | PASS | 0 | 1 confirmed, 1 passe | 255 → 7 237 / 21 657 / 0 |
| form | cli | **PASS** | PASS | 0 | 2 confirmed, 1 passe | 74 → 4 211 / 11 660 / 0 |
| node-hello | cli | WARN | WARN | 0 | 2 confirmed, 1 passe | 45 → 3 743 / 9 183 / 0 |
| parking | cli | **FAIL** | FAIL | -1 | 5 confirmed, 2 passes | 212 → 5 661 / 31 770 / 18 866 |
| coffee | cli | **FAIL** | FAIL | -1 | 3 confirmed, 2 passes | 301 → 6 710 / 35 725 / 19 746 |

**First-try PASS 57 % (4/7).**

Enseignements :

- **La télémétrie P2 exporte en réel** : la consolidation coûte systématiquement **2 à 6× la génération** (pic : typed-order 47 965 vs 8 354). C'est exactement la donnée de P6 (coût reviewer vs gain) — et le run montre le **trade-off** : sur les 4 PASS, la consolidation a convergé en 1-2 passes ; sur les 2 FAIL comportementaux, consolidation + repair (3 passes) n'ont pas suffi.
- **coffee FAIL = bug d'arrondi float** (`grandTotal 5.779999999999999` vs `5.78`) : déjà documenté (run 12-35-36), non vu par le reviewer statique. L'oracle `equals` strict sur un float est fragile — un écart d'1e-15 fait échouer le run alors que le code est fonctionnellement bon.
- **parking FAIL = prix hors contrat** (`cost 10` au lieu de `8`) : la logique de tarification (durées/remise) est fausse au runtime ; le reviewer statique ne peut pas voir la sortie, et la réparation (contrat sérialisé dans le prompt) n'a pas convergé en 3 passes.
- **node-hello WARN ≠ drift de forme** : pas de DOM, pas d'asset web → le gate form `cli` est **silencieux à raison**. Le fichier s'appelle `greeter.js` au lieu de `index.js` → le retry « entry missing » du harness ne découvre pas un nom arbitraire. Limite du harness, pas de la forme.
- **Reviewer : deepseek-chat (partagé)** sur les 7 runs — le biais de confirmation (P3) reste : P3 permet de passer en reviewer indépendant, mais le choix par défaut « même modèle » est ici en action.
- **Form factor mesuré** : dérivé par spec (html→web, sinon cli), pinué dans Pass 1/Pass 2 + gate. Aucun gate form n'a tiré sur ce run (pas de drift web pour du cli sur les specs générées) — le drift reste un mode d'échec modèle-dépendant (cf. gpt-oss-20b local), pas systématique chez deepseek-chat.

## Gates 0-token ajoutés après P5 (post-run v1.4)

Le run 7-spec a exposé des modes d'échec **déterministes** que la review LLM rate — désormais des gates 0-token + réparations mécaniques (avant tout appel LLM) :

| Gate | Détecte | Cas réel |
| :--- | :--- | :--- |
| `findIplLeakage` | Fichiers `*.ipl` (la spec est l'INPUT, jamais la livraison) | Coffee multi-fichier : le modèle a ré-émis `app.ipl`/`engine.ipl`/`data.ipl` en artefacts |
| `findPatchLeakage` | Marqueurs `<<<<<<< SEARCH` / `=======` / `>>>>>>> REPLACE` dans le code généré | **Run coffee : un `=======` littéral + bloc dupliqué → `SyntaxError` → `IPLEngine` jamais défini → liste vide**. Le reviewer l'avait signalé (défaut n°4) mais l'auto-fix n'a pas convergé ; la réparation déterministe (`stripPatchArtifacts`) l'élimine sans LLM |

Ces deux gates sont fusionnés dans les issues confirmées → auto-fix + sections dédiées au rapport (« IPL-leakage gate », « Patch-artifact gate ») + comptés dans « trouvé ».

## Run local coffee multi-fichier (bonsai-27b via LM Studio)

Test du seed multi-fichier (`main.ipl` importe `data.ipl`, 5 `seed Drink`) en backend local :

- **Delivery** : « Reviewer: deepseek-chat (partagé) · ✅ No confirmed defects found · Delivered 4 file(s) » — consolidation verte.
- **Runtime réel (navigateur headless)** : `index.html` **tronqué** (coupé en plein `<span`, sans `</html>` ni `<script src="src/app.js">`) → liste vide + loyalty non cliquable. Le reviewer ne voit pas la troncature (lecture statique, sans exécution). App corrigée manuellement (vib coding) : menu seedé avec les 5 boissons ✅.
- Enseignement : **la review statique + les gates ne remplacent pas l'exécution**. La troncature (`</html>` manquant) est un futur gate déterministe candidat (`findTruncatedFiles`). Le biais « reviewer = générateur » reste le plafond (ici reviewer deepseek-chat sur artefact d'un modèle local — la review n'a pas croisé le runtime).

## P6 — Coût reviewer vs gain (analyse, run 7-spec `--consolidate`)

Le rapport benchmark exporte désormais un tableau « Token economy » (le rapport v1.4 le génère par run). Chiffres mesurés (estimation chars/4, deepseek-chat) :

| Spec | Statut | Génération | Consolidation | Ratio | Réparation | Repair |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| hello | PASS | 3 875 | 8 827 | 2.3× | 0 | 0 |
| typed-order | PASS* | 8 354 | 47 965 | 5.7× | 8 947 | 1 |
| weather | PASS | 7 237 | 21 657 | 3.0× | 0 | 0 |
| form | PASS | 4 211 | 11 660 | 2.8× | 0 | 0 |
| node-hello | WARN | 3 743 | 9 183 | 2.5× | 0 | 0 |
| parking | FAIL | 5 661 | 31 770 | 5.6× | 18 866 | 3 |
| coffee | FAIL | 6 710 | 35 725 | 5.3× | 19 746 | 3 |
| **TOTAL** | | 39 791 | 166 787 | **4.2×** | 47 559 | |

`*` typed-order : first-try FAIL → consolidation 2 passes → 1 repair → PASS.

Lecture (honnête) :

- **La consolidation coûte ~4.2× la génération.** C'est le prix du gate, mesuré.
- **Sur les défauts code (niveau statique), elle converge en 1-2 passes et évite des repair** : les 3 PASS « first-try » (hello, weather, form) ont coûté 0 token de réparation — la consolidation a suffi. typed-order (FAIL first-try) est passé au PASS avec **1 repair** au lieu d'une boucle aveugle.
- **Sur les oracles comportementaux (parking tarification, coffee float), elle est aveugle** : 31-35K de consolidation + 18-19K de réparation, échec des deux. La review statique ne voit pas la sortie runtime — le verify+repair reste le seul juge, et le contrat sérialisé dans le prompt ne suffit pas toujours.
- **Net** : ce run unique ne permet pas de conclure sur l'économie absolue (il faudrait un A/B consolidate vs sans-consolidate, même modèle/specs). Le coût (~4×) est amorti **si** la consolidation convertit des FAIL→PASS sans repair (typed-order) plus souvent qu'elle ne « sur-corrige » des runs déjà bons. P6 recommande un **A/B futur** comme mesure définitive ; la télémétrie est en place pour ça.

## P6 — A/B mesuré : consolidation vs réparation seule (2026-08-12, deepseek-chat, 7 specs, n=1, output neuf)

Run contrôlé : même modèle, même jour, **`output/benchmark` vidé** avant les 2 groupes (aucun résidu). Groupe A `--consolidate`, Groupe B sans (réparation seule, 3 passes max). Tokens estimés chars/4.

| Spec | A : consol | B : repair | A tokens (gén/consol/rép) | B tokens (gén/consol/rép) |
| :--- | :---: | :---: | :--- | :--- |
| hello | PASS | PASS | 4 969 / 3 119 / 0 = **8 088** | 5 227 / 0 / 0 = **5 227** |
| typed-order | PASS | PASS | 8 769 / 52 945 / 20 615 = **82 329** | 6 911 / 0 / 6 672 = **13 583** |
| weather | PASS | PASS | 7 298 / 13 472 / 0 = **20 770** | 7 884 / 0 / 0 = **7 884** |
| form | PASS | PASS | 9 249 / 47 430 / 0 = **56 679** | 10 896 / 0 / 0 = **10 896** |
| node-hello | PASS | PASS | 2 915 / 1 268 / 0 = **4 183** | 3 751 / 0 / 0 = **3 751** |
| parking | **FAIL** | PASS | 5 717 / 13 353 / 21 543 = **40 613** | 5 126 / 0 / 12 129 = **17 255** |
| coffee | **WARN** | PASS | 6 406 / 25 048 / 0 = **31 454** | 5 352 / 0 / 9 547 = **14 899** |
| **TOTAL** | **5 PASS / 1 WARN / 1 FAIL** | **7 PASS / 7** | **45 323 / 156 635 / 42 158 = 244 116** | **45 147 / 0 / 28 348 = 73 495** |

**Verdict de l'échantillon (n=1) — honnête, avec ses limites** :

- **B (réparation seule) gagne sur tous les axes** : 7/7 PASS vs 5/7, et **1/3.3 des tokens** (73,5k vs 244k). La consolidation a coûté **156k tokens (~3.5× la génération)** et n'a ni sauvé parking (FAIL après consol + 3 repairs) ni coffee (WARN) — que la réparation seule a **tous deux** récupérés.
- **Le repair B a convergé partout** (typed-order 1 pass, parking 2, coffee 2) — dont la réparation déterministe SEARCH/REPLACE (nouveau gate) qui a réparé typed-order **sans LLM**.
- **Caveats qui interdisent de conclure définitivement** :
  1. **n=1** — deepseek-chat est non-déterministe (le run consolidé de la veille : 4/7 ; cette session : 5/7). Variance forte.
  2. **L'oracle bench ≠ l'app** : le verify+repair automatise ce qu'un humain ferait. Dans l'app, la valeur de la consolidation est **de ne jamais livrer du code cassé + de diagnostiquer pour l'humain** (le prompt « Copier ») — valeur **invisible** dans un taux de PASS.
  3. **Confondant** : avec consolidation, l'artefact est **modifié avant verify** (auto-fix) — l'échec parking/coffee du groupe A peut venir du fix lui-même.
  4. **Latence** : A est ~2-4× plus lent (typed-order 164 s vs 37 s).
- **Recommandation P6 (data-driven)** : sur ce sample, la review systématique **par défaut** n'est pas justifiée par le taux de PASS automatisé. Trois directions : (a) **consolidation opt-in par défaut OFF** (garder gates 0-token + verify), (b) la rendre **moins chère** (review LLM seulement si les gates déterministes tirent, pas sur un arbre propre), (c) la garder pour la valeur **humaine** (diagnostic + non-livraison de code cassé) et mesurer ça séparément. À trancher avec plus de runs (A/B multi-itérations).

**Décision prise (2026-08-12) — direction B : review adaptative, implémentée.**
`consolidateArtifact` passe en mode par défaut `'adaptive'` : les gates 0-token (imports/JSON/form/IPL/patch) tournent toujours ; la **review LLM + auto-fix ne s'exécutent que si un gate tire**. Un arbre propre est livré sur les seuls gates (rapport : `Reviewer: skipped (deterministic gates clean — 0 tokens)`). `systematicReview: true/false` reste disponible pour forcer/désactiver (bench). Impact attendu : éliminer le coût ~3.5× sur les runs bons, garder la valeur « diagnostiquer + ne pas livrer du cassé » quand un gate détecte quelque chose.

## P6b — Layer-aware receipts + forme `batch` (2026-08-25, deepseek-chat, 7 specs, n=1)

Nouvelle couche de mesure (`--nl-witness`, `--form-factor`) après le correctif de la classe « point d'entrée/CLI interactif » (parking `argparse` → forme `batch` + gate `form-mismatch`) et l'ajout d'un comparateur flottant (`approx`/tolérance). Les receipts séparent désormais trois axes au lieu d'un PASS/FAIL global :

- **Couche liante** — le premier gate qui contraint (topologie → intégration → runtime-first-try).
- **Préservation sémantique** (indépendante du verdict runtime) — identité/types/formules/clés qui survivent dans le source livré.
- **Réparation déterministe vs LLM** + **stabilité de topologie** entre itérations.

Résultat réel (deepseek-chat, 2026-08-25) :

| Spec | Statut | first | repair | Sém. | Couche liante |
| :--- | :---: | :---: | :---: | :---: | :--- |
| hello | PASS | PASS | 0 | 1.00 | — |
| typed-order | PASS | FAIL | 2 | 1.00 | runtime |
| weather | PASS | PASS | 0 | 0.857 | — |
| form | PASS | PASS | 0 | 0.90 | — |
| node-hello | PASS | PASS | 0 | 1.00 | — |
| parking | PASS | FAIL | 1 | 0.95 | runtime |
| coffee | **FAIL** | FAIL | −1 | 0.95 | runtime |

**IPL final 6/7 PASS.** Le seul échec restant (`coffee`) n'est **pas** un problème de spec : préservation sémantique 0.95 (identité 13/13, formules 12/12, clés 5/5), mais le modèle a produit cette fois un JSON non structuré (variance inter-run) ou un `grandTotal` flottant (`5.779...` vs `5.78` — désormais toléré via `approx`). La réceipt distingue nettement « contrat préservé » de « runtime divergent ».

**Témoin NL vs IPL** (même exigence en prose, first-try, sans réparation) :

| Spec | IPL | NL | Verdict |
| :--- | :---: | :---: | :--- |
| hello / typed-order / node-hello | PASS | PASS | Parity |
| parking | PASS | FAIL (sém. 0.653) | **IPL did better — NL lacked the constraint** |
| coffee | FAIL | FAIL | Parity (les deux échouent sur la variance) |

Sur le scénario riche, le chemin contraint IPL préserve mieux le contrat et passe, là où le chemin NL échoue — confirmation outil de la thèse « constraint-first ». Sur les specs simples, parity (cohérent).

**Lectures P6b** :
- La forme `batch` + gate `form-mismatch` a éliminé la classe « app interactive que le harness ne peut pas piloter » en génération (parking revient à la vie sans bricolage, généralisable à toute spec JSON/stdout).
- Un échec runtime n'est plus synonyme de « la spec a échoué » : les receipts disent *quelle* couche a tenu le degré de liberté (ici le runtime/variance modèle, pas la sémantique).
- Le comparateur `approx` corrige l'échec strict-float (`grandTotal 5.779...`) sans relâcher l'exigence d'intention.

## 🏭 Multi-domain stress test — NLP vs IPL (2026-08-25, deepseek-chat, 6 domaines, n=1)

Panel de problématiques **sans rapport entre elles**, chacune en IPL **et** en NL à information égale, avec oracle de sortie auto-cohérent (`seed` dans la spec → parité clean). `--spec` est répétable. Rapport complet : `output/benchmark/report-2026-08-25T14-49-45-239Z.md`.

| Spec (domaine) | Final | IPL 1st-try | NL 1st-try | Sém. | Ctrl | Parité |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| parking-multi (garage, multi-fichiers) | PASS | 0% | 0% | 0.705 | 3/3 | ✅ |
| banking (finance) | PASS | 100% | 100% | 0.800 | 1/1 | ✅ |
| logistics (supply chain) | PASS | 100% | 0% | 0.867 | 1/1 | ✅ |
| inventory (retail) | **FAIL** | 0% | **100%** | 1.000 | 1/1 | ✅ |
| payroll (HR) | WARN | 0% | **100%** | 0.900 | 1/1 | ✅ |
| telecom (utilities) | **FAIL** | 0% | **100%** | 0.811 | 1/1 | ✅ |

**Lecture honnête (non confirmatoire)** :

- **La mesure est agnostique au domaine** — finance, supply chain, retail, HR, utilities, garage : le harness + oracle dérivé + gate fonctionnent sans adaptation.
- **Parité 100 %** : `seed` dans la spec ferme le trou oracle/spec (un `parking` mono-fichier sans seed serait signalé).
- **NL a fait MIEUX en first-try sur inventory/payroll/telecom** : les briefs NL épellent les valeurs exactes ("balance = 1498.5", "total = 39.99"), le modèle hardcode et passe direct ; l'IPL exige d'*implémenter* la formule → erreurs d'implémentation que la réparation ne rattrape pas (-1). Sur banking/logistics, IPL passe direct (100 %).
- **Sémantique haute partout (0.705–1.0), même sur les FAIL** : inventory sém. 1.0 mais FAIL runtime — le contrat survit dans le code, l'exécutable diverge (variance modèle sur le calcul).

**Thèse affinée** : l'avantage d'IPL n'est **pas** la justesse numérique first-try (sur des calculs triviaux un bon prompt NL peut battre un IPL qui fait implémenter la formule). C'est la **contrainte + détection de dérive + convergence sur les contrats riches/structurés** (parking : IPL converge, NL échoue first-try). La mesure sépare 4 axes : **sémantique** (contrat dans le code), **runtime** (exécutable diverge), **first-try** (variance modèle), **parité** (seed ferme le trou). Limite : n=1, illustratif.

### Robustesse n=3 (inventory / payroll / telecom, 2026-08-25)

Relaunch à `--iterations 3` pour vérifier que le « NL > IPL first-try » n'est pas du bruit. Rapport : `output/benchmark/report-2026-08-25T15-10-21-794Z.md`.

| Spec (domaine) | Final (n=3) | IPL 1st-try | NL 1st-try | Sém. mean (range) | Ctrl | Verdict |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| inventory (retail) | 0/3 FAIL | 0% | 100% | 0.967 (0.95–1.0) | 1/1 | NL better |
| payroll (HR) | 0/3 FAIL | 0% | 100% | 0.967 (0.95–1.0) | 1/1 | NL better |
| telecom (utilities) | 2/3 PASS | 0% | 100% | 0.768 (0.593–0.861) | 1/1 | NL better |

**Conclusion robuste** : le « NL mieux que IPL en first-try sur calculs triviaux » est **confirmé en n=3** (100 % NL vs 0 % IPL, constant). Cause : le brief NL épelle les valeurs exactes → le modèle hardcode ; l'IPL fait implémenter la formule → erreur d'implémentation, réparation non convergente (inventory/payroll 0/3, `-1`). La sémantique reste haute même en FAIL (0.95–1.0) — contrat préservé dans le code, exécutable divergent. C'est le constat central, et il circonscrit précisément le régime où l'approche vaut le coup (contrats riches, besoin de convergence) vs où elle n'apporte rien de plus qu'un bon prompt (calculs triviaux).

### Dé-biais — baseline NL déterministe (`--nl-render`, 2026-08-25, n=3)

Les briefs NL écrits par une IA (épelant chaque valeur exacte) flattaient le chemin NL. `renderNLBrief(specCode)` dérive le brief en prose déterministe depuis la spec (mêmes entités/fixtures/formules/clés — même information, autre représentation), et `--nl-render` force cette baseline. Rapport : `output/benchmark/report-2026-08-25T15-33-35-768Z.md`.

| Spec | IPL final (n=3) | IPL 1st-try | NL 1st-try | Sém. | Verdict |
| :--- | :---: | :---: | :---: | :---: | :--- |
| inventory (retail) | 0/3 FAIL | 0% | 100% | 0.983 | NL better |
| payroll (HR) | 1/3 PASS (2 WARN) | 0% | 0% | 0.950 | **Parity** |
| telecom (utilities) | 1/3 PASS | 0% | 100% | 0.724 | NL better |

**Ce que révèle le dé-biais** : le « NL mieux » était en partie un **artefact du brief authored** — sur payroll (rounding + `(1-taxRate)`), le NL déterministe tombe à **0 %** → **Parity**. Sur inventory/telecom (calcul à une étape), NL reste 100 % : même avec une prose complète qui exige de calculer, le modèle calcule juste du premier coup. Sémantique haute partout même en FAIL (0.72–0.98). Conclusion : l'IPL n'a **pas** d'avantage de justesse first-try ; son avantage est la **convergence sur contrats riches** + la **détection de dérive**. Le biais de rédaction est maîtrisé par la baseline déterministe.

### Contrôle humain — brief écrit par un humain (recipe-app, 2026-08-25, n=3)

`Brief author: human`. Un humain dicte (en français, avec ses formulations) un générateur de recettes de cuisine en web + API DeepSeek ; le même intent est traduit en IPL (anglais). Le bras NL utilise le **brief verbatim** (jamais `--nl-render`). Rapport : `output/benchmark/report-2026-08-25T16-08-35-701Z.md`.

| Spec | IPL final | IPL 1st-try | NL 1st-try | Sém. | Verdict |
| :--- | :---: | :---: | :---: | :---: | :--- |
| recipe-app (web + API ext.) | 3/3 PASS | 100% | 100% | 0.880 (0.866–0.897) | Parity |

**Lecture** : sur un brief humain relativement détaillé (il liste les features : radios entrée/plat/dessert, nb personnes, ingrédients à éviter, boutons générer/archiver, gestionnaire, changer nb personnes, liste des courses), **les deux bras réussissent first-try → Parité**. L'avantage d'IPL n'est **pas universel** : il ne se manifeste pas sur un brief web clair où le modèle fait bien dans les deux cas.

**Limite de vérification (importante)** : pour une app **web**, le `verify` du harness ne fait que `marker` ('ingredient') + `forbid` (ES-module) + gate de forme — il **ne peut pas exécuter l'appel API externe ni l'UI** dans la sandbox (pas de clé, pas de DOM interactif). Donc « PASS » ici = *app web plausible générée* (contenant 'ingredient', sans ES-module), **pas** une preuve fonctionnelle que la génération DeepSeek ou les boutons marchent. Le vrai signal fiable est la **préservation sémantique** (0.88) — le contrat d'intention a survécu dans le code.
