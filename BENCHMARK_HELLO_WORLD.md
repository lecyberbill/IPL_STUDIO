# 📊 IPL Studio v1.0 — LLM Benchmark Suite: "Hello World" Multi-Model Comparison

> **Objective**: Compare architectural choices, token efficiency, file topology, and visual rendering across different local and cloud LLM models given the **exact same IPL intent specification** and target stack.

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

| Model Name | Execution Mode | Model Size / Footprint | File Count | Generation Time | Architectural Style & Design Highlights | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Liquid LFM-2** | Local (LM Studio) | ~1.5B – 3B (~2 GB RAM) | 3 files | ⚡ ~3.2s | Minimalist single card UI, direct DOM binding, purple gradient background | ✅ **SUCCESS (100%)** |
| **Bonsai 27B** | Local (PrismML 1-bit) | 27B (~3.9 GB RAM) | 12 files | 🚀 ~12.5s | Modular Event-Bus (IPC), separate `state.js`, `ipl-runtime.js`, `timestamp.js` | ✅ **SUCCESS (100%)** |

---

## 🔍 Detailed Model Test Results

### 1. 🟢 Liquid LFM-2 (Local LM Studio)
* **Mode**: 100% Local (LM Studio on `http://localhost:1234`)
* **Footprint**: ~2 GB RAM
* **File Topology (3 files)**:
  * `index.html` (Glassmorphism card UI with Tailwind)
  * `css/styles.css`
  * `js/main.js` (Direct DOM binding & ISO timestamp formatting)
* **Architectural Strategy**: Compact & token-efficient. Generates a clean single-file JS script with direct execution on page load.
* **Result**: Runnable out-of-the-box in browser with status pill and system timestamp.

---

### 2. 🌳 Bonsai 27B (PrismML 1-bit Binary / Ternary)
* **Mode**: 100% Local (LM Studio on `http://localhost:1234`)
* **Footprint**: ~3.9 GB RAM (27 Billion Parameters compressed to 1.125-1.71 bits)
* **File Topology (12 files)**:
  * `index.html`
  * `css/styles.css`
  * `js/main.js`, `js/ipl-runtime.js`, `js/timestamp.js`, `js/screen-output.js`, `js/console-output.js`, `js/state.js`, `js/ipc.js`, `js/config.js`
  * `package.json`, `tailwind.config.js`, `Makefile`, `README.md`
* **Architectural Strategy**: Highly modular Enterprise event-bus pattern (`ipcBus`, `stateManager`, decoupled `ipl-runtime.js` parser).
* **Result**: Fully functional multi-module architecture with state subscriptions.

---

*This document will be updated progressively as new local and cloud models are tested.*
