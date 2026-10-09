import { describe, it, expect } from 'vitest';
import { IPL_ADAPTER, getDslAdapter, registerDslAdapter } from './dslAdapter';
import { extractIPLSemanticContract, deriveBehaviorAssertFromSpec, renderNLBrief } from './semanticPreservation';
import { exportContractPrompt } from './exportContract';
import { buildPass1Prompt } from './llmGenerator';

const SPEC = `add entity Product { sku: id, price: number }
listen event on "x" { send r to screen { format: "json", sku: p.sku, price: p.price } }`;

describe('DslAdapter — the language seam', () => {
  it('IPL adapter delegates identically (no behavior change)', () => {
    expect(IPL_ADAPTER.extractContract(SPEC)).toEqual(extractIPLSemanticContract(SPEC));
    expect(IPL_ADAPTER.deriveOracle(SPEC)).toEqual(deriveBehaviorAssertFromSpec(SPEC));
    expect(IPL_ADAPTER.renderNLBrief(SPEC)).toBe(renderNLBrief(SPEC));
    expect(IPL_ADAPTER.exportPrompt(SPEC)).toBe(exportContractPrompt(SPEC));
    expect(IPL_ADAPTER.buildPass1(SPEC, { targetLang: 'python' }).system).toBe(buildPass1Prompt(SPEC, 'python').system);
  });

  it('getDslAdapter defaults to IPL for unknown/omitted ids', () => {
    expect(getDslAdapter().id).toBe('ipl');
    expect(getDslAdapter('nope').id).toBe('ipl');
  });

  it('registerDslAdapter makes another DSL resolvable (X-Studio)', () => {
    registerDslAdapter({ ...IPL_ADAPTER, id: 'fake-dsl', name: 'Fake DSL', fileExtension: 'fdsl' });
    expect(getDslAdapter('fake-dsl').name).toBe('Fake DSL');
  });
});
