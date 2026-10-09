/**
 * DslAdapter — the seam that makes the verification engine language-agnostic.
 *
 * The product is a toolbox IDE; IPL is *one* constrained-intent language among
 * possible ones. Everything DSL-specific (contract extraction, derived oracle,
 * contextual/portable prompts, the 2-pass prompt builders) is captured behind
 * this interface, so the reusable core (gates, oracle, receipts, benchmark,
 * browser smoke) can serve another language by registering another adapter.
 *
 * The IPL adapter delegates to the existing functions — no logic is duplicated
 * here — so introducing the seam changes no behavior.
 */

import { extractIPLSemanticContract, deriveContractContext, deriveBehaviorAssertFromSpec, renderNLBrief } from './semanticPreservation.ts';
import type { SemanticContract } from './semanticPreservation.ts';
import { exportContractPrompt } from './exportContract.ts';
import { buildPass1Prompt, buildPass2Prompt } from './llmGenerator.ts';
import type { LLMMessagePair, FormFactor, TargetLanguage } from './llmGenerator.ts';
import type { BehaviorAssert } from './behaviorAssert.ts';

export interface DslBuildOptions {
  targetLang?: TargetLanguage;
  formFactor?: FormFactor;
}

export interface DslAdapter {
  /** Stable id (used as the registry key and in the UI). */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Source-file extension (e.g. `ipl`). */
  fileExtension: string;
  /** Extracts the typed contract (identities/types/formulas/output keys/fixtures) from a spec. */
  extractContract(spec: string): SemanticContract;
  /** Spec-derived structural oracle (declared output keys), or null. */
  deriveOracle(spec: string): BehaviorAssert | null;
  /** Compact contract summary for prompts (same object the oracle uses). */
  contractContext(spec: string): string;
  /** Deterministic prose brief of the spec (NL control baseline). */
  renderNLBrief(spec: string): string;
  /** Portable prompt to drive ANY external model (the contract as requirements). */
  exportPrompt(spec: string): string;
  /** Pass 1 (topology) prompt. */
  buildPass1(spec: string, opts?: DslBuildOptions): LLMMessagePair;
  /** Pass 2 (code) prompt. */
  buildPass2(spec: string, topology: string, opts?: DslBuildOptions): LLMMessagePair;
}

/** The IPL adapter — delegates to the existing IPL functions (no behavior change). */
export const IPL_ADAPTER: DslAdapter = {
  id: 'ipl',
  name: 'IPL (Intent Programming Language)',
  fileExtension: 'ipl',
  extractContract: (spec) => extractIPLSemanticContract(spec),
  deriveOracle: (spec) => deriveBehaviorAssertFromSpec(spec),
  contractContext: (spec) => deriveContractContext(extractIPLSemanticContract(spec)),
  renderNLBrief: (spec) => renderNLBrief(spec),
  exportPrompt: (spec) => exportContractPrompt(spec),
  buildPass1: (spec, opts) => buildPass1Prompt(spec, opts?.targetLang ?? 'polyglot', undefined, opts?.formFactor),
  buildPass2: (spec, topology, opts) => buildPass2Prompt(spec, opts?.targetLang ?? 'polyglot', topology, undefined, opts?.formFactor)
};

const REGISTRY: Record<string, DslAdapter> = { [IPL_ADAPTER.id]: IPL_ADAPTER };

/** Registers an additional DSL adapter (X-Studio). */
export function registerDslAdapter(adapter: DslAdapter): void {
  REGISTRY[adapter.id] = adapter;
}

/** Resolves an adapter by id (defaults to IPL when unknown/omitted). */
export function getDslAdapter(id?: string): DslAdapter {
  return (id && REGISTRY[id]) || IPL_ADAPTER;
}
