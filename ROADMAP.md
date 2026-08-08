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

## ⬜ Phase 6 — Semantic UX (Diagnostics Become Helpful)

**Objective**: Surface the parser + semantics output as first-class UX, not just squiggles.

**Scope**:
- Dedicated diagnostics panel (filter by severity, jump to line).
- Quick-fixes for the fixable diagnostics (unterminated string, unclosed block, missing `=`, unknown intent type suggestions).
- Semantic go-to-definition: jump from `set orderData.status` to the `read orderData` producer / `add entity` declaration.
- Block-tree viewer shows semantic state (declared / produced / unknown) on each node.

**Acceptance criteria**:
- [ ] Every diagnostic with a `fix` is actionable from the editor.
- [ ] Go-to-def resolves the 3 reference kinds (declared, produced, event) with no false positives on the canonical example.

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

## ⬜ Phase 8 — Security Hardening

**Objective**: Make the dev-only APIs safe to deploy.

**Scope**:
- Token/header auth on `/api/run-command`, `/api/write-artifact`, `/api/read-disk`, `/api/git/*`.
- Path sandbox review for absolute output paths (write allow-list / confirmation UI).
- Command execution allow-list + confirmation in the terminal panel.

**Acceptance criteria**:
- [ ] A `--production` flag disables all dev endpoints unless auth is configured.
- [ ] No endpoint writes outside an explicit, user-confirmed target directory.

---

## ⬜ Phase 9 — Packaging & Distribution

**Objective**: Ship IPL Studio as a desktop app and published package.

**Scope**:
- Electron/Tauri shell embedding the Vite build + Node middleware.
- `npm publish`-able package with the engine (`iplCore`, `iplParser`, `iplSemantics`, `artifactGenerator`) exposed as a public API (`@ipl-studio/engine`).
- Offline asset bundle (Monaco workers, Tailwind) for air-gapped use.

**Acceptance criteria**:
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
