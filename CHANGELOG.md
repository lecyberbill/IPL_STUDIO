# 📋 IPL Studio Release Notes & Changelog

All notable changes to **IPL Studio** are documented in this file.

---

## [1.3.0] - 2026-08-10

### 📦 Versioned Release Pipeline
- **`.github/workflows/release.yml`**: one manual `workflow_dispatch` with a semver input (`x.y.z`, `v` added automatically) turns the current `main` into a tagged GitHub Release — validates the version, bumps `package.json`, moves `## 🚧 [Unreleased]` to `## [x.y.z] - <date>` (release notes extracted, empty section refused), commits + tags + pushes `vx.y.z`, then creates the Release with the notes. Serialized via `concurrency: release` (no auto-release on push).
### 🧪 Store Unit Tests — the business logic is now locked down
- **New `src/store/store.test.ts` (24 tests)**: builds the exact same slice composition as `useIdeStore` (via `createStore` from `zustand/vanilla`, no persist/localStorage) and asserts real cross-slice behavior end-to-end — `logsSlice` (cap 100), `editorSlice` (`setCode` syncing `sourceFiles[activeSourceFile]`, `setTargetLang`, snippet insertion), `projectsSlice` (create/delete guard/fallback, rename, output dir, per-file map + `main.ipl` protection, switch), `settingsSlice` (LLM config merge, modal toggles, custom-target id derivation, sidebar clamping, per-project polyglot config), `generationSlice` (pending-clarification lifecycle, `answerClarification` guard), and `diskSlice` (write-artifact posts the parsed artifact incl. the always-appended `source/main.ipl`, empty-folder read, no-op guard) with `fetch` stubbed.
- **Monaco stub for Node tests**: `src/test/mocks/monaco-editor.ts` replaces the real package at Vitest runtime (its ESM touches `window` at import); TypeScript still resolves types from the real package. Wired via `resolve.alias` in `vitest.config.ts`.
- Suite grows to **130 tests across 11 suites** (24 new store tests). `tsc -b`, oxlint (0 errors) and the full build all stay green.
### 🛠️ Dev Server: dependency scan restricted to the app entry
- Vite's dependency optimizer now only crawls `index.html` (`optimizeDeps.entries`). Without this, every `*.html` under the project root was scanned — including stale benchmark artifacts in `output/` whose `<script src="app.js">` targets don't exist — which broke dependency pre-bundling at every dev server startup with a scary "Failed to run dependency scan" error. Verified: server boots cleanly even with `output/` present, home 200, API mounted.
### 🤖 GitHub Actions CI (test + lint + build)
- **`.github/workflows/ci.yml`**: every push to `main` / pull request runs the full quality gate on `ubuntu-latest` — `npm test` (Vitest, with `setup-python` so the python golden fixtures really execute), `npm run lint` (oxlint, 0 errors), and `npm run build` (`tsc -b` + Vite). Trigger `workflow_dispatch` added for manual runs.
- **`concurrency` guard for the commit-heavy workflow**: runs are grouped per branch (`ci-${{ github.ref }}`) with `cancel-in-progress: true` — when a new commit lands while the previous run is still going, the old run is cancelled and only the latest commit is validated. No more pile-ups, no wasted minutes on stale code.
### 🔌 Dev-Only API Middleware Extracted to a Reusable Server Module
- **`vite.config.ts` slimmed down**: the entire dev-only API backend (`/api/write-artifact`, `/api/read-disk`, `/api/run-command`, `/api/confirm-path`, `/api/git/*`) plus its security gate (loopback-only, DNS-rebinding Host check, cross-origin Origin rejection, optional `X-IPL-Token` auth, `--production` disable, external-write confirmation, command allow-list) moved verbatim into **`src/server/devApiServer.ts`**.
- **Reusable beyond Vite**: `createDevApiServer(options)` now returns plain connect-style middlewares (`securityGate` + `handler`), so the exact same policy can be mounted by the Vite dev server (`artifactDiskWriterPlugin`) *and* by any future Node server — the prerequisite the Phase 9 desktop shell needs. A configurable `workspaceRoot` replaces the hardcoded `process.cwd()`.
- **10 new tests** (`devApiServer.test.ts`: loopback/cross-origin/token/production gate matrix, workspace writes, external-dir confirm-path flow, path-escape rejection) → now **106 tests across 10 suites**.
### 🧩 Zustand Store Refactor into Typed Slices
- **The monolithic `useIdeStore` is now a slim composition of typed slices** under `src/store/`: shared types (`types.ts`, incl. `StoreSlice<T> = StateCreator<IDEState, [], [], T>`), domain defaults (`defaults.ts`: the 5 example projects, custom targets, polyglot config, layout), and per-concern slices (`slices/logsSlice.ts`, `editorSlice.ts`, `projectsSlice.ts`, `settingsSlice.ts`, `generationSlice.ts`, `diskSlice.ts`).
- **Zero behavioral change**: every action, initial value, and cross-slice call (`setCode` syncing `sourceFiles`, `runGeneration` rooted at `main.ipl`, `switchProject` → `readArtifactFromDisk`, confirm-path retry in `writeArtifactToDisk`, 3-round clarification loop) is preserved byte-for-byte. The public API (`useIdeStore`) and the `ipl-studio-store-v6` persistence shape (partialize + onRehydrateStorage) are unchanged, so no component and no stored session needs migration.
- **Architectural benefit**: the store is now legible and independently testable per slice, and the `generationSlice`/`diskSlice` are self-contained enough to be reused by a future Node-side server module — a prerequisite for the Phase 9 desktop shell. Verified with typecheck, lint (0 errors), the full build, and the suite still green at **96 tests across 9 suites**.
### 🧠 Typed IPL Parser & Advisory Diagnostics (Milestone 1)
- **Typed AST Parser (`src/engine/iplParser.ts`)**: Full recursive-descent parser producing `IPLBlockNode` trees with block metadata (`verb`, `target`, `declarationType`, `properties`, `children`). Exposed as `parseIPLToTree`, `treeToIPLCode` (source-preserving round-trip), `validateIPLCode`, and a line-indexed `syntaxErrors` report.
- **Rails, not walls**: Diagnostic errors are `info | warning` severity only; generation is never blocked. Advisory checks flag `listen event` payloads without `try/catch`, views without `add entity`, and unused verbs — the LLM remains the final interpreter of ambiguity.
- **Data-driven grammar core (`src/engine/iplCore.ts`)**: `IPL_VERBS` (12 verbs) and `IPL_INTENT_TYPES` (7 intent types) are the single source of truth consumed by the parser, Monarch highlighting, and Monaco `IPL_LANGUAGE_DEFINITION`.
- **Monaco/IDE integration**: IPL syntax highlighting via `IPL_LANGUAGE_DEFINITION`, block-tree viewer with collapsible AST nodes, and inline diagnostics bound to the Monaco error markers.
### 📐 Data-Driven Grammar Signature (Milestone 2)
- **`grammarSignatureText()`** in `src/engine/iplCore.ts` renders the 12 canonical verbs + 7 intent types into a canonical grammar signature embedded in the **Pass 1 & Pass 2 LLM prompts**, so the LLM vocabulary can never drift from the parser and the editor.
- **Monarch `typeKeywords` generated from `IPL_INTENT_TYPES`** — syntax highlighting stays in sync with the grammar data.
- **`scripts/gen-agent-guide.ts` + `npm run doc:guide`**: Regenerates the verb/type tables of `IPL_AGENT_GUIDE.md` from `iplCore.ts` (marker-delimited blocks), eliminating copy-paste drift between the agent guide and the engine.
### 🔍 Semantic Verification (Milestone 3)
- **`src/engine/iplSemantics.ts`**: Advisory cross-reference analyzer on top of the typed AST, merged into `validateIPLCode` so every store call site, Monaco marker, and the "Advisory Check(s)" badge pick it up automatically. All checks are `info`/`warning` only — generation is never blocked:
  - **Duplicate declarations** (`warning`): top-level `add entity` / `add module` / `add view` reusing the same name.
  - **Unknown intent type** (`info`): bare-identifier field types in `add entity` / `add module` outside the 7 types (e.g. `age: integer`).
  - **Unprotected I/O in listeners** (`info`): `read` / `search` / `send` / `remove` / `compute` inside a `listen` body without an enclosing `try/catch`.
  - **Unknown set target** (`info`): `set <name>.field = ...` where `<name>` is never declared or produced anywhere in the spec.
- **Parser**: `add view <Name>` is now a first-class declaration kind (`entityKind: 'view'`) so the guide's canonical `add view` syntax parses with the correct name.
### 🧪 Automated Test Suite (Vitest)
- **First test infrastructure**: `vitest` added as a dev dependency with `npm test` (one-shot) and `npm run test:watch` (watch mode).
- **38 tests across 3 suites** locking in the engine's behavior:
  - `iplParser.test.ts` (22): tokenizer/comment handling, `add`/`add view`, targeted verbs, `set`, control flow (`listen`/`if`/`for`/`try`/`return`), generic statements, diagnostics, `validateIPLCode` shape, and `parseIPLToTree` block trees.
  - `iplSemantics.test.ts` (10): zero false positives on the canonical example, duplicate declarations, unknown intent types, unknown `set` targets, and try/catch protection checks.
  - `iplGrammar.test.ts` (6): combined `validateIPLCode` (syntax + semantics), the data-driven grammar signature tables, and Monarch `typeKeywords` derived from `IPL_INTENT_TYPES`.
### ⚡ Automated Benchmark Harness & Roadmap
- **`ROADMAP.md`**: new canonical roadmap (the original was lost) — completed M0-M3 + T1, upcoming Phases 4-10 with objectives, scope, and acceptance criteria.
- **`scripts/run-benchmark.ts` + `npm run bench`**: end-to-end "moment of truth" for the 2-Pass engine. Runs the real Pass 1 + Pass 2 prompts, parses the artifact with the real `parseMultiFileXml`, writes to `output/benchmark/`, and verifies (run command / marker / ES-module scan / `node --check`). Emits a Markdown report with PASS/WARN/FAIL, per-pass latency, token estimates, and file counts.
  - `--mode mock` = offline pipeline smoke test (no API key or network needed).
  - `--mode external|lmstudio|local` + `.env`-aware API key resolution for real endpoints.
  - `--python <venvDir|exe>` = resolve the `python` command via a venv `Scripts` dir or a direct exe path (e.g. `--python D:\...\.venv\Scripts`).
  - Entry-point discovery: if `main.py`/`index.js` is missing at the root but exists deeper (e.g. `src/app.py`), the verifier retries with the discovered path before failing — measuring "is the app runnable?" rather than "is it named exactly as the spec?".
  - ES-module usage (`<script type="module">`) always FAILs `html` targets (the documented CORS/`file://` failure mode).
- **Node-compatible engine**: `artifactGenerator.ts` now imports the browser-only `file-saver` lazily inside `downloadProjectZip`, so the parser + artifact pipeline run under plain Node (benchmarks/CLI tooling).
- **Prompt builders exported** from `llmGenerator.ts` (`buildLangInstruction`, `buildPass1Prompt`, `buildPass2Prompt`) enabling per-pass measurement in the harness.
- **Real-endpoint validation** against `deepseek-chat`: first real run **60% first-try PASS, 0 FAIL** (WARNs only from missing local Python and a `node-hello` entry-point miss). Phase 4 acceptance criteria met.
### 🤖 Self-Healing Repair & Metrics (Phase 5)
- **Deterministic pre-repair (`src/engine/deterministicRepair.ts`)**: LLM-independent fixes for the two documented cloud failure modes — strips `type="module"` from `<script>` in HTML (CORS/`file://` hazard) and injects the Tailwind CDN when `class=` attributes are used without it. No tokens spent when these resolve the failure.
- **Benchmark repair loop**: `--repair-passes <n>` (default 3) — on a first-try FAIL the harness first applies deterministic fixes, then calls `refineIPLArtifact` fed with the captured stderr, up to `n` passes. Each run records `repairsToSuccess` (`0` = first-try PASS, `1..N` = passes needed, `-1` = never recovered) plus per-pass repair details.
- **Repair metrics in the report**: summary gains a **Repairs** column and **Success-after-repair rate**; detailed runs list every deterministic/LLM repair applied with the pass number.
- **`output/benchmark/history.json` + Trend section**: every run is persisted (last 50 kept); the report compares each spec's first-try PASS% against the previous runs for this model with ▲/▼ regression markers.
- **Pre-generation IPL quick-fixes (`src/engine/iplQuickFix.ts`)**: before a spec reaches the model, fixable diagnostics (unterminated string, unclosed block) are applied deterministically on a copy — the model receives clean input while the user's editor buffer is never modified; unresolved advisories still pass through (rails, not walls). Wired into `runGeneration`.
- **`autoDebugAndFix` upgrade**: the in-IDE self-healing loop now runs deterministic pre-repair *before* spending an LLM repair call.
- **`NEED_CLARIFICATION` interactive loop**: when the LLM cannot fix confidently without a precision it replies `NEED_CLARIFICATION: <question>` (never guesses). The agent pauses, surfaces the question in the terminal prompt, waits for the user's answer, then re-runs the LLM repair with that precision and verifies by re-executing the command — looping up to 3 clarification rounds. In the benchmark, a clarification request is recorded honestly (WARN + `clarification requested by model`, no guessed repair).
- **`vitest.config.ts`**: test discovery restricted to `src/**/*.test.ts` so benchmark artifacts in `output/` (e.g. a generated `test/greeter.test.js`) never leak into the suite. Now **54 tests across 6 suites**.
### 🧪 Golden Execution Tests — "does the generated app actually run?"
- **New `golden/` fixture suite** (4 canonical specs: `hello-py`, `hello-node`, `multi-file-python`, `typed-order-python`). Each fixture = `spec.ipl` + a **frozen `artifact.xml`** (no LLM at test time → fully deterministic) + `golden.json` (command + expected exit code/stdout).
- **`src/engine/goldenExecution.test.ts`**: parses the frozen artifact with the real `parseMultiFileXml` (regression proof of the parser), writes the files to a temp sandbox, executes the configured command, and asserts exit code + stdout. Runtime probing (`node` / `python` / `python3` / `py`, overridable via `IPL_GOLDEN_PYTHON`) skips fixtures whose runtime is missing instead of failing.
- **Regression check confirmed**: corrupting an artifact fails the suite with a clear diff — the harness really verifies *execution*, not just parsing. → now **96 tests across 9 suites**.
### 🛡️ Security Hardening for the Dev-Only APIs (Phase 8)
- **Token auth (`IPL_DEV_TOKEN`)**: every dev endpoint (`/api/run-command`, `/api/write-artifact`, `/api/read-disk`, `/api/confirm-path`, `/api/git/*`) now requires the `X-IPL-Token` header whenever a token is configured; `401` otherwise. The client routes every call through a new `src/services/api.ts` (`apiFetch`) that attaches the token automatically (injected via the `__IPL_DEV_TOKEN__` define).
- **`--production` flag**: `npm run dev:secure` (wrapper script `scripts/dev-secure.mjs`) or `IPL_PRODUCTION=1` disables **all** dev endpoints with `403` unless auth is configured — Vite's CLI rejects unknown flags, so the flag is implemented via the wrapper + env detection.
- **Loopback-only + CSRF guard**: requests with a non-`localhost` `Host` header are rejected (DNS-rebinding), and without a token any request carrying a cross-origin `Origin` header is rejected too.
- **External write confirmation**: writing to a directory outside the project workspace now returns `403 PATH_CONFIRMATION_REQUIRED`; the app asks the user once, confirms via `/api/confirm-path`, and retries. No endpoint writes outside an explicit, user-confirmed target directory.
- **Command allow-list**: `IPL_ALLOWED_COMMANDS=node,python` restricts `/api/run-command` server-side (`403 COMMAND_NOT_ALLOWED`). Independently, the terminal panel flags commands outside its shared allow-list (`src/engine/security.ts`) and requires an inline **Allow once / Cancel** approval before executing.
- **11 new tests** (`security.test.ts`: allow-list parsing, executable prefix extraction incl. `./`, `../`, Windows drive paths, and default policy) → now **92 tests across 8 suites**. Full guard matrix verified against a live dev server (production/no-token 403s, 401/200 token flow, allow-list, confirm-path, cross-origin).
### 🧩 Multi-File IPL Modules End-to-End (Phase 7)
- **Recursive import resolution (`resolveIPLProject`)**: `import "submodule.ipl"` directives are now followed depth-first through nested imports, cycle-guarded (a repeated/cyclic include is replaced with an explicit `already included above` comment instead of recursing forever), and any import missing from the project's file map is reported in a `unresolved` list instead of failing silently.
- **Cross-file semantic analysis (`validateIPLProject`)**: merges main + transitive imports into one document *before* running syntax + semantics, so duplicate declarations and unknown `set` targets are detected **across files** — e.g. a submodule `set orderData.status = ...` now resolves against `add entity orderData` declared in `main.ipl`; unresolved imports surface as project-wide `warning` diagnostics.
- **Editor → file-map sync**: `setCode` now writes the live buffer into `sourceFiles[activeSourceFile]`, so submodule edits made in Monaco are no longer lost to the importer.
- **Deterministic generation root**: `runGeneration` builds the union rooted at `main.ipl` regardless of which file is active, applies pre-generation quick-fixes on the merged union, and logs every unresolved import. Backwards-compatible `resolveIPLImports` wrapper retained.
- **9 new tests** (`resolveIPLProject` single/nested/cycle/diamond/unresolved + `validateIPLProject` cross-file refs/duplicates/unresolved) → now **63 tests across 6 suites**.
### 🧭 Semantic UX — Diagnostics Become Helpful (Phase 6)
- **Dedicated Diagnostics panel**: new bottom-panel tab listing every advisory for the active file with a **severity filter** (All / Warnings / Info), **jump-to-line** (`revealPositionInCenter`), fixable counts, and a **Fix** button on any diagnostic carrying a quick-fix (via the new `applySingleQuickFix`).
- **Semantic reference index (`src/engine/iplRefs.ts`)**: deterministic symbol table over the three reference kinds — `declared` (`add entity|module|view`), `produced` (`read`/`remove`/`search`/`send`/`compute`/`for`-item), `event` (`listen event on "..."`). The Monaco **go-to-definition** (F12 / Ctrl+Click) and **hover** now resolve all three, including quoted event names containing `:` (`"checkout:completed"`), with zero false positives on property fields and option values (verified against the canonical order spec).
- **Block-tree semantic state**: every block node is annotated `declared` / `produced` / `unknown` with color-coded badges in the visual editor (`annotateBlockNodes`).
- **Two new editor-actionable quick-fixes**: missing `=` in `set` ("Insert \" = \"") and unknown intent type ("Replace X with text"). The unknown-intent-type fix is flagged `auto: false` — actionable in the editor/panel but **never** auto-applied by the deterministic pre-generation repair (lossy guess).
- **18 new tests** (`iplRefs.test.ts` 16: index, resolution, reference extraction, statement names, annotation; `iplQuickFix.test.ts` +2: missing-`=` auto-fix, intent-type non-auto) → now **81 tests across 7 suites**.
### 🧲 AST Block Reorder (drag & drop)
- Existing blocks in the visual editor are now **draggable**: pick a block up and drop it on the thin **reorder bars** (appear between blocks during a drag) to move it **before/after** any other block, including across containers. Dropping onto a container's dashed nest zone **nests** the block inside it (cycle-guarded). Palette verbs can also be dropped onto the reorder bars to insert a new block at that position. The dragged block dims while in flight; targets highlight cyan on hover.
### 🌍 Internationalization (French → English)
- Translated all remaining French UI strings, comments, tutorials (`iplTutorialLessons.ts` fully rewritten), artifact content, and config comments to English.
### 📁 Projects Outside the Workspace
- Absolute output paths now allow creating projects anywhere on the machine. Relative paths remain sandboxed inside the workspace, and traversal outside it is rejected with a clear error. `ProjectModal` explains both behaviors.
### 🏷️ Terminology Rename (Compiler → Generator)
- **`compiler` / `compilation` → `generator` / `generation`**: IPL is not a formal language compiler but an intent-to-code **generation engine** driven by LLMs. All identifiers, logs, UI labels, and docs now use the **Generator / Generation** vocabulary:
  - `compileIPL` → `generateIPL`, `llmCompiler.ts` → `llmGenerator.ts`
  - `compiledCode` → `generatedCode`, `isCompiling` → `isGenerating`, `runCompilation` → `runGeneration`
  - README and `IPL_AGENT_GUIDE.md` updated to "LLM Code Generator Engine" / "LLM Code Generators".

---

## 🚧 [Unreleased]


## 🚀 [v1.2.0] — 2026-08-06 (Architectural Pure Intent Release)

### 🌟 Compiler & Architecture Breakthroughs
- **Structured Pseudo-Code Intent Engine**: Reframed the compiler system prompts (Pass 1 & Pass 2) to treat IPL strictly as structured pseudo-code business requirements. LLMs now generate clean, real-world production code without over-engineering fake IPL parsers, AST interpreters, or reference mapping tables.
- **Adaptive Topology & Optional Multi-File**: Refactored Pass 1 Architect guidance to produce multi-file structures ONLY IF NEEDED based on actual business complexity, eliminating micro-file fragmentation for simple tasks.
- **Elevated Architect Temperature (0.4)**: Configured Pass 1 (Topology Architect) to run at temperature `0.4` for creative, cohesive module grouping while keeping Pass 2 (Code Generator) deterministic (`0.15`) for bug-free code.
- **Bulletproof Fallback Parser**: Upgraded `parseMultiFileXml` in `artifactGenerator.ts` to automatically extract Markdown codeblocks (````html ````, ````css ````, ````js ````) and detect file path comments when LLMs omit `<file path="...">` XML tags, completely eliminating `.pll` fallback issues.

### 🛡️ UI & Stability Enhancements
- **Compilation Safety Net (`try / catch / finally`)**: Wrapped `runCompilation` in a `try/finally` block guaranteeing `isCompiling` is reset to `false` even on HTTP 401/400 API errors.
- **Compiler Overlay Control**: Added instant **Annuler / Réinitialiser** and **Paramètres ⚙️** buttons on the 2-Pass LLM Compiler spinner overlay, allowing key adjustments without page reloads.
- **Clean Tailwind CDN Integration**: Ensured standalone HTML web applications automatically load Tailwind Play CDN unless custom build pipelines are specified.

---

## 📦 [v1.1.0] — 2026-08-06

### 🌟 New Features & Enhancements
- **LM Studio Integration**: Added native support for LM Studio local streaming API (`http://localhost:1234`) with one-click mode selection in Settings.
- **7 Human Intent Types**: Introduced constrained deterministic type declarations (`text`, `number`, `boolean`, `id`, `date`, `options(...)`, `list`) in IPL grammar and the visual palette.
- **Monaco Target Code Viewer**: Integrated read-only Monaco Editor in the project files inspector supporting automatic syntax highlighting for JavaScript, Python, Rust, HTML, CSS, JSON, C++, Go, Batch, Markdown, and IPL.
- **Bi-Directional Disk Sync (`Disk ➔ IDE` & `IDE ➔ Disk`)**: Pull physical files from disk to IDE memory automatically, cleaning up deleted disk files seamlessly.
- **Interactive Column Resizing**: Drag-to-resize sidebars (Left & Right columns) with double-click reset and Zustand session persistence.
- **Enhanced Multi-File Navigation**: Added a quick dropdown file picker (`📄 1/22`) and chevron scroll buttons + mouse wheel horizontal scrolling for 20+ file projects.
- **Copy Disk Path Button**: Added 1-click button with visual checkmark feedback to copy absolute project output directory paths.
- **Example Template Labeling**: Marked default template projects with `[Exemple]` prefix for clear distinction.

### 🐛 Bug Fixes & Stability
- **Ultra-Robust XML Parser**: Rewrote `parseMultiFileXml` in `artifactGenerator.ts` to handle unclosed or omitted `</file>` tags cleanly without merging adjacent files.
- **Empty Compiled Code Fix**: Fixed `buildProjectArtifact` returning dummy boilerplate files when disk directory was emptied.
- **Session Persistence**: Persisted active IPL code, target language, and compiled output state across browser refreshes (`ipl-studio-store-v6`).
- **Responsive Type Chips Wrapping**: Applied `flex-wrap` layout to Intent Type chips and categories so all 7 types remain 100% visible on narrow sidebars.

---

## 📦 [v1.0.0] — 2026-08-01 (Initial Release)

### 🌟 Core Capabilities
- Initial release of **IPL Studio IDE**.
- Declarative domain modeling powered by 12 canonical verbs.
- Polyglot 2-Pass LLM Compiler Engine (Pass 1 Topology JSON, Pass 2 XML Generator).
- Autonomous self-healing agent debug loop.
- Embedded terminal (`xterm.js`) & runner API (`/api/run-command`).
- Monarch syntax highlighting & AST block view editor.
