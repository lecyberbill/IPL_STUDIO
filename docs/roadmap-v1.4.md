# Roadmap v1.4 — « Product reliability »

Thème : passer de la preuve en benchmark à un produit fiable de livraison.

Version courante : **1.4.0** (livré le 2026-08-12). Cette roadmap s'ancre sur les mesures de la session « consolidation » (voir `benchmark-scorecard.md`).

> **Statut : P1-P5 + P7 livrés.** Il reste P6 (coût reviewer vs gain, analyse) — voir la section dédiée.

## Faits mesurés à l'origine de cette roadmap

- Le reviewer **même-modèle** que le générateur **ratifie** la stack : `document is not defined` (web app générée pour une spec Node console) passé en « No confirmed defects ».
- gpt-oss-20b / qwen génèrent une **web app** (`index.html`, `public/styles.css`, DOM) pour des specs CLI — mode d'échec récurrent.
- PASS coffee goldénique obtenu avec consolidation (Latte 4.2/3.78, Espresso 2.0/2.0, `grandTotal: 5.78`), mais **instabilité inter-run** 1/2.
- Le **gate déterministe** (0 token) attrape ce que la review LLM rate (ex. `package.json` invalide avec commentaire `//`).

---

## Priorité 1 — Livraison visible dans le produit

La consolidation tourne déjà dans le flux app, mais son rapport n'est visible que dans le console log. La valeur d'IPL (« la machine prépare le terrain, l'humain vib-code le reste ») doit être **visible** pour l'utilisateur.

- **Panneau de livraison** dans l'UI après génération et après correction : sections trouvé / corrigé / restant.
- Chaque issue restante est un **élément cliquable** menant au fichier/ligne concerné(e).
- Le rapport montre : gates déterministes (imports manquants, JSON invalide), review LLM (warnings), auto-fix appliqué (passes, fichiers modifiés), issues restantes à revoir.
- Le panneau est re-opensable depuis le log / le rapport de run.

## Priorité 2 — Télémétrie de l'économie de tokens (le contrat)

Le contrat d'IPL est l'économie de tokens (précision encodée dans la spec, pas négociée au fil du dialogue) — mais elle n'est **pas mesurée dans l'app**.

- Compteur **entrée/sortie** par run (tokens ≈ chars/4), passes de réparation, allers-retours de clarification.
- Affichage dans le panneau de livraison : « spec 211 tokens → génération N + consolidation M + réparation K ».
- Export dans le rapport benchmark pour comparer cloud / local / modèles.
- Sans cette mesure, la valeur reste théorique.

## Priorité 3 — Reviewer indépendant (anti biais de confirmation)

Un reviewer n'est un « fresh eye » que s'il est dé-corrélé du générateur.

- Config `reviewerModel` / `reviewerEndpoint` **séparés** du modèle de génération (défaut : même modèle, comportement actuel).
- Cross-endpoint possible : génération locale + review cloud, ou rotation de 2 modèles.
- Indicateur dans le rapport de consolidation : « reviewer : gpt-oss-20b (partagé) » pour ne pas sur-vendre la review quand générateur et reviewer sont identiques.

## Priorité 4 — Contrainte de stack « script autonome » dans le prompt

- Directive générique (pas un patch par spec) dans Pass 1 / Pass 2 : target = exécutable CLI autonome, pas de serveur web, pas de DOM, pas de `app.run`.
- Vérifiable par le gate statique : présence de `index.html` / `public/` ou d'appels à `document` pour une spec CLI → signalé avant verify.

## Priorité 5 — Généraliser la mesure

- `run-benchmark --consolidate` sur les **6 SPECS** (l'impact du gate n'est mesuré que sur coffee).
- Gate CI : `test` + `lint` + `tsc` à chaque commit ; bench smoke en mock.

## Priorité 6 — (En option) Coût du reviewer en échange du gain

- Mesurer les tokens ajoutés par la consolidation vs les passes de réparation économisées — valide ou invalide la review systématique sur la durée.

---

## Non-goals v1.4

- Aucun patch spécifique à un run (ex. « interdire `file://` ») — un run n'est jamais représentatif.
- Pas de recherche du 100 % de PASS : le contrat reste l'économie de tokens et la préparation du terrain pour le vib coding.
