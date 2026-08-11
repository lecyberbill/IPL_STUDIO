# Note de reprise — session (date à compléter)

> Récapitulatif pour reprise, généré en fin de session. Le travail décrit ici est
> **NON commité** — voir la section « Fichiers en attente de commit ».

## Contexte projet

**IPL Studio v1.3.0** (`D:\image_to_text\IPL`, branche `main`, dernier commit `b6f0765`)
— générateur 2-Pass (Pass 1 topologie + Pass 2 XML) d'applications multi-fichiers à
partir de specs IPL. Objectif courant : faire passer le benchmark cloud-vs-local à la
GA, avec droit à l'erreur (boucle de réparation) et mesure honnête du coût tokens.

**Infra de vérification** : `scripts/run-benchmark.ts` (7 SPECS : hello, typed-order,
weather, form, node-hello, parking, coffee) → `verify` (run + behavioral assert
`evaluateBehavior`) → `repairAndVerify` (déterministe + LLM, ≤3 passes). Goldens
exécutés par `src/engine/goldenExecution.test.ts`.

## Ce qui a été fait en session (NON commité)

Point de départ : test manuel coffee → la machine a généré une app cassée
(`require('./entities')` sans `entities.js`), réparée sur demande humaine (a généré le
fichier). Conclusion : la machine ne s'auto-vérifie pas.

### 1. Spec coffee au benchmark

- `run-benchmark.ts` : spec `coffee` (JS/Node), oracle JSON — Latte medium 3.50 +
  fidélité → finalPrice 3.78 ; Espresso small 2.00 sans carte → 2.00 ; grandTotal 5.78.
  Mock node corrigé (émettait du JS invalide, maintenant le JSON oracle).
- `golden/coffee-node/` : spec.ipl + golden.json + artifact.xml (implémentation
  **corrigée** avec `entities.js`). Golden tests : 7/7 pass.

### 2. Checker statique générique — `src/engine/staticChecker.ts`

- `findMissingModuleRefs` : parse les imports relatifs (JS `require`/`import`, Python
  `.config`/`..base`, Rust) et les croise avec les fichiers présents. **Zéro coût LLM**,
  détecte exactement le bug coffee. 13 tests (`.test.ts`).
- Intégré dans le benchmark après `writeArtifact`, **avant** `verify` (proactif) ;
  diagnostic injecté dans le prompt de réparation LLM.

### 3. Agent relecteur LLM — `src/engine/reviewAgent.ts`

- `buildReviewPrompt` + `parseReviewOutput`. Prompt **sans aucun vocabulaire IPL**
  (vérifié par test) — un reviewer senior sceptique lit le code pur, sort
  `{ issues: [{ severity, file, message, suggestion }] }`. 7 tests (`.test.ts`).
- Câblé via flag `--review` (opt-in, +1 appel LLM/run) ; findings error/warning
  injectés dans le prompt de réparation.

### État vérifié

207 tests / 16 fichiers verts · lint 0 erreur (17 warnings préexistants) · `tsc` +
build OK · benchmark mock 7 specs exit=0.

## Fichiers en attente de commit

```
 M scripts/run-benchmark.ts            (spec coffee + checker + agent relecteur câblés)
?? golden/coffee-node/                 (spec.ipl, golden.json, artifact.xml)
?? src/engine/staticChecker.ts         (+ staticChecker.test.ts)
?? src/engine/reviewAgent.ts           (+ reviewAgent.test.ts)
```

## Prochaines étapes

1. **Commit** du travail en cours (style des commits existants : `bench: ...`).
2. **Run réel** spec coffee (cloud deepseek-chat, puis local gpt-oss-20b) — voir si la
   machine génère le contrat correctement.
3. **Run avec `--review`** sur coffee — mesurer la valeur ajoutée de l'agent relecteur
   (attrape-t-il `entities.js` avant `verify` ? coût en tokens ?).
4. Backlog : gate `--mode mock` en CI · scorecard multi-modèles · kill-list des 17
   warnings oxlint · catalogue modèles LM Studio/Ollama.

## Décisions actées (mémoire)

- **Deps tierces OK si déclarées** (requirements.txt / package.json...) ; le harness
  **n'installe jamais** (NO AUTO-INSTALL, vérification humaine).
- **Droit à l'erreur** > one-shot : le critère est le coût de convergence
  (passes × tokens) et la stabilité.
- **Rails not walls** : les diagnostics IPL `info|warning` ne bloquent jamais la
  génération.
- DeepSeek cloud = référence ; gpt-oss-20b (LM Studio :1234) = meilleur candidat local.
- Économie tokens IPL vs prompt naturel : **~32 %** (mesuré, pas 3×) ; le vrai gain est
  le coût caché des aller-retours de clarification (contexte croissant + pollution).
