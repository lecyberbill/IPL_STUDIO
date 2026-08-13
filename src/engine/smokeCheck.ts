/**
 * Runtime smoke check — deterministic, 0-token syntax validation of the
 * generated code (JS via `node --check`, Python via `py_compile`).
 *
 * The consolidation gates are static (imports/JSON/form/IPL/patch/truncation);
 * this closes part of the gap they cannot see: a JS/Python file cut short or
 * with a syntax error still "passes" every gate yet crashes at runtime (the
 * bonsai run's truncated index.html was inert, and the bench's `node --check`
 * keeps catching broken JS). The actual execution lives in the dev server
 * (a browser tab cannot spawn processes); this module only classifies which
 * files need which check.
 */

export interface SmokeFileResult {
  /** The file that was checked. */
  file: string;
  /** True when the syntax check passed. */
  ok: boolean;
  /** Compiler/stderr message when it failed. */
  error?: string;
}

export interface SmokeResult {
  /** True when every checked file passed. */
  passed: boolean;
  /** Per-file results (only files that have a check). */
  files: SmokeFileResult[];
}

export type SmokeLang = 'js' | 'python';

/** Maps files to the deterministic syntax check they need (empty for the rest). */
export function classifySmokeFiles(
  files: Array<{ relativePath: string; content: string }>
): Array<{ file: string; lang: SmokeLang }> {
  const checks: Array<{ file: string; lang: SmokeLang }> = [];
  for (const f of files) {
    const p = f.relativePath.toLowerCase();
    if (/\.(js|mjs|cjs)$/.test(p)) checks.push({ file: f.relativePath, lang: 'js' });
    else if (/\.py$/.test(p)) checks.push({ file: f.relativePath, lang: 'python' });
  }
  return checks;
}
