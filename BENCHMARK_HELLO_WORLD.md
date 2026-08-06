# 📊 IPL Studio v1.0 — LLM Benchmark Suite: "Hello World" Multi-Model Comparison

> **Objective**: Compare architectural choices, file topology, rendering quality, and **real friction/bugs encountered** across different local and cloud LLM models given the **exact same IPL intent specification** and target stack.

---

## 🧪 Benchmark Protocol & Test Setup

- **IDE Version**: IPL Studio v1.0
- **Target Stack**: Frontend UI: `HTML5 / CSS / JavaScript (Vanilla / Tailwind)`
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
| **Nvidia Nemotron 3 Nano 4B** | Local (LM Studio) | 4B (**2.84 GB RAM**) | 9 files | Header gradient blue/purple, tagged console log `[CREATED]`, `[SENT]`, `[SUCCESS]` | **None (0 Bug, 0 Friction)**. Pound-for-pound champion (2.84 GB), EventBus & Tailwind CDN included | ⭐ **PERFECT (10/10 1st Try)** |
| **GPT-OSS 20B** | Local (LM Studio) | 20B (12.11 GB RAM) | 8 files | Glassmorphism Neon Purple, latency benchmarking (`in 2.00ms`) & Timezone | **None (0 Bug, 0 Friction)**. Included Tailwind CDN, auto-exec & execution speed benchmarking | ⭐ **PERFECT (10/10 1st Try)** |
| **Bonsai 27B** | Local (PrismML 1-bit) | 27B (~3.9 GB RAM) | 12 files | Modular Event-Bus (IPC), separate `state.js`, `ipl-runtime.js` | Leaked Markdown subtitles between XML tags; omitted auto-exec on page load | ✅ **SUCCESS (After Parser Fix)** |
| **Google Gemma 4-26B (a4b)** | Local (LM Studio) | 26B (~17 GB RAM) | 7 files | Multi-card UI with embedded dark terminal (`consoleOutput.js`) | **None (0 Bug, 0 Friction)**. Included Tailwind CDN & auto-execution out-of-the-box | ⭐ **PERFECT (10/10 1st Try)** |
| **DeepSeek Coder V2 Lite Instruct** | Local (LM Studio) | ~16B / 2.4B active | 5 files | Dark Glassmorphic Dashboard with status indicators | **Runtime Crash**: Naive line-by-line regex parser in `ipl_interpreter.js` fails on multi-line `add message {}` block -> `IPL Error: Missing message definition` | ❌ **FAILURE (Runtime Bug)** |
| **Qwen AgentWorld 35B (a3b)** | Local (LM Studio) | 35B (~12 GB RAM) | 8 files | 2-Column Split Layout + Magenta Gradient Banner & EventBus JS | **None (0 Bug, 0 Friction)**. Included Tailwind CDN, EventBus, auto-execution & syntax-highlighted editor box | ⭐ **PERFECT (10/10 1st Try)** |
| **Microsoft Phi-4 Reasoning Plus** | Local (LM Studio) | ~14B (~9 GB RAM) | 6 files | Clean Card UI with Timezone Resolution | **None (0 Bug, 0 Friction)**. Included Tailwind CDN, auto-exec & dynamic Timezone (`Europe/Paris`) | ⭐ **PERFECT (10/10 1st Try)** |
| **DeepSeek Flash 4** | Cloud API | API Cloud | 6 files | White card UI with blue gradient & status placeholders | **CORS Execution Blocking**: Used ES6 modules (`<script type="module">` & `import`). Browsers block local ES imports over `file://`, freezing page on `Loading...` | ❌ **FAILURE (ES Module / CORS)** |
| **Google Gemini 3.1 Flash Lite** | Cloud API | API Cloud | 6 files | Dark card UI with `#display` container | **CORS Execution Blocking**: Used ES6 modules (`<script type="module">` & `import`). Browsers block local ES imports over `file://`, freezing page on `Initializing...` | ❌ **FAILURE (ES Module / CORS)** |

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

### 4. 🔴 DeepSeek Coder V2 Lite Instruct (Local LM Studio)
* **Mode**: 100% Local (LM Studio on `http://localhost:1234`)
* **Footprint**: ~16B Parameters (MoE 2.4B active params)
* **File Topology (5 files)**:
  * `index.html` (Dark glassmorphism dashboard UI with status pill & control buttons)
  * `css/styles.css`
  * `js/main.js`, `js/ipl_interpreter.js`, `js/ui_controller.js`, `js/utils.js`
* **Architectural Approach**:
  * Very attractive dark UI styling (`bg-[#0f1117]`, purple header `</> IPL Studio v1.0`, dark console box).
* **Friction / Bugs Encountered**:
  - **Runtime Execution Crash**: DeepSeek Coder V2 Lite created a custom `IPLInterpreter` class in `js/ipl_interpreter.js`, but implemented a naive line-by-line regex parser (`parseIPL(iplSpec)`) that split lines before searching for `text:` and `target:` properties. Because IPL formats `add message {` on line 1 and `text: "..."` on line 2, line 1 failed regex matching and threw a runtime error: `IPL Error: Missing message definition`.
* **Final Assessment**: **❌ FAILURE (Runtime Parser Bug)**. Excellent UI aesthetic design, but flawed JS runtime logic resulting in execution crash.

---

### 5. 🟣 Qwen AgentWorld 35B a3b (Local LM Studio)
* **Mode**: 100% Local (LM Studio on `http://localhost:1234`)
* **Footprint**: ~12 GB RAM / VRAM (35 Billion Parameters optimized model)
* **File Topology (8 files)**:
  * `index.html` (Modern 2-column split layout + full-width magenta/pink gradient banner)
  * `css/styles.css`
  * `js/app.js`, `js/config.js`, `js/event_bus.js`, `js/timestamp_service.js`, `js/ui_controller.js`, `js/ipl_interpreter.js`
  * `README.md` & `source/main.ipl`
* **Architectural Approach**:
  * **Masterpiece of Layout Design & UX**: Split 2-column layout showcasing the IPL source specification on the left inside a dark editor box with syntax highlighting, live terminal output on the right with color-coded cyan/green/blue log formatting, and a **gorgeous full-width magenta-to-pink gradient banner** at the bottom displaying the executed message and live timestamp (`Hello World IPL Studio v1.0 [08/06/2026, 15:01:08]`)!
  * **Architecture EventBus JS (`js/event_bus.js`)** : Implemented a clean pub/sub event bus decoupling `timestamp_service.js`, `ui_controller.js`, and `ipl_interpreter.js`.
* **Friction / Bugs Encountered**:
  - **ZERO FRICTION (0 Bug, 0 Friction)**. Included Tailwind Play CDN, auto-execution on DOMContentLoaded, clean XML formatting, and zero runtime errors.
* **Final Assessment**: **10/10 — Perfect Score (Stunning Visual Rendu)**.

---

### 6. 🟢 Microsoft Phi-4 Reasoning Plus (Local LM Studio)
* **Mode**: 100% Local (LM Studio on `http://localhost:1234`)
* **Footprint**: ~9 GB RAM / VRAM (14 Billion Parameters Reasoning model)
* **File Topology (6 files)**:
  * `index.html` (Clean white card UI with green status outline pill `✓ Success`)
  * `css/styles.css`
  * `js/main.js`, `js/app.js`, `js/message.js`, `js/timestamp.js`
  * `package.json`, `Makefile`, `README.md` & `source/main.ipl`
* **Architectural Approach**:
  * **Reasoning Intelligence Touch**: Dynamically resolved and displayed the system timezone (`System Timestamp: 08/06/2026, 15:04:25 (Europe/Paris)`), demonstrating high-level reasoning when interpreting `compute timestamp from system`!
  * Pristine white card layout, clean typography, and subtle shadow elevation.
* **Friction / Bugs Encountered**:
  - **ZERO FRICTION (0 Bug, 0 Friction)**. Included `<script src="https://cdn.tailwindcss.com"></script>` in `<head>`, formatted clean XML tags, and executed flawlessly on the very first attempt without any intervention.
* **Final Assessment**: **10/10 — Perfect Score (Smart Timezone Deduction)**.

---

### 7. ⚡ Nvidia Nemotron 3 Nano 4B (Local LM Studio)
* **Mode**: 100% Local (LM Studio on `http://localhost:1234`)
* **Footprint**: **2.84 GB RAM / VRAM** (Pound-for-Pound 4B Champion)
* **File Topology (9 files)**:
  * `index.html` (Blue/purple gradient header card, tagged console output box, screen display card, execution status dot)
  * `css/styles.css`
  * `js/main.js`, `js/config.js`, `js/event_bus.js`, `js/message_service.js`, `js/timestamp_service.js`, `js/ui_controller.js`, `js/ipl_interpreter.js`
  * `README.md` & `source/main.ipl`
* **Architectural Approach**:
  * **Unbelievable Size-to-Performance Ratio**: At only 2.84 GB RAM, Nemotron 4B generated a full 9-file EventBus architecture with decoupled services (`message_service.js`, `timestamp_service.js`).
  * **Color-Coded Execution Tags**: Console output window features explicit color-coded execution step tags (`[CREATED]` in green, `[TIMESTAMP]` in gray, `[SENT]` in green, `[SUCCESS]` in blue).
* **Friction / Bugs Encountered**:
  - **ZERO FRICTION (0 Bug, 0 Friction)**. Included `<script src="https://cdn.tailwindcss.com"></script>` in `<head>`, formatted clean XML tags, auto-executed on DOM load, and ran flawlessly out-of-the-box.
* **Final Assessment**: **10/10 — Perfect Score (Best Ultra-Light Model)**.

---

### 8. 🟣 GPT-OSS 20B (Local LM Studio)
* **Mode**: 100% Local (LM Studio on `http://localhost:1234`)
* **Footprint**: **12.11 GB RAM / VRAM** (20 Billion Parameters Open Source Model)
* **File Topology (8 files)**:
  * `index.html` (Neon Purple Glassmorphism UI `backdrop-blur-lg`, dark translucent containers, pink/purple gradient button)
  * `css/styles.css`
  * `js/main.js`, `js/ipl_interpreter.js`, `js/message_service.js`, `js/success_handler.js`, `js/timestamp_service.js`, `js/ui_controller.js`
  * `README.md` & `source/main.ipl`
* **Architectural Approach**:
  * **Execution Latency Benchmarking**: GPT-OSS 20B calculated and displayed the precise execution speed of the IPL script in milliseconds inside the console terminal log (`[15:10:27] Execution completed in 2.00ms`)!
  * Combined dynamic timezone resolution (`System Timestamp: 08/06/2026, 15:10:27 (Europe/Paris)`) with a gorgeous Neon Purple Glassmorphic UI layout.
* **Friction / Bugs Encountered**:
  - **ZERO FRICTION (0 Bug, 0 Friction)**. Included `<script src="https://cdn.tailwindcss.com"></script>` in `<head>`, formatted clean XML tags, auto-executed on DOM load, and ran flawlessly out-of-the-box.
* **Final Assessment**: **10/10 — Perfect Score (Latency Benchmarking & Neon Design)**.

---

### 9. ☁️ DeepSeek Flash 4 (Cloud API)
* **Mode**: Cloud API
* **File Topology (6 files)**:
  * `index.html` (Clean white card layout with blue/indigo background gradient)
  * `css/styles.css`
  * `js/init.js`, `js/app.js`, `js/console.js`, `js/message.js`, `js/timestamp.js`
* **Architectural Approach**:
  * Modern modular ES6 Class architecture split across 5 script files (`init.js`, `app.js`, `console.js`, `message.js`, `timestamp.js`).
* **Friction / Bugs Encountered**:
  - **Bloqué par les Sécurités CORS des Navigateurs (ES6 Modules sur `file://`)** : DeepSeek Flash 4 a utilisé des modules ES6 (`<script type="module" src="js/init.js">` dans `index.html` et `import { HelloWorldApp } from './app.js'` dans `init.js`).
  - Lorsque `index.html` est ouvert directement depuis le système de fichiers (`file:///D:/...`), les navigateurs web bloquent par sécurité les requêtes d'import de modules locaux avec une erreur CORS (`origin null`). 
* **Final Assessment**: **❌ ÉCHEC (Fichiers ES Module inopérants sur protocole `file://`)**.

---

### 10. ☁️ Google Gemini 3.1 Flash Lite (Cloud API)
* **Mode**: Cloud API (`https://generativelanguage.googleapis.com/v1beta/openai`)
* **File Topology (6 files)**:
  * `index.html` (Carte sombre épurée avec conteneur `#display`)
  * `src/style.css`
  * `src/app.js`, `src/engine.js`
  * `package.json` & `source/main.ipl`
* **Architectural Approach**:
  * Architecture classe propre (`IPLRuntime` dans `src/engine.js`).
* **Friction / Bugs Encountered**:
  - **Bloqué par les Sécurités CORS (ES6 Modules sur `file://`)** : Gemini Flash Lite a généré un script avec `<script type="module" src="src/app.js"></script>` et `import { IPLRuntime } from './engine.js'`. Les navigateurs bloquent les imports de modules locaux sur `file://`, laissant l'interface bloquée sur `Initializing...`.
  - **Solution Système Appliquée** : Règle anti-ES6 Module injectée dans le compilateur IPL pour interdire l'usage de `<script type="module">` et forcer des scripts JS autonomes sans serveur HTTP !
* **Final Assessment**: **❌ ÉCHEC (Fix Prompt Système Injecté)**.

---

*This benchmark document is updated transparently as new local and cloud models are tested.*
