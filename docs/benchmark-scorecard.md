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

### Synthèse

- **Cloud** (`deepseek-chat`) : 1/1 PASS — le droit à l'erreur (2 réparations) suffit quand le contrat comportemental est communiqué.
- **Local** : 0/5 PASS. Tous les modèles locaux génèrent du code structurellement plausible mais échouent sur :
  1. le **`main()` d'exécution complet** reproduisant les données exactes de la spec (plates, taux, taux VIP),
  2. la **sortie JSON conforme au contrat** (absence d'array `vehicles`, `grandTotal`, mauvais type),
  3. la **non-pollution du stdout** (artefacts d'exemple imprimés à l'import).
- **Le contexte n'était pas le goulot** : le passage 8000 → 16k/32k n'a pas suffi ; le plafond est la capacité du modèle à produire un programme autonome conforme.

### Leçons pour le harness

- WARN « clarification » pendant une passe de réparation : désormais un **FAIL comptable** (passe de réparation consommée), plus un état terminal qui attendait une réponse utilisateur — le modèle discute au lieu de corriger. (`repairAndVerify` dans `scripts/run-benchmark.ts`)
- Le rapport benchmark affichait `Endpoint: https://api.deepseek.com` même en mode lmstudio : corrigé via `endpointForMode` (sélection selon le mode, pas par priorité de véracité — `externalEndpoint` est toujours truthy).
- Envisager une contrainte harness « script autonome » (pas de serveur web / pas d'`app.run`) communiquée dans le prompt.
