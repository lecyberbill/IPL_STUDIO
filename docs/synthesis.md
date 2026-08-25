# IPL Studio — Synthesis (the measured conclusion)

> One place to read the whole experiment. The intent language was tested "in all
> directions" (multi-domain, n=3 robustness, de-biased NL baseline, and a
> human-written brief) to separate what holds from what was intuition. The
> verdict is measured, not claimed.

## The refined thesis

> **IPL does not make the model reliable — it makes the model's freedom measurable
> and a failure attributable.** It pins the *what* (a typed data contract:
> identities, types, formulas, output keys, fixtures), while the *how*
> (architecture, exact source tree) stays the LLM's. The measurable ceiling is
> **model variance**: the contract can survive into the source while the
> executable still diverges.

Reliability comes from **execution + deterministic gates + layer-aware receipts**,
never from the language alone. This is "rails, not walls": the DSL guides and
advises but never blocks; the LLM remains the final interpreter.

## The evidence (seven independent angles, all real deepseek-chat runs)

### 1. Multi-domain stress test (unrelated businesses, n=1, `--nl-witness`)

| Domain | Final | IPL 1st-try | NL 1st-try | Semantic | Verdict |
| :--- | :---: | :---: | :---: | :---: | :--- |
| garage (multi-file) | PASS | 0% | 0% | 0.705 | Parity |
| banking (finance) | PASS | 100% | 100% | 0.800 | Parity |
| logistics (supply-chain) | PASS | 100% | 0% | 0.867 | IPL better |
| inventory (retail) | FAIL | 0% | 100% | 1.000 | NL better |
| payroll (HR) | WARN | 0% | 100% | 0.900 | NL better |
| telecom (utilities) | FAIL | 0% | 100% | 0.811 | NL better |

Measurement is **domain-agnostic**; the result is **non-confirmatory**.

### 2. Robustness n=3 (the "NL better" was not noise)

| Spec | Final (n=3) | IPL 1st-try | NL 1st-try | Semantic | Verdict |
| :--- | :---: | :---: | :---: | :---: | :--- |
| inventory (retail) | 0/3 FAIL | 0% | 100% | 0.967 | NL better |
| payroll (HR) | 0/3 FAIL | 0% | 100% | 0.967 | NL better |
| telecom (utilities) | 2/3 PASS | 0% | 100% | 0.768 | NL better |

### 3. De-bias (`--nl-render`, deterministic prose baseline, n=3)

| Spec | IPL final | IPL 1st-try | NL 1st-try | Verdict |
| :--- | :---: | :---: | :---: | :--- |
| inventory (retail) | 0/3 FAIL | 0% | 100% | NL better |
| payroll (HR) | 1/3 PASS | 0% | **0%** | **Parity** |
| telecom (utilities) | 1/3 PASS | 0% | 100% | NL better |

Removing the AI-authored brief (which spelled out the exact answers) made the NL
edge **vanish on payroll** — it was partly a writing-skill artifact. What
remains: on **one-step arithmetic** NL still wins (the model computes it from a
complete prose brief too); on the hard path both fail first-try.

### 4. Human-brief control (recipe-app, your verbatim French brief, n=3)

| | Harness (marker+forbid) | After a real browser test |
| :--- | :---: | :---: |
| IPL arm | "3/3 PASS" | **1/3 really works** (run-1) |
| NL arm | "3/3 PASS" | **0/3** (all crash: `process is not defined` / `missing }`) |

The harness **over-reported** for web apps. Real: **IPL 1/3, NL 0/3**, not Parity.

### 5. The web-verify gap (found by the human, then gated)

Real failure classes the serve+GET verify missed: **`process is not defined`**
(Node `process.env` in a browser — dominant), **JS syntax errors** (`missing }`),
and a **placeholder HTML**. Two deterministic gates now close it: `node --check`
on all `.js` for every target, and a **Node-ism ban** (`process.`/`require(`/
`module.`) for web targets. Validated against the real artifacts: **4/5 failures
caught**, the working app passes with no false positive. The placeholder-HTML
case is the one remaining (recognized) gap — it would false-positive on JS-rendered
SPAs.

### 6. Layered receipts (the attribution layer)

The single PASS/FAIL was split so a failure names its culprit layer. Every run
reports: **semantic preservation** (contract in source, independent of runtime),
**binding layer** (topology → integration → runtime-first-try), **deterministic vs
LLM repair split**, **topology stability**, and **oracle/spec parity**.

### 7. Degrees of freedom (what IPL actually pins)

See [`degrees-of-freedom.md`](degrees-of-freedom.md): the promise → owner layer →
measured today. Key: IPL constrains the *data contract*; the *shape* (topology,
exact tree) is LLM freedom, deliberately not measured (and not promised).

## The conclusion (regimes, not a verdict)

- **Rich / structured contracts** (garage multi-file, logistics): IPL converges and
  edges out — constraint + drift-detection pay.
- **Completely trivial one-step arithmetic**: NL ≈ IPL (a complete prose brief is
  as good; the model computes it too).
- **Slightly harder arithmetic** (rounding, `(1-tax)`): **Parity** — both err
  first-try; the "NL better" was partly the authored brief.
- **Interactive web + external API**: IPL was better (1/3 vs 0/3) once the weak
  web verify was replaced by a real browser test — but most web apps (5/6) were
  broken, dominated by `process is not defined`.
- **Everywhere**: semantic preservation stays high (0.77–1.0) even on FAIL — the
  **contract survives in source, the executable drifts**. That is the central,
  repeatable finding.

## What this means for the project

- The intent language is a good idea, but its value is **containing and measuring
  model freedom**, not eliminating it. Don't promise "IPL produces better apps";
  document what it constrains and what it leaves to the model, with numbers.
- The **harness is a stress-test lab**, not a marketing tool: it resists
  confirmation bias (the NL-vs-IPL result flipped when de-biased, and the web
  "Parity" collapsed under a real browser test).
- The **remaining ceiling is model variance** — not the language, not the spec.
  Beyond a second model (optional, for *coverage/attribution*, not reliability),
  the lever is execution + deterministic gates, which is where the effort went.
