/**
 * Artifact verification — the "Pure IDE" core.
 *
 * Independently of any generation, this takes an artifact (files produced by our
 * generator, by another model, by a human, or pasted from anywhere) plus a
 * contract (an IPL spec), and returns a structured verification: the
 * deterministic gates, the semantic-preservation receipt, the oracle/spec
 * parity, and a verdict. It is pure (no network, no spawn) so it runs in the app,
 * in tests, and in the benchmark. The runtime smoke (which needs to spawn a
 * process) is layered on top by the caller.
 *
 * The point is NOT "did our generator build it" — it is "how far does ANY
 * artifact drift from the expressed intent".
 */

import { parseMultiFileXml } from './artifactGenerator.ts';
import type { ProjectArtifactFile } from './artifactGenerator.ts';
import {
  findMissingModuleRefs,
  findInvalidJson,
  findFormMismatches,
  findIplLeakage,
  findPatchLeakage,
  findTruncatedFiles,
  findEsmScriptMismatch
} from './staticChecker.ts';
import {
  extractIPLSemanticContract,
  measureSemanticPreservation,
  checkOracleParity,
  deriveBehaviorAssertFromSpec
} from './semanticPreservation.ts';
import type { SemanticReceipt, OracleParity } from './semanticPreservation.ts';
import type { BehaviorAssert } from './behaviorAssert.ts';
import type { FormFactor } from './llmGenerator.ts';

export interface GateFinding {
  /** The deterministic gate that produced the finding. */
  gate: string;
  severity: 'error' | 'warn';
  file: string;
  message: string;
}

export interface ArtifactVerification {
  /** Number of files in the artifact (after XML parsing). */
  fileCount: number;
  /** Deterministic 0-token gate findings. */
  gates: GateFinding[];
  /** Semantic-preservation receipt (contract survival in the source), if a spec was given. */
  semantic?: SemanticReceipt;
  /** Oracle/spec parity, when an explicit oracle was supplied. */
  parity?: OracleParity;
  /** Spec-derived structural oracle (the declared JSON output keys), if any. */
  derivedOracle: BehaviorAssert | null;
  /** Crash-level verdict from the pure gates + semantic receipt (smoke is separate). */
  verdict: 'pass' | 'warn' | 'fail';
  /** Human-readable one-line summary. */
  summary: string;
}

/** Accepts either raw XML (`<file path=...>`) or an already-parsed file list. */
export function toArtifactFiles(input: string | ProjectArtifactFile[]): ProjectArtifactFile[] {
  return typeof input === 'string' ? parseMultiFileXml(input) : input;
}

/**
 * Verifies an artifact against an IPL contract. Pure and deterministic: the
 * runtime smoke (spawn) is added by the caller. Returns gates + semantic
 * receipt + parity + a verdict.
 */
export function verifyArtifact(
  input: string | ProjectArtifactFile[],
  specCode: string,
  opts: { formFactor?: FormFactor; oracle?: BehaviorAssert } = {}
): ArtifactVerification {
  const files = toArtifactFiles(input);
  const gates: GateFinding[] = [];

  const push = (gate: string, sev: 'error' | 'warn', items: Array<{ file: string; message: string }>) => {
    for (const it of items) gates.push({ gate, severity: sev, file: it.file, message: it.message });
  };

  // Deterministic gates (0 token) — the "mechanical holes".
  push('imports', 'error', findMissingModuleRefs(files).map(m => ({ file: m.importer, message: `imports missing module ${m.resolved}` })));
  push('json', 'error', findInvalidJson(files).map(j => ({ file: j.file, message: 'invalid JSON' })));
  push('form', 'error', findFormMismatches(files, opts.formFactor as any).map(f => ({ file: f.file, message: f.reason })));
  push('ipl-leak', 'error', findIplLeakage(files).map(f => ({ file: f.file, message: 'IPL spec leaked into the deliverable' })));
  push('patch-leak', 'error', findPatchLeakage(files).map(f => ({ file: f.file, message: 'SEARCH/REPLACE marker leaked into the code' })));
  push('truncation', 'error', findTruncatedFiles(files).map(f => ({ file: f.file, message: 'file is cut short (truncated)' })));
  push('esm', 'warn', findEsmScriptMismatch(files).map(f => ({ file: f.file, message: 'ESM script loaded without type="module"' })));

  // Semantic-preservation receipt (contract survival, independent of runtime).
  const contract = extractIPLSemanticContract(specCode);
  const semantic = measureSemanticPreservation(contract, files);

  // Spec-derived structural oracle + optional parity check against an explicit oracle.
  const derivedOracle = deriveBehaviorAssertFromSpec(specCode);
  const parity = opts.oracle ? checkOracleParity(specCode, opts.oracle) : undefined;

  const errors = gates.filter(g => g.severity === 'error').length;
  const warns = gates.filter(g => g.severity === 'warn').length;
  const semanticLost = semantic.identity.total > 0 && semantic.identity.preserved === 0;

  const verdict: ArtifactVerification['verdict'] =
    errors > 0 || semanticLost ? 'fail' : warns > 0 || semantic.score < 0.5 ? 'warn' : 'pass';

  const summary =
    verdict === 'fail'
      ? `FAIL — ${errors} gate error(s)${semanticLost ? ' + contract lost' : ''} (semantic ${semantic.score})`
      : verdict === 'warn'
        ? `WARN — ${warns} gate warning(s), semantic ${semantic.score}`
        : `PASS — clean gates, semantic ${semantic.score}`;

  return { fileCount: files.length, gates, semantic, parity, derivedOracle, verdict, summary };
}
