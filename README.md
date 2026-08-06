# ⚡ IPL Studio v1.0 — Intent Programming Language IDE & Autonomous Agent

[![Vite](https://img.shields.io/badge/Vite-5.x-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React-18.x-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-3.x-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)

> **IPL Studio** is an AI-powered polyglot, intent-based IDE with autonomous agentic capabilities. It transforms high-level declarative specifications written in **IPL (Intent Programming Language)** into runnable, multi-file codebases (Rust, Python, Node.js, Go, C++, HTML5, Java, etc.) written directly to disk.

---

## 🌟 Key Features

### 🧠 1. Intent Programming Language (12 Canonical Verbs & 7 Human Intent Types)
- **12 Action Verbs**: Declarative domain operations (`add`, `read`, `set`, `remove`, `search`, `send`, `listen`, `compute`, `if`, `for`, `try`, `return`).
- **7 Human Intent Types**: Constrained deterministic type declarations:
  - `text`: Strings & emails
  - `number`: Numeric floats, amounts & counts
  - `boolean`: True/false flags
  - `id`: Unique identifiers & UUIDs
  - `date`: Timestamps & dates
  - `options(...)`: Choice lists & enums
  - `list`: Collections & arrays
- Monarch syntax highlighting powered by **Monaco Editor** and visual AST block representation.

### 🌐 2. Polyglot 2-Pass LLM Compiler Engine
- **Pass 1 (Architect)**: Analyzes domain intent and designs multi-file project topology in JSON.
- **Pass 2 (Generator)**: Synthesizes complete XML-tagged source code files with real-time streaming (LM Studio / Ollama / Cloud APIs).
- **Bi-Directional Disk Sync**: Physical file materialization (`IDE ➔ Disk`) and pull synchronization (`Disk ➔ IDE`).

### 🎨 3. Read-Only Monaco Editor with Auto-Syntax Highlighting for Output Files
- Integrated **Monaco Editor** in the Project Files viewer for generated code.
- Automatic syntax highlighting for JavaScript, Python, Rust, HTML, CSS, JSON, C++, Go, Batch, Markdown, and IPL files.
- Fast file dropdown picker and scrollable navigation tabs to inspect 20+ file projects seamlessly.

### 🤖 4. Autonomous Self-Healing Agent Debug Loop
- **Error Detection & Diagnostics**: Captures terminal stderr output (`Traceback`, non-zero exit codes).
- **Auto-Fixing**: Analyzes stacktraces via AI, refactors affected files, and re-executes tests automatically (up to 3 repair passes).

### 🖥️ 5. Embedded Terminal (`xterm.js`) & Runner
- Integrated `xterm.js` terminal runner for `cargo run`, `python main.py`, `node index.js`, `go run main.go`, etc.
- Real-time stdout/stderr streaming via Node.js middleware API (`/api/run-command`).

### 🔀 6. Integrated Git Version Control & Monaco Side-by-Side Diff
- Native **Monaco DiffEditor** integration to inspect side-by-side code changes between original specification and generated code.
- Interactive version control directly within the IDE (`git status`, `git diff`, staging & committing).

### 📂 7. Multi-File `.ipl` Source Tree & Import Preprocessor
- Organize complex IPL specifications into multiple `.ipl` files (`main.ipl`, `models.ipl`, `events.ipl`).
- Transparent import resolution: `import "submodule.ipl";`.

### 🧠 8. Semantic Language Server (LSP) Features
- **Go to Definition ($F12$ / Ctrl+Click)**: Instantly jump to declared symbols and entity lines in Monaco.
- **Hover Provider**: Rich Markdown tooltips showing verb documentation, snippets, and symbol definitions on hover.
- **Contextual Autocomplete**: Smart suggestions for IPL verbs, intent types, and declared project symbols.

### 💬 9. Interactive LLM Architect Chat Panel & Custom Resizable Panels
- Dedicated chat interface next to the project file inspector for interactive refactoring.
- Interactive drag-to-resize sidebars with double-click reset and session layout persistence.

---

## 📐 Architecture Overview

```mermaid
flowchart TD
    A[Monaco Code / AST Blocks] -->|Write Intent DSL| B[resolveIPLImports Preprocessor]
    B -->|Unified IPL Code| C[2-Pass LLM Compiler]
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
├── src/
│   ├── components/           # UI components (Monaco, Terminal, Git, Chat, Inspector, etc.)
│   ├── engine/               # LLM Compiler engine, IPL Grammar, Artifact Generator
│   ├── store/                # Zustand global store (IDE State, Layout Persistence)
│   ├── App.tsx               # Main IDE Layout
│   └── main.tsx              # React Entrypoint
├── vite.config.ts            # Vite config & API Middlewares (/api/run-command, /api/read-disk)
├── package.json
└── README.md
```

---

## 📄 License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

---

<p align="center">Built with ❤️ for Intent-Based Programming & Autonomous AI Agents.</p>
