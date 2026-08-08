/**
 * Deterministic IPL pre-generation repair ("the model understands clean input").
 *
 * Before sending a spec to the LLM, apply the *fixable* diagnostics produced by
 * validateIPLCode (close an unterminated string, insert a missing closing brace)
 * on a copy of the code. This is advisory tooling — the user's editor buffer is
 * never modified, and remaining warnings still reach the model (rails, not walls).
 */
import { validateIPLCode } from './iplGrammar.ts';
import type { SyntaxErrorItem } from './iplParser.ts';

export interface IPLPreRepairResult {
  code: string;
  applied: Array<{ line: number; message: string; fixLabel: string }>;
  remaining: SyntaxErrorItem[];
}

const MAX_FIX_PASSES = 8;

/** Converts a 1-based (line, column) pair to a 0-based offset in `code`. */
function offsetAt(code: string, line: number, column: number): number {
  let idx = 0;
  let currentLine = 1;
  while (currentLine < line) {
    const nl = code.indexOf('\n', idx);
    if (nl === -1) return code.length;
    idx = nl + 1;
    currentLine++;
  }
  return idx + Math.max(0, column - 1);
}

/** Replaces the source range covered by a quick-fix (column..endColumn, 1-based). */
function applyRangeFix(code: string, d: SyntaxErrorItem): string | null {
  const fix = d.fix;
  if (!fix || !d.endColumn || d.endColumn <= d.column) return null;
  const start = offsetAt(code, d.line, d.column);
  const end = offsetAt(code, d.line, d.endColumn);
  if (end <= start || end > code.length) return null;
  return code.slice(0, start) + fix.newText + code.slice(end);
}

/** Appends a quick-fix that targets end-of-file (e.g. unclosed block brace). */
function applyAppendFix(code: string, d: SyntaxErrorItem): string | null {
  const fix = d.fix;
  if (!fix) return null;
  const brace = fix.newText.trim();
  if (!brace.includes('}')) return null;
  return code.replace(/\s*$/, '') + '\n' + brace + '\n';
}

/**
 * Applies all fixable diagnostics iteratively until the code stabilizes.
 * Unfixable (semantic / informational) diagnostics are reported as `remaining`.
 */
export function applyIPLQuickFixes(code: string): IPLPreRepairResult {
  let working = code;
  const applied: IPLPreRepairResult['applied'] = [];
  const seen = new Set<string>();

  for (let pass = 0; pass < MAX_FIX_PASSES; pass++) {
    const diagnostics = validateIPLCode(working);
    const fixable = diagnostics.filter(d => d.fix && !seen.has(`${d.line}:${d.column}:${d.fix.label}`));
    if (fixable.length === 0) {
      return { code: working, applied, remaining: diagnostics };
    }

    // Apply fixes bottom-up so earlier offsets stay valid.
    let changed = false;
    for (const d of fixable.sort((a, b) => b.line - a.line || (b.column ?? 0) - (a.column ?? 0))) {
      const key = `${d.line}:${d.column}:${d.fix!.label}`;
      const fixed = d.fix!.newText.trim() === '}' ? applyAppendFix(working, d) : applyRangeFix(working, d);
      if (fixed && fixed !== working) {
        working = fixed;
        applied.push({ line: d.line, message: d.message, fixLabel: d.fix!.label });
        seen.add(key);
        changed = true;
      }
    }
    if (!changed) break;
  }

  return { code: working, applied, remaining: validateIPLCode(working) };
}
