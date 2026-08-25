# Degrees of Freedom — what IPL promises vs what it actually pins

> Working note from the layer-aware evaluation work (2026-08-25). It explicitates
> the reviewer's central framing: a single "PASS/FAIL" hides very different
> guarantees. Each row below states **which layer *owns* a promise**, and whether
> IPL Studio **measures** it today. The goal is to make the boundaries between
> "deterministic" and "LLM-owned" testable, not to demand IPL resolve them all.

## Reading the columns

- **Owner** — the contract that (in principle) keys this promise.
- **Today** — what the code does right now:
  - 🟢 `gate` — a 0-token deterministic check blocks/fixes it.
  - 🟡 `measured` — a receipt exists but does not block (receipts, not walls).
  - 🔵 `LLM freedom` — deliberately left to the model; not constrained.
  - ⚪ `blind spot` — not measured at all (the honest gaps).

## The ledger

| Promise | Owner | Today | Where / how |
| :--- | :--- | :--- | :--- |
| Same need → same **observable behavior** | IPL + behavioral verifier | 🟢 gate | `evaluateBehavior` (`behaviorAssert.ts`), golden + `verify.assert` |
| Same need → roughly **similar architecture** | explicit topology contract | 🔵 LLM freedom | Pass 1 topology is an LLM output (`llmGenerator.ts`), unvalidated against the spec |
| Fidelity of **names / types / formulas** | semantic lowering contract | 🟡 measured | `semanticPreservation.ts` receipt (P3) — measured, not blocked |
| Same input → **identical source tree** | deterministic lowering (canonical IR) | ⚪ blind spot | No reference IR; only seed/temp control |
| **Reproducibility** across inferences | model / backend / seed / runtime | 🟡 measured | `seed=42`, low temp; topology stability reported (P4) |
| **Entry point / form conformance** | topology + form factor | 🟢 gate | `buildFormDirective` (P4) + `findFormMismatches`; runtime retry of discovered entry |
| **Inter-file dependency closure** | lowering + integration | 🟢 gate | `staticChecker.findMissingModuleRefs` (imports resolve) |
| **Runtime crash / syntax / toolchain** (app flow) | execution smoke | 🟢 gate | `runSyntaxSmoke` + `smokeGateVerdict` (`fail` on crash, `warn` on syntax/missing toolchain) |
| **Behavioral correctness — output structure** | spec-derived oracle | 🟢 gate | `deriveBehaviorAssertFromSpec` (spec's `send format:json` keys) → `evaluateBehavior` `exists`/presence |
| **Behavioral correctness — output values** | hand oracle / float-approx | 🟡 measured | benchmark `verify.assert` (`equals`/`approx`); app flow derives structure, exact values stay explicit |
| **Runtime behavior** at first pass | generated app + run harness | 🟢 gate | benchmark `verify` (run command, JSON-path asserts) |
| **Independent reviewer (2nd model)** | reviewer config | 🔵 optional | `LLMConfig.reviewer` (Settings "Independent Reviewer"): different mode/model/endpoint/key. **Coverage + attribution, not reliability** — reliability comes from the deterministic gates above, never from a reviewer. |
| **Deterministic pre-repair** | 0-token fixes | 🟢 gate | `deterministicRepair.ts` (ES-module, Tailwind CDN, SEARCH/REPLACE, python relative imports) |
| **LLM repair after diagnosis** | repair loop | 🟡 measured | `refineIPLArtifact`, `repairPasses`, `llmRepairPasses` (P2) |

## The three measured receipts that keep it honest

The layer-aware report splits the verdict into receipts so a failure is
attributable, not just observable:

1. **Binding layer** — the first gate that bound the run, in causal order
   `topology → integration → runtime-first-try` (`buildLayerReceipts`,
   `scripts/run-benchmark.ts`).
2. **Semantic preservation** — how much of the spec's identity/types/formulas/
   output keys actually reach the shipped source, *independent* of the runtime
   verdict (`measureSemanticPreservation`, `semanticPreservation.ts`). This is
   the "the app works but the contract leaked" detector.
3. **Topology stability** — number of distinct Pass 1 topologies across
   iterations (`1` = deterministic architecture, `>1` = LLM freedom).

## Order of confidence, without a 2nd model

The reliability ceiling is **not** a reviewer — it is **execution + deterministic
gates**. From weakest to strongest, all reachable with no second model:

1. `smokeGateVerdict` — crash / syntax / toolchain (0 token, always on).
2. Spec-derived behavioral oracle (`deriveBehaviorAssertFromSpec`) — the spec's
   declared `send format:json` output keys must appear in the emitted JSON.
3. Exact-value oracle (`approx`/`equals`) — strongest; needs a per-project
   `verify` (the benchmark specs have it).

A **second model** (optional `LLMConfig.reviewer`) only lifts *coverage/
attribution* (catching a stack-choice drift a static reviewer ratifies); it does
**not** raise reliability above the execution gates above. So "nothing under
hand" for a 2nd model is fine: you keep the reliability path measured.

## Deliberately deferred (do not build until the receipts prove them critical)

- **Reference IR / deterministic lowering** — the strictest "identical tree"
  guarantee. Only justified if the P3 semantic receipts show it is the binding
  constraint in practice.
- **Oracle/spec parity guard** — assert that `verify.assert` fixtures are a
  consistent subset of the spec's `seed`/<add entity> data, so the oracle and
  the generator never drift apart.

## The claim this makes testable

> *Which classes of freedom does the minimalist IPL remove, and which survive in
> the LLM-driven stages?*

That is answered per run by the receipts above — not by demanding IPL emit a
byte-identical tree every time.
