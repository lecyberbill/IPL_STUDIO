/**
 * Runtime smoke check — deterministic, 0-token validation of the generated
 * code: per-language SYNTAX checks (`node --check`, `py_compile`, `rustc
 * --emit=metadata`, `gofmt -e`, `g++/gcc -fsyntax-only`) and, for CLI targets,
 * an actual bounded EXECUTION of the app (the benchmark's `verify` idea,
 * transposed into the IDE). Web targets are served and HTTP-GETted.
 *
 * The consolidation gates are static (imports/JSON/form/IPL/patch/truncation);
 * this closes part of the gap they cannot see: a file cut short or with a
 * syntax error "passes" every gate yet crashes at runtime. The actual checks
 * run in the dev server (a browser tab cannot spawn processes); this module
 * classifies which files need which check and maps languages to toolchains.
 */

import { DEFAULT_TOOL_NAMES } from './toolchains.js';
import type { ToolchainKey } from './toolchains.js';

export interface SmokeFileResult {
  /** The file that was checked. */
  file: string;
  /** True when the check passed (or no check applies). */
  ok: boolean;
  /** Compiler/stderr message when it failed. */
  error?: string;
  /** Toolchain that is missing (when the check could not even run). */
  tool?: string;
  /** Suggested install command for the missing toolchain (OS-aware). */
  installCommand?: string;
}

export interface MissingTool {
  tool: string;
  installCommand: string;
}

export interface SmokeResult {
  /** True when every applicable check passed and nothing is missing. */
  passed: boolean;
  /** Per-file results (only files that have a check). */
  files: SmokeFileResult[];
  /** Toolchains that are absent from PATH / Settings (install candidates). */
  missingTools: MissingTool[];
  /** Bounded execution result (CLI run / web HTTP GET), when the form allows it. */
  execution?: { ok: boolean; error?: string } | null;
}

export type SmokeLang = 'js' | 'python' | 'rust' | 'go' | 'cpp' | 'c';

export type SmokeVerdict = 'pass' | 'warn' | 'fail';

/**
 * Pure, 0-token delivery-gate verdict derived from a runtime smoke result.
 *
 * - `fail`: the app actually failed to RUN (crash / non-zero exit / web not
 *   served). This is exactly the runtime defect the shared-model reviewer
 *   ratifies ("document is not defined") — a deterministic second eye.
 * - `warn`: every applicable check did not pass (a syntax error, or a missing
 *   toolchain) but the app was not shown to crash — fixable, not a proven
 *   runtime blocker.
 * - `pass`: every check and the bounded execution passed.
 *
 * Advisory by default (rails, not walls): a gate surfaces the verdict; a caller
 * only hard-blocks by opting in (strictDelivery).
 */
export function smokeGateVerdict(r: SmokeResult): SmokeVerdict {
  if (r.execution && r.execution.ok === false) return 'fail';
  if (!r.passed) return 'warn';
  return 'pass';
}

/** Maps files to the deterministic syntax check they need (empty for the rest). */
export function classifySmokeFiles(
  files: Array<{ relativePath: string; content: string }>
): Array<{ file: string; lang: SmokeLang }> {
  const checks: Array<{ file: string; lang: SmokeLang }> = [];
  for (const f of files) {
    const p = f.relativePath.toLowerCase();
    if (/\.(js|mjs|cjs)$/.test(p)) checks.push({ file: f.relativePath, lang: 'js' });
    else if (/\.py$/.test(p)) checks.push({ file: f.relativePath, lang: 'python' });
    else if (/\.rs$/.test(p)) checks.push({ file: f.relativePath, lang: 'rust' });
    else if (/\.go$/.test(p)) checks.push({ file: f.relativePath, lang: 'go' });
    else if (/\.(cpp|cc|cxx)$/.test(p)) checks.push({ file: f.relativePath, lang: 'cpp' });
    else if (/\.c$/.test(p)) checks.push({ file: f.relativePath, lang: 'c' });
  }
  return checks;
}

/** The toolchain used by each language check. */
export const SMOKE_TOOL: Record<SmokeLang, ToolchainKey> = {
  js: 'node',
  python: 'python',
  rust: 'rustc',
  go: 'go',
  cpp: 'gpp',
  c: 'gcc'
};

/** Builds the argv for a language's syntax check given the file path. */
export function smokeCheckArgs(lang: SmokeLang, file: string): string[] {
  switch (lang) {
    case 'js': return ['--check', file];
    case 'python': return ['-m', 'py_compile', file];
    case 'rust': return ['--crate-type', 'lib', '--emit=metadata', '-o', `${file}.rmeta`, file];
    case 'go': return ['fmt', '-e', file];
    case 'cpp': return ['-fsyntax-only', file];
    case 'c': return ['-fsyntax-only', file];
  }
}

/** Human-friendly label for a missing toolchain. */
export function toolLabel(tool: ToolchainKey): string {
  return tool === 'gpp' ? 'g++' : DEFAULT_TOOL_NAMES[tool];
}
