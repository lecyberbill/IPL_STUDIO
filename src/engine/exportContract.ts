/**
 * Contract export — the "IPL as an input" path of the Pure IDE.
 *
 * Renders an IPL contract (identities, types, formulas, output keys, fixtures,
 * control flow) as a plain, portable prompt block that can drive ANY external
 * model (ChatGPT / Claude / a local LLM / a human). It is deliberately neutral:
 * it states the contract as requirements, not as IPL, so it works wherever you
 * paste it — and it asks the model to preserve the contract, so the artifact can
 * then be verified against the same contract.
 */

import { renderNLBrief } from './semanticPreservation.ts';

/**
 * Builds a copy-paste prompt that encodes the spec's contract for any model.
 * The body is the deterministic prose rendering of the spec (entities, types,
 * fixtures, formulas, output keys) — so the model sees the full contract as
 * plain requirements — wrapped with hard preservation rules.
 */
export function exportContractPrompt(specCode: string): string {
  const body = renderNLBrief(specCode);
  const lines: string[] = [
    'You are implementing a program that must satisfy the INTENT CONTRACT below.',
    '',
    'INTENT CONTRACT:',
    body,
    '',
    'HARD REQUIREMENTS:',
    '- Preserve every identifier, type, formula and output key from the contract — do not rename, drop, or invent data.',
    '- Use the fixture data as given, and compute the derived values with the stated rules.',
    '',
    'Return the complete, runnable source files.'
  ];
  return lines.join('\n');
}
