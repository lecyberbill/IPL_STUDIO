/**
 * LLM review pass — "the reviewer who is NOT an IPL specialist".
 *
 * After the static checker has caught the mechanical holes (missing imports),
 * this pass hands the ENTIRE generated codebase to a fresh LLM whose only job
 * is to read it and find the holes that regex cannot see: a symbol used but
 * never defined, a function called with the wrong signature, an entity field
 * referenced in one file but absent from its definition, two files duplicating
 * state inconsistently, a data race, a swallowed error path...
 *
 * Deliberately, the prompt contains ZERO IPL knowledge: the reviewer is told
 * "these are plain source files" and asked to review them as a skeptical senior
 * code reviewer would. The moment we taught it IPL grammar we would bias it
 * toward checking spec-conformance rather than plain code integrity — and the
 * value here is the fresh, language-agnostic eye on the generated artifact.
 *
 * The pass is split into a pure prompt builder + a pure output parser so the
 * module stays unit-testable without any network, mirroring staticChecker.ts.
 */

import type { ProjectArtifactFile } from './artifactGenerator';

export interface ReviewIssue {
  severity: 'error' | 'warning' | 'info';
  file: string;
  message: string;
  suggestion?: string;
}

/**
 * Builds the reviewer prompt from the artifact's files. No IPL concepts are
 * mentioned — the files are presented as an ordinary multi-file codebase.
 */
export function buildReviewPrompt(files: ProjectArtifactFile[]): string {
  const listing = files
    .map(f => `### FILE ${f.relativePath}\n\`\`\`\n${f.content}\n\`\`\``)
    .join('\n\n');

  return `You are a skeptical senior code reviewer. You are reviewing a small multi-file source tree. Your job is to find REAL defects — not style nits.

Look specifically for:
1. References to files, modules, classes, functions, or variables that do not exist in this tree (missing imports, typos in names, undefined symbols).
2. Function/method calls whose arguments do not match the called signature.
3. Data the program reads that nothing ever produces (fields read but never set, inputs that come from nowhere).
4. Errors that are silently swallowed, or control flow that can never reach a branch.
5. Inconsistent duplicated state between files.
6. Anything that would make the program crash at runtime or fail to do what its own code implies it should do.

For each defect, reply with a JSON object of the form:
{ "issues": [ { "severity": "error|warning|info", "file": "relative/path", "message": "what is wrong", "suggestion": "concrete fix" } ] }

Only list REAL defects. If the code is sound, reply: { "issues": [] }

SOURCE TREE:
${listing}`;
}

/**
 * Extracts the issues array from a raw LLM review response. Resilient to
 * code fences and prose around the JSON, returning [] on unparseable output.
 */
export function parseReviewOutput(text: string): ReviewIssue[] {
  const block = text.match(/```json\s*([\s\S]*?)```/);
  const candidate = block ? block[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) return [];
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    const issues = Array.isArray(parsed.issues) ? parsed.issues : [];
    return issues
      .filter((i: unknown): i is ReviewIssue => {
        const r = i as Record<string, unknown>;
        return (
          typeof r?.file === 'string' &&
          typeof r?.message === 'string' &&
          (r.severity === undefined || r.severity === 'error' || r.severity === 'warning' || r.severity === 'info')
        );
      })
      .map((i: ReviewIssue) => ({
        severity: i.severity ?? 'warning',
        file: i.file,
        message: i.message,
        suggestion: i.suggestion
      }));
  } catch {
    return [];
  }
}
