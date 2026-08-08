# 📋 IPL Studio Release Notes & Changelog

All notable changes to **IPL Studio** are documented in this file.

---

## 🚧 [Unreleased]

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
  - ES-module usage (`<script type="module">`) always FAILs `html` targets (the documented CORS/`file://` failure mode).
- **Node-compatible engine**: `artifactGenerator.ts` now imports the browser-only `file-saver` lazily inside `downloadProjectZip`, so the parser + artifact pipeline run under plain Node (benchmarks/CLI tooling).
- **Prompt builders exported** from `llmGenerator.ts` (`buildLangInstruction`, `buildPass1Prompt`, `buildPass2Prompt`) enabling per-pass measurement in the harness.
- **Real-endpoint validation** against `deepseek-chat`: first real run **60% first-try PASS, 0 FAIL** (WARNs only from missing local Python and a `node-hello` entry-point miss). Phase 4 acceptance criteria met.

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
