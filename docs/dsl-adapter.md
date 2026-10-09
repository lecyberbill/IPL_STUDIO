# DslAdapter — the language seam

> The product is a **toolbox IDE**; IPL is *one* constrained-intent language among
> possible ones. Everything DSL-specific is captured behind a single interface so
> the **reusable core** (deterministic gates, behavioral oracle, semantic
> receipts, benchmark, browser smoke, delivery) can serve another language by
> registering another adapter. Adding the seam changed **no behavior**: the IPL
> adapter delegates to the existing functions.

## The interface (`src/engine/dslAdapter.ts`)

```ts
interface DslAdapter {
  id: string;            // registry key + UI
  name: string;          // human-readable
  fileExtension: string; // e.g. 'ipl'

  extractContract(spec: string): SemanticContract;      // typed contract (identities/types/formulas/output keys/fixtures)
  deriveOracle(spec: string): BehaviorAssert | null;    // spec-derived structural oracle
  contractContext(spec: string): string;                // compact contract summary for prompts
  renderNLBrief(spec: string): string;                  // deterministic prose baseline (NL control)
  exportPrompt(spec: string): string;                   // portable prompt for ANY external model
  buildPass1(spec: string, opts?): LLMMessagePair;      // topology prompt
  buildPass2(spec: string, topology: string, opts?): LLMMessagePair; // code prompt
}
```

`IPL_ADAPTER` implements it by delegating to `extractIPLSemanticContract`,
`deriveBehaviorAssertFromSpec`, `deriveContractContext`, `renderNLBrief`,
`exportContractPrompt`, `buildPass1Prompt`, `buildPass2Prompt`.

## Registry

```ts
getDslAdapter(id?)          // resolves an adapter; defaults to IPL (unknown ids too)
registerDslAdapter(adapter) // adds another DSL (an "X-Studio")
```

## What is DSL-specific vs reusable

| DSL-specific (adapter) | Reusable (the core) |
| :--- | :--- |
| grammar / lexer / parser | deterministic gates (imports, JSON, form, leaks, truncation, ESM, Node-ism) |
| contract extraction | semantic-preservation receipt |
| pass-1 / pass-2 prompts | oracle/spec parity + behavioral oracle (values + **AFN trace**) |
| derived oracle + NL brief + export | benchmark harness, receipts, token telemetry |
| | real-browser smoke, delivery panel, artifact manager, chat, terminal, git |

## Adding a new language

Register a `DslAdapter` that parses your language into a `SemanticContract` and
builds its pass prompts; the rest of the pipeline (verify → receipts → repair →
deliver) is reused as-is. `verifyArtifact(files, spec, { adapter })` already
routes contract extraction and the derived oracle through the adapter — so a new
language gets the whole verification toolbox for free.
