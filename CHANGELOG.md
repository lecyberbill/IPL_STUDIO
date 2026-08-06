# 📋 IPL Studio Release Notes & Changelog

All notable changes to **IPL Studio** are documented in this file.

---

## 🚀 [v1.1.0] — 2026-08-06 (Current Release)

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
