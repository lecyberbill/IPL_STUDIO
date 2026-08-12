/**
 * Consolidation agent — the delivery-gate reviewer that runs BEFORE the user
 * tests the generated project.
 *
 * Design contract (agreed with the user):
 *  - 100% success is unattainable, so the metric is the COST of correction, not
 *    the first-try pass rate. The value IPL adds is token economy: precision
 *    encoded once in the spec, instead of multiplied through clarifications.
 *  - A reviewer that hallucinates is worse than none: every LLM finding must be
 *    confirmed against a deterministic gate (imports cross-checked against the
 *    generated file set) before it is acted on.
 *  - The review is SYSTEMATIC — it runs on every generation, even when the
 *    deterministic gates are clean, because the LLM sees holes regex cannot
 *    (dead code, unreachable entry point, swallowed errors). On average across
 *    many projects the cost is amortized by the fixes it prevents.
 *  - Output is a delivery report: what was found, what was auto-fixed, what
 *    still needs human judgment.
 *
 * Pipeline position:
 *   IPL → deterministic gates (0 tokens) → LLM 2-pass generation
 *      → consolidation agent (this file) → user tests → vib-coding repairs
 *
 * Pure helpers are exported for unit tests; the LLM loop is async.
 */

import { parseMultiFileXml } from './artifactGenerator';
import type { ProjectArtifactFile } from './artifactGenerator';
import { callLLM, refineIPLArtifact, reviewConfigFor, reviewerLabel } from './llmGenerator';
import type { LLMConfig, TargetLanguage, TokenUsageHook, FormFactor } from './llmGenerator';
import { findMissingModuleRefs, findInvalidJson, findFormMismatches } from './staticChecker';
import type { MissingModuleRef, InvalidJson, FormMismatch } from './staticChecker';
import { buildReviewPrompt, parseReviewOutput } from './reviewAgent';
import type { ReviewIssue } from './reviewAgent';

export interface ConsolidationOptions {
  /** Max review→fix loops (each costs LLM tokens). Default 2. */
  maxConsolidationPasses?: number;
  /** Force the systematic LLM review even when deterministic gates are clean. Default true. */
  systematicReview?: boolean;
  onLog?: (msg: string, type: 'info' | 'success' | 'warn' | 'error') => void;
  timeoutPerPassMs?: number;
  /** Token-usage hook (P2): consolidation review + fix passes are counted here. */
  usage?: TokenUsageHook;
  /** Chosen execution form (P4): enables the deterministic form-factor gate. */
  formFactor?: FormFactor;
}

export interface ConsolidationResult {
  /** The (possibly fixed) artifact files. */
  files: ProjectArtifactFile[];
  /** Missing-import findings from the deterministic gate (0 tokens). */
  staticIssues: MissingModuleRef[];
  /** Invalid-JSON findings from the deterministic gate (0 tokens). */
  jsonIssues: InvalidJson[];
  /** Form-factor mismatches (P4): web assets/DOM for a CLI target, or no HTML for web. */
  formIssues?: FormMismatch[];
  /** Findings reported by the LLM reviewer. */
  reviewIssues: ReviewIssue[];
  /** Findings that were confirmed (deterministic) or error-severity (LLM). */
  confirmedIssues: Array<{ kind: 'static' | 'review'; file: string; message: string }>;
  /** Passes actually run (0 = no LLM fix needed). */
  passesUsed: number;
  /** True if any LLM fix pass modified files. */
  changed: boolean;
  /** Human-readable delivery report for the IDE console. */
  report: string;
}

/** Serializes artifact files back to a <file> XML payload for refineIPLArtifact. */
export function filesToXml(files: ProjectArtifactFile[]): string {
  return files.map(f => `<file path="${f.relativePath}">\n${f.content}\n</file>`).join('\n\n');
}

/** Merges LLM findings with deterministic ones, dedupes by file+message. */
export function mergeFindings(
  staticIssues: MissingModuleRef[],
  jsonIssues: InvalidJson[],
  reviewIssues: ReviewIssue[]
): Array<{ kind: 'static' | 'review'; file: string; message: string; severity: string }> {
  const merged: Array<{ kind: 'static' | 'review'; file: string; message: string; severity: string }> = [];
  for (const s of staticIssues) {
    merged.push({ kind: 'static', file: s.resolved, message: s.suggestion, severity: 'error' });
  }
  for (const j of jsonIssues) {
    merged.push({ kind: 'static', file: j.file, message: j.suggestion, severity: 'error' });
  }
  for (const r of reviewIssues) {
    if (r.severity === 'info') continue;
    const dup = merged.some(
      m => m.file === r.file && (m.message === r.message || m.message.includes(r.message) || r.message.includes(m.message))
    );
    if (!dup) merged.push({ kind: 'review', file: r.file, message: r.message, severity: r.severity });
  }
  return merged;
}

/** Builds the fix directive for refineIPLArtifact from confirmed findings. */
export function buildConsolidationDirective(
  findings: Array<{ kind: 'static' | 'review'; file: string; message: string; severity: string }>,
  targetLang: TargetLanguage
): string {
  const lines = findings.map(
    f => `- [${f.severity}] ${f.file}: ${f.message}${f.kind === 'static' ? ' (confirmed: file is imported but not generated)' : ' (reviewer finding)'}`
  );
  return `CONSOLIDATION PASS — THE GENERATED ${targetLang.toUpperCase()} PROJECT HAS ISSUES THAT MUST BE FIXED BEFORE DELIVERY.\n\nFindings:\n${lines.join('\n')}\n\nFix every finding above. For missing files, GENERATE them. For broken code, correct it. Do not reply conversationally — only emit <file> or <patch> tags.`;
}

/**
 * Builds a copy-paste repair prompt for the HUMAN (vib-coding): the confirmed
 * remaining defects + reviewer warnings, ready to send to the LLM Chat (or any
 * assistant). The chat's refineIPLArtifact already carries the project files as
 * context, so the prompt only lists what must change.
 */
export function buildDeliveryFixPrompt(
  confirmedIssues: Array<{ kind: 'static' | 'review'; file: string; message: string }>,
  warnings: ReviewIssue[],
  targetLang: TargetLanguage
): string {
  const lines: string[] = [];
  lines.push('THE GENERATED PROJECT HAS DEFECTS THAT MUST BE CORRECTED BEFORE DELIVERY.');
  if (confirmedIssues.length > 0) {
    lines.push('');
    lines.push('CONFIRMED DEFECTS (must fix):');
    for (const c of confirmedIssues) lines.push(`- [${c.kind}] ${c.file}: ${c.message}`);
  }
  if (warnings.length > 0) {
    lines.push('');
    lines.push('REVIEWER WARNINGS (non-blocking, worth a look):');
    for (const w of warnings) lines.push(`- [${w.severity}] ${w.file}: ${w.message}`);
  }
  lines.push('');
  lines.push(`Fix the defects above in the generated ${targetLang.toUpperCase()} project.`);
  lines.push('Reply ONLY with <file path="..."> or <patch path="..."> tags applying the corrections.');
  lines.push('If a fix is ambiguous, ask a precision with exactly one line: NEED_CLARIFICATION: <your question>. Never guess.');
  return lines.join('\n');
}

/**
 * Runs the consolidation agent over a freshly generated artifact.
 *
 * 1. Deterministic gate: cross-check imports against generated files (0 tokens).
 * 2. Systematic LLM review: a skeptical non-IPL reviewer reads the whole tree.
 * 3. Merge + confirm findings.
 * 4. If error-severity findings exist, run refineIPLArtifact fix passes and
 *    re-parse, up to maxConsolidationPasses.
 * 5. Emit a delivery report.
 */
export async function consolidateArtifact(
  artifactXml: string,
  targetLang: TargetLanguage,
  config: LLMConfig,
  options: ConsolidationOptions = {}
): Promise<ConsolidationResult> {
  const maxPasses = options.maxConsolidationPasses ?? 2;
  const systematic = options.systematicReview ?? true;
  const log = options.onLog ?? (() => {});
  // P3: the review runs on the independent reviewer config when one is set
  // (cross-endpoint possible); the auto-fix keeps the generator config.
  const reviewCfg = reviewConfigFor(config);

  let files = parseMultiFileXml(artifactXml);

  // 1. Deterministic gate (free): imports + JSON + form-factor mismatches.
  const staticIssues = findMissingModuleRefs(files);
  let jsonIssues = findInvalidJson(files);
  let formIssues = findFormMismatches(files, options.formFactor);

  // 2. Systematic LLM review.
  let reviewIssues: ReviewIssue[] = [];
  if (systematic) {
    try {
      const raw = await callLLM(buildReviewPrompt(files), reviewCfg, () => {}, undefined, {
        temperature: 0.1,
        usage: options.usage
      });
      reviewIssues = parseReviewOutput(raw);
    } catch (err: any) {
      log(`Consolidation review failed: ${err.message}`, 'warn');
    }
  }

  // 3+4. Merge, confirm, fix in a loop.
  let passesUsed = 0;
  let changed = false;
  const confirmedIssues: Array<{ kind: 'static' | 'review'; file: string; message: string }> = [];
  const seen = new Set<string>();
  const pushConfirmed = (f: { kind: 'static' | 'review'; file: string; message: string }) => {
    const key = `${f.kind}:${f.file}:${f.message}`;
    if (!seen.has(key)) {
      seen.add(key);
      confirmedIssues.push(f);
    }
  };
  const formToFindings = (fi: FormMismatch[]) =>
    fi.map(f => ({ kind: 'static' as const, file: f.file, message: f.suggestion, severity: 'error' as const }));

  let findings = [...formToFindings(formIssues), ...mergeFindings(staticIssues, jsonIssues, reviewIssues)];
  let errorFindings = findings.filter(f => f.severity === 'error');
  for (const f of errorFindings) pushConfirmed(f);

  while (errorFindings.length > 0 && passesUsed < maxPasses) {
    passesUsed++;
    log(`Consolidation pass ${passesUsed}/${maxPasses}: ${errorFindings.length} confirmed error(s) — repairing...`, 'warn');
    try {
      const fixed = await refineIPLArtifact(
        filesToXml(files),
        buildConsolidationDirective(errorFindings, targetLang),
        targetLang,
        config,
        () => {},
        undefined,
        options.usage
      );
      // Only count as a change when the model actually emitted file/patch tags
      // (prose replies mean "could not fix" — do not mark the tree modified).
      if (!/<(?:file|patch)\s+path=/i.test(fixed)) break;
      const updated = parseMultiFileXml(fixed, files);
      if (updated.length === 0) break;
      changed = true;
      files = updated;

      // Re-run gates + re-review on the fixed tree to confirm the fix landed.
      const newStatic = findMissingModuleRefs(files);
      jsonIssues = findInvalidJson(files);
      formIssues = findFormMismatches(files, options.formFactor);
      let newReview: ReviewIssue[] = [];
      if (systematic) {
        try {
          const raw = await callLLM(buildReviewPrompt(files), reviewCfg, () => {}, undefined, {
            temperature: 0.1,
            usage: options.usage
          });
          newReview = parseReviewOutput(raw);
        } catch (err: any) {
          log(`Re-review failed: ${err.message}`, 'warn');
        }
      }
      const nextErrors = [...formToFindings(formIssues), ...mergeFindings(newStatic, jsonIssues, newReview)].filter(f => f.severity === 'error');
      for (const f of nextErrors) pushConfirmed(f);

      // Stop when nothing still-erroneous remains, or when a pass produced no
      // progress (the same errors persist unchanged) to bound the token cost.
      const stillThere = errorFindings.filter(
        o => nextErrors.some(n => n.file === o.file && n.message === o.message)
      );
      errorFindings = nextErrors;
      if (errorFindings.length === 0) break;
      if (stillThere.length === errorFindings.length) break; // no progress — stop.
    } catch (err: any) {
      log(`Consolidation fix pass ${passesUsed} failed: ${err.message}`, 'error');
      break;
    }
  }

  // 5. Delivery report.
  const report = buildDeliveryReport(files, staticIssues, jsonIssues, reviewIssues, confirmedIssues, passesUsed, changed, formIssues, options.formFactor, reviewerLabel(config));
  return { files, staticIssues, jsonIssues, formIssues, reviewIssues, confirmedIssues, passesUsed, changed, report };
}

export interface ConsolidationSummary {
  /** Total findings the agent detected (static gates + reviewer errors/warnings). */
  found: number;
  /** Auto-fix passes that modified files (0 when nothing changed). */
  fixed: number;
  /** Confirmed issues left for human review. */
  remaining: number;
  /** Reviewer warnings (non-blocking, worth a look). */
  warnings: ReviewIssue[];
}

/** Derives the Delivery panel's found / fixed / remaining numbers from a result. */
export function summarizeConsolidation(result: ConsolidationResult): ConsolidationSummary {
  return {
    found:
      result.staticIssues.length +
      result.jsonIssues.length +
      (result.formIssues?.length ?? 0) +
      result.reviewIssues.filter(i => i.severity !== 'info').length,
    fixed: result.changed ? result.passesUsed : 0,
    remaining: result.confirmedIssues.length,
    warnings: result.reviewIssues.filter(i => i.severity === 'warning')
  };
}

/** Renders the human-readable delivery report. */
export function buildDeliveryReport(
  files: ProjectArtifactFile[],
  staticIssues: MissingModuleRef[],
  jsonIssues: InvalidJson[],
  reviewIssues: ReviewIssue[],
  confirmedIssues: Array<{ kind: 'static' | 'review'; file: string; message: string }>,
  passesUsed: number,
  changed: boolean,
  formIssues: FormMismatch[] = [],
  formFactor?: FormFactor,
  reviewerLabel?: string
): string {
  const lines: string[] = ['--- CONSOLIDATION REPORT ---'];
  // P3: honest reviewer indicator — never oversell the review when the reviewer
  // is the same model as the generator (confirmation-bias caveat).
  if (reviewerLabel) lines.push(`Reviewer: ${reviewerLabel}`);
  if (staticIssues.length === 0 && jsonIssues.length === 0 && formIssues.length === 0 && confirmedIssues.length === 0) {
    lines.push('✅ No confirmed defects found.');
  }
  if (staticIssues.length > 0) {
    lines.push(`Static import gate: ${staticIssues.length} missing file(s):`);
    for (const s of staticIssues) lines.push(`  - ${s.resolved} (imported by ${s.importer})`);
  }
  if (jsonIssues.length > 0) {
    lines.push(`Static JSON gate: ${jsonIssues.length} invalid JSON file(s):`);
    for (const j of jsonIssues) lines.push(`  - ${j.file}: ${j.reason}`);
  }
  if (formIssues.length > 0) {
    lines.push(`Form gate (${formFactor ?? 'cli'}): ${formIssues.length} mismatch(es) with the chosen execution form:`);
    for (const f of formIssues) lines.push(`  - ${f.file}: ${f.reason}`);
  }
  const reviewWarnings = reviewIssues.filter(i => i.severity === 'warning');
  if (reviewWarnings.length > 0) {
    lines.push(`Reviewer warnings (not blocking, worth a look):`);
    for (const w of reviewWarnings) lines.push(`  - [${w.severity}] ${w.file}: ${w.message}`);
  }
  if (passesUsed > 0) {
    lines.push(`Auto-fix: ${passesUsed} consolidation pass(es) applied (${changed ? 'files modified' : 'no change'}).`);
  }
  if (confirmedIssues.length > 0) {
    lines.push(`Confirmed issues remaining (need human review): ${confirmedIssues.length}`);
  }
  lines.push(`Delivered ${files.length} file(s) for user testing.`);
  lines.push('--- END CONSOLIDATION REPORT ---');
  return lines.join('\n');
}
