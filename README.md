# ⚡ IPL Studio v1.0 — Intent Programming Language IDE & Autonomous Agent

[![Vite](https://img.shields.io/badge/Vite-8.x-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React-19.x-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-4.x-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Changelog](https://img.shields.io/badge/Release_Notes-v1.2.0-blue.svg?style=for-the-badge)](CHANGELOG.md)
[![LLM Agent Guide](https://img.shields.io/badge/Agent_Prompt-IPL_Guide-purple.svg?style=for-the-badge)](IPL_AGENT_GUIDE.md)
[![Benchmark Suite](https://img.shields.io/badge/Benchmark-Hello_World-orange.svg?style=for-the-badge)](BENCHMARK_HELLO_WORLD.md)
[![Roadmap](https://img.shields.io/badge/Roadmap-Phases_4--10-teal.svg?style=for-the-badge)](ROADMAP.md)
[![License](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)

> **IPL Studio** is an AI-powered polyglot, intent-based IDE with autonomous agentic capabilities. It transforms high-level declarative specifications written in **IPL (Intent Programming Language)** into runnable, multi-file codebases (Rust, Python, Node.js, Go, C++, HTML5, Java, etc.) written directly to disk.

---

## 🤖 LLM Agent Instruction Sheet & System Prompt

Want to teach your favorite AI model (ChatGPT, Claude, DeepSeek, Ollama, LM Studio, Cursor, Copilot) how to write valid IPL code natively? 

Copy-paste **[IPL_AGENT_GUIDE.md](IPL_AGENT_GUIDE.md)** into your prompt instructions!

---

## 📋 Release Notes & Version History

See [CHANGELOG.md](CHANGELOG.md) for the complete list of release notes, version history, new features, and bug fixes across all releases.

---

## 🌟 Core Architecture & Capabilities

### 🧠 1. Intent Programming Language Specification
- **12 Action Verbs**: Declarative domain operations (`add`, `read`, `set`, `remove`, `search`, `send`, `listen`, `compute`, `if`, `for`, `try`, `return`).
- **7 Human Intent Types**: Constrained type declarations (`text`, `number`, `boolean`, `id`, `date`, `options(...)`, `list`).
- Monarch syntax highlighting powered by **Monaco Editor** and visual AST block representation.
- **Typed AST Parser**: `parseIPLToTree` / `validateIPLCode` produce line-indexed, advisory-only diagnostics ("rails, not walls") — generation is never blocked, and the LLM remains the final interpreter of ambiguity.
- **Semantic Verification**: `src/engine/iplSemantics.ts` cross-references the AST for duplicates, unknown intent types, unprotected `listen` I/O, and unknown `set` targets — all surfaced as `info`/`warning` squiggles and quick advisory checks.
- **Single-Source-of-Truth Grammar**: `src/engine/iplCore.ts` defines the verbs + intent types; the same `grammarSignatureText()` is embedded in the Pass 1 / Pass 2 prompts and regenerates `IPL_AGENT_GUIDE.md` via `npm run doc:guide`, so the vocabulary can never drift.

### 🌐 2. Polyglot 2-Pass LLM Code Generator Engine
- **Pass 1 (Architect)**: Analyzes domain intent and designs multi-file project topology in JSON.
- **Pass 2 (Generator)**: Synthesizes complete XML-tagged source code files with real-time streaming (LM Studio / Ollama / Cloud APIs).
- **Bi-Directional Disk Sync**: Physical file materialization (`IDE ➔ Disk`) and pull synchronization (`Disk ➔ IDE`).

### 🤖 3. Autonomous Self-Healing Agent Debug Loop
- **Error Detection & Diagnostics**: Captures terminal stderr output (`Traceback`, non-zero exit codes).
- **Auto-Fixing**: Analyzes stacktraces via AI, refactors affected files, and re-executes tests automatically (up to 3 repair passes).

### 🖥️ 4. Embedded Terminal (`xterm.js`) & Runner
- Integrated `xterm.js` terminal runner for `cargo run`, `python main.py`, `node index.js`, `go run main.go`, etc.
- Real-time stdout/stderr streaming via Node.js middleware API (`/api/run-command`).

### 🔀 5. Integrated Git Version Control & Monaco Side-by-Side Diff
- Native **Monaco DiffEditor** integration to inspect side-by-side code changes between original specification and generated code.
- Interactive version control directly within the IDE (`git status`, `git diff`, staging & committing).

### 📂 6. Multi-File `.ipl` Source Tree & Import Preprocessor
- Organize complex IPL specifications into multiple `.ipl` files (`main.ipl`, `models.ipl`, `events.ipl`).
- Transparent import resolution: `import "submodule.ipl";`.

### 🧠 7. Semantic Language Server (LSP) Features
- **Go to Definition ($F12$ / Ctrl+Click)**: Instantly jump to declared symbols and entity lines in Monaco.
- **Hover Provider**: Rich Markdown tooltips showing verb documentation, snippets, and symbol definitions on hover.
- **Contextual Autocomplete**: Smart suggestions for IPL verbs, intent types, and declared project symbols.

---

## 📐 Architecture Overview

```mermaid
flowchart TD
    A[Monaco Code / AST Blocks] -->|Write Intent DSL| B[resolveIPLImports Preprocessor]
    B -->|Unified IPL Code| C[2-Pass LLM Code Generator]
    C -->|Pass 1 JSON Topology| D[LLM Architect / LM Studio / Ollama / DeepSeek]
    D -->|Pass 2 XML Files| E[Disk Writer /api/write-artifact]
    E -->|Write Files| F[Physical Directory ./output/project]
    F -->|Run Commands| G[Embedded Terminal xterm.js /api/run-command]
    G -->|Capture Errors| H{Success or Error ?}
    H -->|Error| I[🤖 Autonomous Self-Healing Agent]
    I -->|Fix Code| C
    H -->|Success 🎉| J[Materialized Project & Git Commit]
```

---

## 🛠️ Quick Start & Installation

### Prerequisites
- **Node.js** v18+ and **npm**
- *(Optional for 100% local offline mode)* **LM Studio** or **Ollama** running locally.

### 1. Clone the GitHub Repository
```bash
git clone https://github.com/lecyberbill/IPL_STUDIO.git
cd IPL_STUDIO
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Start Development Server
```bash
npm run dev
```
Open your browser at [http://localhost:5173](http://localhost:5173).

### 4. Run the Test Suite
```bash
npm test        # one-shot
npm run test:watch
```
38 tests cover the IPL parser, the semantic analyzer, and the data-driven grammar signature.

### 5. Run the Automated Benchmark Harness
```bash
npm run bench -- --mode mock       # offline pipeline smoke test (no API key needed)
npm run bench -- --mode external   # real end-to-end against DeepSeek (needs VITE_DP_API_KEY)
npm run bench -- --mode lmstudio   # against a local LM Studio server
npm run bench -- --iterations 3    # more runs per spec for stable latency averages
```
Runs the real 2-Pass pipeline per spec, parses artifacts with the real parser, writes to `output/benchmark/`, and emits a Markdown report (PASS/WARN/FAIL, per-pass latency, token estimates). See [ROADMAP.md](ROADMAP.md) → **Phase 4**.

---

## ⚙️ LLM Engine Connection Modes

IPL Studio supports three execution modes configurable in the Settings modal (`⚙️`):

1. **Local LM Studio Server (Recommended for local offline)**:
   - Default Endpoint: `http://localhost:1234`
   - Streaming SSE OpenAI-compatible `/v1/chat/completions` without requiring API keys.
   - Ideal for models like `Liquid LFM-2`, `Llama 3.2`, `DeepSeek-Coder`.

2. **Local Ollama Server**:
   - Default Endpoint: `http://localhost:11434`
   - Recommended models: `qwen2.5-coder`, `llama3.2`, `mistral`, `codellama`.

3. **Cloud API Mode (DeepSeek / OpenAI Compatible)**:
   - Endpoint: `https://api.deepseek.com` (or any OpenAI-compatible API).
   - Dynamic API key configuration with secure client-side storage.

---

## 📁 Repository Structure

```text
IPL_STUDIO/
├── output/                   # Physical disk target folder for generated projects
├── scripts/                  # Dev utilities (gen-agent-guide.ts, run-benchmark.ts → npm run bench)
├── src/
│   ├── components/           # UI components (Monaco, Terminal, Git, Chat, Inspector, etc.)
│   ├── engine/               # LLM Code Generator engine, IPL Grammar, typed parser, Artifact Generator
│   ├── store/                # Zustand global store (IDE State, Layout Persistence)
│   ├── App.tsx               # Main IDE Layout
│   └── main.tsx              # React Entrypoint
├── vite.config.ts            # Vite config & API Middlewares (/api/run-command, /api/read-disk, /api/write-artifact)
├── CHANGELOG.md              # Detailed release notes and version history
├── ROADMAP.md                # Canonical roadmap (Phases 4-10) with acceptance criteria
├── package.json
└── README.md
```

---

## 📄 License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

---

<p align="center">Built with ❤️ for Intent-Based Programming & Autonomous AI Agents.</p>
