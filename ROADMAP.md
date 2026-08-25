# 🗺️ IPL Studio — Product Roadmap

> **Status**: Live working document. Each phase is shipped as a commit + changelog entry when its acceptance criteria are met.
> **Completed markers**: ✅ done · 🟡 in progress · ⬜ not started
>
> Version note: the original roadmap text was lost; this file is the canonical replacement and source of truth for the product direction.

---

## 🧭 Vision

IPL Studio is a polyglot, intent-based IDE whose core belief is **"rails, not walls"**: the IPL DSL guides and advises (info/warning diagnostics, grammar signatures, semantic checks) but **never blocks** — the LLM remains the final interpreter of ambiguity. Every phase below must preserve that principle.

---

## ✅ Completed

| Phase | Scope | Result |
| :--- | :--- | :--- |
| **M1 — Typed AST Parser** | Recursive-descent parser (`iplParser.ts`) producing `IPLBlockNode` trees, source-preserving round-trip, line-indexed advisory diagnostics (`validateIPLCode`, `parseIPLToTree`). | `38535c8` — rails-not-walls diagnostics |
| **M2 — Data-Driven Grammar** | `iplCore.ts` as the single source of truth; `grammarSignatureText()` injected into Pass 1/Pass 2 prompts; Monarch `typeKeywords` derived from `IPL_INTENT_TYPES`; `npm run doc:guide` regenerates `IPL_AGENT_GUIDE.md` from markers. | `b504919` — zero vocabulary drift |
| **M3 — Semantic Verification** | `iplSemantics.ts`: duplicate declarations, unknown intent types, unprotected I/O in `listen`, unknown `set` targets — all advisory, merged into `validateIPLCode`. | `97fb072` — cross-reference checks |
| **T1 — Test Suite** | Vitest (38 tests) covering parser, semantics, and grammar signature. `npm test`. | `932f0a6` — first test infrastructure |
| **M0 — Foundations** | French→English i18n sweep, absolute output paths outside the workspace, terminology rename (compiler → generator). | `2a44877` / `bbddc33` / `9a0cf16` |
| **Phase 4 — Benchmark Harness** | `scripts/run-benchmark.ts` + `npm run bench`: real 2-Pass e2e vs `deepseek-chat` (60% first-try PASS, 0 FAIL), mock mode for CI, Markdown reports with latency/tokens/files. | `088337e` — harness; real-endpoint run validated |
| **Phase 5 — Self-Healing & Repair Metrics** | `--repair-passes` loop (deterministic then LLM), `output/benchmark/history.json` + Trend/regression section, deterministic pre-repair (`deterministicRepair.ts`) wired into `autoDebugAndFix` + benchmark, pre-generation IPL quick-fixes (`iplQuickFix.ts`). | repair loop verified (typed-order FAIL→PASS via LLM; node-hello honestly `-1`) |
| **P6b — Layer-Aware Evaluation Receipts** | Receipts per evaluation layer (binding gate, semantics, topology stability), deterministic-vs-LLM repair split, semantic-preservation receipt (`semanticPreservation.ts`), NL control witness (`--nl-witness`). | layer-aware report + 314 tests green; `--nl-witness` external run pending |

---

## ✅ Phase 4 — Automated Benchmark Harness & Quality Gates *(done)*

**Objective**: Prove the 2-Pass engine end-to-end against real LLM endpoints and quantify "first-try" success.

**Scope**:
- `scripts/run-benchmark.ts` (`.env`-aware) + `npm run bench`: runs Pass 1 + Pass 2 on canonical specs, parses the real XML via `parseMultiFileXml`, writes to `output/benchmark/`, and verifies (run command / marker / ES-module scan / `node --check`).
- `--mode mock` offline pipeline smoke test (no API key needed).
- Markdown report per run with PASS/WARN/FAIL, latency, token estimates, file counts.
- **Quality gates**: a `:qg` mode that fails CI if first-try PASS rate drops below a threshold; ES-module (`<script type="module">`) usage is always a FAIL for `html` targets.

**Acceptance criteria**:
- [x] `npm run bench -- --mode mock` passes on a clean checkout without any LLM/network.
- [x] `npm run bench` produces a report for a real configured endpoint.
- [x] Report records per-pass latency, approx. tokens, file count, and first-try status.

**Status**: 🟢 done (`088337e` + real-endpoint run `deepseek-chat`: 60% first-try PASS / 0 FAIL; WARNs only from missing local Python and a `node-hello` entry-point miss). The `:qg` CI quality-gate is deferred and folded into Phase 10's scorecard.

---

## ✅ Phase 5 — Self-Healing Agent & Repair Metrics

**Objective**: Make the autonomous debug loop measurable and trustworthy.

**Scope**:
- Wire the benchmark into `autoDebugAndFix` (up to 3 repair passes) and record **repairs-to-success** per spec/model.
- Persist per-run history in `output/benchmark/history.json` for trend reporting.
- Add an LLM-independent fallback repair (deterministic ES-module / Tailwind-CDNU fixes) before spending a repair call.

**Acceptance criteria**:
- [x] Benchmark report includes "repair passes needed" and success-after-repair rate.
- [x] Trend report shows regression vs. previous runs.
- [x] Deterministic pre-repair catches the two documented cloud failure modes (ES modules, missing Tailwind CDN).

**Status**: 🟢 done — repair loop (`--repair-passes`, deterministic then LLM), `history.json` + Trend section, deterministic pre-repair module (`deterministicRepair.ts`) wired into both `autoDebugAndFix` and the benchmark. Bonus: pre-generation IPL quick-fixes (`iplQuickFix.ts`) apply fixable diagnostics before the spec reaches the model.

---

## ✅ P6b — Layer-Aware Evaluation Receipts

**Objective**: Stop aggregating unrelated failures into one PASS/FAIL. Attribute each run to the layer that actually held a degree of freedom, and measure the spec's semantic contract independently of the runtime verdict.

**Scope**:
- **Layer grid** (`buildLayerReceipts`, `scripts/run-benchmark.ts`): each run is attributed to the first binding gate in causal order `topology → integration → runtime-first-try`. Semantics and repair layers are receipts, not flags.
- **Deterministic-vs-LLM split** (P2): `statusAfterDeterministic`, `deterministicRepairs`, `llmRepairPasses` — did the 0-token repair resolve it, or did the LLM burn tokens?
- **Semantic-preservation receipt** (`src/engine/semanticPreservation.ts`, pure + 6 offline tests): identifiants / types / formules / clés-de-sortie of the spec that reach the shipped source, **independent of runtime PASS** — the "app works but the contract leaked" detector.
- **Topology stability** (P4): distinct Pass 1 topology count across iterations (1 = deterministic, >1 = LLM freedom).
- **Natural-language control witness** (`--nl-witness` + report section): same requirements as prose, generated first-try, compared head-to-head (IPL over-constrained vs LLM fails regardless).
- **Docs**: `docs/degrees-of-freedom.md` ledger explicitating promise → owner layer → measured today.

**Acceptance criteria**:
- [x] Report exposes the three measured receipts (layer, semantics, topology stability).
- [x] Semantic receipt is pure/offline and covered by dedicated tests.
- [x] NL-vs-IPL comparison is wired into the report (mock-validated; real external run pending a configured API key).

**Status**: 🟢 done (layer-aware report shipped; `--nl-witness` external run is the remaining validation).

---

## ⬜ Phase 6 — Semantic UX (Diagnostics Become Helpful)

**Objective**: Surface the parser + semantics output as first-class UX, not just squiggles.

**Scope**:
- Dedicated diagnostics panel (filter by severity, jump to line).
- Quick-fixes for the fixable diagnostics (unterminated string, unclosed block, missing `=`, unknown intent type suggestions).
- Semantic go-to-definition: jump from `set orderData.status` to the `read orderData` producer / `add entity` declaration.
- Block-tree viewer shows semantic state (declared / produced / unknown) on each node.

**Acceptance criteria**:
- [x] Every diagnostic with a `fix` is actionable from the editor.
- [x] Go-to-def resolves the 3 reference kinds (declared, produced, event) with no false positives on the canonical example.

**Status**: 🟢 done — new **Diagnostics** bottom-panel tab (severity filter, jump-to-line, apply-fix buttons via `applySingleQuickFix`); `src/engine/iplRefs.ts` reference index (`declared` / `produced` / `event`) powering a semantic go-to-definition + hover with zero false positives on fields/option values; block-tree nodes annotated with `declared` / `produced` / `unknown` badges; two new editor-actionable fixes (missing `=`, unknown intent type) — the lossy intent-type fix is `auto:false` (actionable, never auto-applied pre-generation).

---

## ⬜ Phase 7 — Multi-File IPL Modules End-to-End

**Objective**: `import "submodule.ipl"` must flow through the *entire* pipeline, not just the preprocessor.

**Scope**:
- Merge imported modules in `validateIPLCode` / semantic analysis (cross-file symbol table).
- Pass the merged spec to Pass 1/Pass 2 so generated apps reflect every module.
- Preserve per-file editor editing while generating from the union.

**Acceptance criteria**:
- [x] Semantic checks span imported files (duplicate/unknown refs across files detected).
- [x] Generation consumes the resolved union deterministically.

**Status**: 🟢 done — `resolveIPLProject` (recursive, cycle-guarded, unresolved-import reporting) replaces the single-level regex; `validateIPLProject` merges main + transitive imports before running syntax + semantics so duplicates and unknown refs are caught across files; `setCode` syncs the live editor buffer into `sourceFiles[activeSourceFile]`; `runGeneration` seeds the union from `main.ipl` regardless of the active file and logs unresolved imports.

---

## ✅ Phase 8 — Security Hardening

**Objective**: Make the dev-only APIs safe to deploy.

**Scope**:
- Token/header auth on `/api/run-command`, `/api/write-artifact`, `/api/read-disk`, `/api/git/*`.
- Path sandbox review for absolute output paths (write allow-list / confirmation UI).
- Command execution allow-list + confirmation in the terminal panel.

**Acceptance criteria**:
- [x] A `--production` flag disables all dev endpoints unless auth is configured.
- [x] No endpoint writes outside an explicit, user-confirmed target directory.

**Status**: 🟢 done — loopback-only guard (DNS-rebinding: Host + cross-origin Origin), optional token auth (`IPL_DEV_TOKEN` via `X-IPL-Token` header), `--production`/`IPL_PRODUCTION=1`/`npm run dev:secure` disables every dev endpoint unless a token is set, external writes require an explicit confirmation (`/api/confirm-path` + 403 `PATH_CONFIRMATION_REQUIRED` retry in the UI), optional server-side command allow-list (`IPL_ALLOWED_COMMANDS`) plus a client-side confirmation for unrecognized commands in the terminal panel. All calls route through `src/services/api.ts` (`apiFetch`).

---

## ✅ Continuous Integration (quality gate)

**Objective**: Never merge a commit that breaks the gates.

**Scope**:
- `.github/workflows/ci.yml` runs `npm test` (Vitest, incl. golden execution fixtures via `setup-python`), `npm run lint` (oxlint, 0 errors), and `npm run build` (`tsc -b` + Vite) on every push to `main` and every pull request.
- **`concurrency` guard** (group `ci-${{ github.ref }}`, `cancel-in-progress: true`) tuned for the commit-heavy workflow: only the latest commit on a branch is ever validated — an in-progress run is cancelled as soon as a newer push arrives, so runs never pile up and GitHub never queues stale builds.

**Status**: 🟢 done — CI live on push/PR/manual trigger. The historical `:qg` benchmark quality-gate remains folded into Phase 10's scorecard (as initially planned), independent of this generic green/red gate.

### 📦 Versioned Release pipeline

**Objective**: One manual command turns the current `main` into a tagged GitHub Release with clean changelog notes.

- `.github/workflows/release.yml`: `workflow_dispatch` with a semver input (`x.y.z`, `v` prefix added automatically). Validates the version, bumps `package.json`, moves `## 🚧 [Unreleased]` to `## [x.y.z] - <date>` (extracting the release notes, refusing an empty section), commits + tags + pushes `vx.y.z`, then `gh release create` with the notes file.
- Guarded by `concurrency: release` (serializes manual releases, no auto-release on push — commits stay CI-only).

### 🎨 UX Finishing Pass (onboarding, errors, templates)

**Objective**: A first-time user can go from empty editor to a running generated app without hunting for features.

- One-time first-run `WelcomeModal` (persisted) with 3-step loop + shortcuts to the tutorial and project manager.
- Generation/LLM failures surface in a dismissible banner over Project Files with an **Open Settings** shortcut (`generationError` store field).
- Project Manager template gallery (6 starter templates with icons + descriptions).
- Skeleton loading states (generation overlay + chat typing) and helpful empty states (Logs, Source Tree).

**Status**: 🟢 done — shipped in `df03e7c` (UX finishing pass), covered by 3 new store tests (133 total).

### 📦 Bundle & Performance Budget

**Objective**: Keep the critical path lean; isolate heavy vendors into cacheable chunks.

- App entry chunk dropped **4.79 MB → 299 kB** (gzip 1.24 MB → 82.8 kB) via `codeSplitting.groups` (`monaco-vendor`, `react-vendor`, `xterm-vendor`, `ui-vendor`).
- 4 `INEFFECTIVE_DYNAMIC_IMPORT` warnings removed (engine modules already statically imported → plain static imports).
- `chunkSizeWarningLimit: 5000` documents monaco-editor (~4 MB) as a cacheable outlier.

**Status**: 🟢 done — build, 133 tests and lint green; dev-server smoke test boots clean.

### 🎯 Behavioral Assertions (golden oracles)

**Objective**: Tests must prove *what the generated app does*, not just that it runs — the honest proof that an IPL spec's intent was translated exactly.

- `src/engine/behaviorAssert.ts`: pure, declarative `BehaviorAssert` (exit code, stdout contains/regex, JSON-path asserts `equals/matches/gt/lt/arrayLength` with tolerant JSON extraction). Shared by the golden runner and the benchmark harness — 14 unit tests.
- `golden/billing-python/`: frozen invoice app verified against strict JSON behaviour (the "oracle" fixture).
- Benchmark specs can declare `verify.assert` (runtime-output checks); `typed-order`/`node-hello` now require the spec's data to actually surface at runtime. Mock mode emits the same needles so the behavior path is validated offline.
- Benchmark `python` resolution now probes `python → python3 → py` (Windows `py` fallback).

**Status**: 🟢 done — 148 tests across 12 suites, `--mode mock` 5/5 PASS.

---

## ⬜ Phase 9 — Packaging & Distribution (standalone desktop)

**Objective**: Ship IPL Studio as a desktop app and published package.

**Verdict (2026-08-12)**: NOT production-ready yet — the web IDE is a solid dev tool, but packaging, runtime reliability (web headless/behavioral), the Phase 10 kill-list and a multi-model scorecard are still open. The standalone is the NEXT milestone, not today.

**Approach (agreed)**: **Tauri shell (light, Rust) + Node sidecar** — no backend rewrite:
- `scripts/standalone-server.mjs` (~40 lines, shared Electron/Tauri): serves the Vite `dist` + mounts `createDevApiServer` middlewares on `127.0.0.1` only.
- Tauri `src-tauri` (thin Rust): spawn the Node sidecar (system `node` first; bundled Node later), open a webview to the localhost URL.
- Rationale: the product inherently needs node/python/git at runtime (run-command, serve, smoke, git), so a system-`node` sidecar keeps the app light; a bundled Node runtime makes it self-contained (trades ~40 Mo). Electron remains the fallback if the Rust shell becomes a bottleneck.

**Scope**:
- Standalone server (`standalone-server.mjs`) + Tauri shell (spawn sidecar + webview).
- `npm publish`-able package with the engine (`iplCore`, `iplParser`, `iplSemantics`, `artifactGenerator`) exposed as a public API (`@ipl-studio/engine`).
- Offline asset bundle (Monaco workers, Tailwind) for air-gapped use.

**Prerequisite done**: the dev-only API backend + security gate now live in a reusable, Vite-independent module (`src/server/devApiServer.ts` exposing connect-style middlewares via `createDevApiServer`), so the desktop shell can mount the exact same policy on its own `http` server without Vite.

**Acceptance criteria**:
- [ ] `standalone-server.mjs` serves `dist` + `/api/*` on `127.0.0.1` (unit-tested).
- [ ] Desktop build launches with dev endpoints bound to `localhost` only.
- [ ] `@ipl-studio/engine` consumes/generates IPL from a plain Node script (no browser).

---

## ⬜ Phase 10 — v1.0 General Availability

**Objective**: 1.0 release with a clean public story.

**Scope**:
- Full doc pass: README, `IPL_AGENT_GUIDE.md`, `CHANGELOG.md` promoted to v1.0.0.
- Benchmark scorecard with ≥ 3 models (local + cloud).
- Kill-list review: remove stale `[Exemple]` projects, dead code, the 17 pre-existing oxlint warnings.

**Acceptance criteria**:
- [ ] `npm run build && npm test && npm run lint` all clean on a fresh clone.
- [ ] 1.0 scorecard published in the README.

---

## ⬜ Phase 11 — Local Model Catalog (LM Studio & Ollama)

**Objective**: Discover, list, and load models running locally so the packaged app is not tied to a hardcoded endpoint/model.

**Scope**:
- Query the LM Studio `/v1/models` and Ollama `/api/tags` endpoints on startup (both already speak OpenAI-compatible-ish APIs) and surface available models in the Settings modal.
- Keep the catalog entirely optional: if the local server is unreachable, fall back to the manual endpoint/model fields (no hard dependency).
- Persist the selected model per mode and validate connectivity before generation (bad endpoint → clear warning, never blocks).

**Acceptance criteria**:
- [ ] Model dropdown is populated from a live LM Studio or Ollama server without manual entry.
- [ ] A dead/unreachable local server degrades gracefully to manual config with a warning (rails, not walls).

---

## 🧭 Guiding Principles (unchanged)

1. **Rails, not walls** — diagnostics never block; severity is `info | warning`.
2. **Single source of truth** — grammar data lives in `iplCore.ts`; prompts/docs are generated.
3. **The LLM is the final interpreter** of ambiguity; deterministic tools only advise.
4. **First-try honesty** — the benchmark measures first-try success before repair.
