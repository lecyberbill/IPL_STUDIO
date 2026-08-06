# 📊 IPL Studio v1.0 — LLM Benchmark Suite: "Hello World" Multi-Model Comparison

> **Objective**: Compare architectural choices, file topology, rendering quality, and **real friction/bugs encountered** across different local and cloud LLM models given the **exact same IPL intent specification** and target stack.

---

## 🧪 Benchmark Protocol & Test Setup

- **IDE Version**: IPL Studio v1.0
- **Target Stack**: Frontend UI: `HTML5 / CSS / JavaScript (Vanilla / Tailwind)` / Polyglot Target
- **Sampling Temperature**: `0.0` (Greedy deterministic)

### Canonical IPL Intent Specification:
```ipl
// IPL Project v1.0 - Hello World
add message {
  text: "Hello World IPL Studio v1.0",
  target: "console"
}

compute timestamp from system
send message to screen
return success
```

---

## 🏆 Comparative Summary Table

| Model Name | Execution Mode | Footprint | File Count | Architectural Style | Friction & Bugs Encountered | Final Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Liquid LFM-2** | Local (LM Studio) | ~1.5B – 3B (~2 GB RAM) | 3 files | Minimalist single-card UI, direct DOM binding | Required Tailwind CDN tag in `<head>` for CSS gradient rendering | ✅ **SUCCESS** |
| **Bonsai 27B** | Local (PrismML 1-bit) | 27B (~3.9 GB RAM) | 12 files | Modular Event-Bus (IPC), separate `state.js`, `ipl-runtime.js` | Leaked Markdown subtitles between XML tags; omitted auto-exec on page load | ✅ **SUCCESS (After Parser Fix)** |
| **Google Gemma 4-26B (a4b)** | Local (LM Studio) | 26B (~17 GB RAM) | 7 files | Multi-card UI with embedded dark terminal (`consoleOutput.js`) | **None (0 Bug, 0 Friction)**. Included Tailwind CDN & auto-execution out-of-the-box | ⭐ **PERFECT (1st Try)** |
| **DeepSeek (Local)** | Local (LM Studio) | ~7B / 14B / 33B | 14+ files | Redundant multi-language demo scripts | **FAILURE (Hors-Sujet)**: Did not build an application; generated 5 redundant hello world scripts in Rust/Go/Python/Node/C++ instead of choosing a cohesive architecture | ❌ **FAILURE (Off-Target)** |

---

## 🔍 Detailed Model Test Profiles

### 1. 🟢 Liquid LFM-2 (Local LM Studio)
* **Mode**: 100% Local (LM Studio on `http://localhost:1234`)
* **Footprint**: ~2 GB RAM
* **File Topology (3 files)**:
  * `index.html` (Glassmorphism card UI with Tailwind)
  * `css/styles.css`
  * `js/main.js` (Direct DOM binding & ISO timestamp formatting)
* **Architectural Approach**: Highly compact and token-efficient. Generates a clean single JS script with direct execution on page load.
* **Friction / Bugs Encountered**:
  - Raw HTML output required `<script src="https://cdn.tailwindcss.com"></script>` in `<head>` to render Tailwind utility classes out-of-the-box in standalone browser windows.
* **Final Assessment**: Clean, functional, and visually striking rendering.

---

### 2. 🌳 Bonsai 27B (PrismML 1-bit Binary / Ternary)
* **Mode**: 100% Local (LM Studio on `http://localhost:1234`)
* **Footprint**: ~3.9 GB RAM (27 Billion Parameters compressed to 1.125-1.71 bits)
* **File Topology (12 files)**:
  * `index.html`
  * `css/styles.css`
  * `js/main.js`, `js/ipl-runtime.js`, `js/timestamp.js`, `js/screen-output.js`, `js/console-output.js`, `js/state.js`, `js/ipc.js`, `js/config.js`
  * `package.json`, `tailwind.config.js`, `Makefile`, `README.md`
* **Architectural Approach**: Highly modular Enterprise event-bus pattern (`ipcBus`, `stateManager`, decoupled `ipl-runtime.js` parser).
* **Friction / Bugs Encountered**:
  1. **Markdown Leakage**: Outputted conversational Markdown section titles (e.g., `## 3. Create src/constants.js if it doesn't exist`) between XML file tags, which contaminated file outputs until the IDE XML parser was updated to truncate strictly at `</file>`.
  2. **Manual Execution Trap**: Omitted auto-triggering `this.runIPL()` inside `DOMContentLoaded`, initially requiring a manual button click to display output.
* **Final Assessment**: Extremely sophisticated multi-module architecture, but higher structural friction on 1-bit quantization.

---

### 3. 🔵 Google Gemma 4-26B a4b (Local LM Studio)
* **Mode**: 100% Local (LM Studio on `http://localhost:1234`)
* **Footprint**: ~17 GB RAM / VRAM (26 Billion Parameters model)
* **File Topology (7 files)**:
  * `index.html` (Responsive multi-card UI with embedded dark console window)
  * `css/styles.css`
  * `js/main.js`, `js/iplInterpreter.js`, `js/timestamp.js`, `js/consoleOutput.js`
  * `README.md` & `source/main.ipl`
* **Architectural Approach**:
  * Perfect balance between clean modularity (7 files) and rich UI design.
  * Intelligent UX touch: Created a **live embedded terminal window with glowing green text on a black background** (`#console-output`) to visualize real-time IPL execution logs alongside the message card!
* **Friction / Bugs Encountered**:
  - **ZERO FRICTION (0 Bug, 0 Friction)**. Spontaneously included `<script src="https://cdn.tailwindcss.com"></script>` in `<head>`, formatted clean XML tags, and executed flawlessly on the very first attempt without any intervention.
* **Final Assessment**: **10/10 — Perfect Score**. Highest quality code generation and UI aesthetics in local execution.

---

### 4. 🔴 DeepSeek (Local LM Studio)
* **Mode**: 100% Local (LM Studio on `http://localhost:1234`)
* **File Topology (14+ files across 5 ecosystems)**:
  * **Rust** : `Cargo.toml`, `src/main.rs`
  * **Go** : `go.mod`, `main.go`
  * **Python** : `requirements.txt`, `main.py`
  * **Node.js** : `package.json`, `index.js`
  * **C++** : `CMakeLists.txt`, `src/main.cpp`
  * **IPL Reference Parser** : `ipl_parser/`
  * **Test Suite** : `tests/test_hello_world.py`
* **Architectural Approach**:
  * **Hors-Sujet & Non-respect de la consigne d'architecture** : Au lieu de faire un choix d'architecture applicatif cohérent (ex: sélectionner l'écosystème le plus adapté pour construire l'application), DeepSeek a produit 5 déclinaisons "Hello World" isolées et redondantes dans 5 langages différents.
* **Friction / Bugs Encountered**:
  - **Échec Fonctionnel** : N'a pas construit d'application utilisable ni d'interface UI responsive demandée, mais un livre d'exemples de démonstration multi-langages.
* **Final Assessment**: **❌ ÉCHEC (Hors-Sujet)**. A confondu "Choix d'architecture Polyglotte" avec "Générer un exemple dans chaque langage existant".

---

*This benchmark document is updated transparently as new local and cloud models are tested.*
