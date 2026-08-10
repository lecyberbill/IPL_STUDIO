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

### Synthèse

- **Cloud** (`deepseek-chat`) : 1/1 PASS — le droit à l'erreur (2 réparations) suffit quand le contrat comportemental est communiqué.
- **Local** : 0/9 PASS. Tous les modèles locaux génèrent du code structurellement plausible mais échouent sur :
  1. le **`main()` d'exécution complet** reproduisant les données exactes de la spec (plates, taux, taux VIP),
  2. la **sortie JSON conforme au contrat** (absence d'array `vehicles`, `grandTotal`, mauvais type),
  3. la **non-pollution du stdout** (artefacts d'exemple imprimés à l'import).
- **Le contexte n'était pas le goulot** : le passage 8000 → 16k/32k n'a pas suffi ; le plafond est la capacité du modèle à produire un programme autonome conforme.
- **`gpt-oss-20b` est le candidat local le plus proche** : 1 run sur 4 était conforme (run 14:02), bloqué uniquement par des erreurs mécaniques désormais corrigées dans le harness. Mais le modèle est **instable** d'un run à l'autre (imports relatifs/absolus incohérents, données hors contrat régénérées).

### Fixes harness dérivés de ce diagnostic

| Fix | Fichier | Effet |
| :--- | :--- | :--- |
| Nettoyage de la fence markdown **ouvrante** (` ```python `) | `src/engine/artifactGenerator.ts` (`parseMultiFileXml`) | Les .py wrappés dans une fence ne sont plus syntaxiquement invalides (2 fichiers cassés dans le run 14:02). |
| Rewrite d'import relatif Python `.X`→`..X` quand le module n'existe que dans le parent | `src/engine/deterministicRepair.ts` | Corrige le bug reproductible `src/models/parking_garage.py` → `from .config` au lieu de `from ..config`. Vérifiable : ne touche pas les imports légitimes. |
| Retry `python -m <pkg.module>` pour un `main.py` dans un package | `scripts/run-benchmark.ts` (`retryWithDiscoveredEntry`) | `python src/main.py` met `src/` dans sys.path et casse `from src.* import` ; `python -m src.main` garde la racine sur sys.path. |

### Leçons pour le harness

- WARN « clarification » pendant une passe de réparation : désormais un **FAIL comptable** (passe de réparation consommée), plus un état terminal qui attendait une réponse utilisateur — le modèle discute au lieu de corriger. (`repairAndVerify` dans `scripts/run-benchmark.ts`)
- Le rapport benchmark affichait `Endpoint: https://api.deepseek.com` même en mode lmstudio : corrigé via `endpointForMode` (sélection selon le mode, pas par priorité de véracité — `externalEndpoint` est toujours truthy).
- Envisager une contrainte harness « script autonome » (pas de serveur web / pas d'`app.run`) communiquée dans le prompt.
