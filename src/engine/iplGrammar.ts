/**
 * Specification and Grammar of IPL v1.0 (Intent Programming Language)
 * Monarch tokenizer for Monaco, brace validation, import preprocessor, and symbol extraction.
 *
 * The verb/type data model lives in iplCore.ts (single source of truth) and the
 * real parser + soft diagnostics live in iplParser.ts. This module re-exports
 * both so existing imports keep working unchanged.
 */

import { IPL_VERBS, IPL_INTENT_TYPES } from './iplCore.ts';
import { validateIPLCode as validateIPLSyntax } from './iplParser.ts';
import { analyzeIPLSemantics } from './iplSemantics.ts';
import type { SyntaxErrorItem } from './iplParser.ts';

// Re-export the core data model (verbs + intent types) for backwards compatibility.
export { IPL_VERBS, IPL_INTENT_TYPES, renderVerbTable, renderIntentTypeTable, grammarSignatureText } from './iplCore.ts';
export type { IPLVerb, IPLTypeDefinition } from './iplCore.ts';

// Re-export the parser and its types for backwards compatibility.
export { parseIPL, parseIPLToTree } from './iplParser.ts';
export type {
  SyntaxErrorItem,
  IPLDiagnostic,
  IPLQuickFix,
  IPLSeverity,
  IPLBlockNode,
  IPLExpr,
  IPLProperty,
  IPLStatement,
  IPLStatementKind,
  IPLProgram,
  IPLParseResult
} from './iplParser.ts';

export { analyzeIPLSemantics, analyzeIPLProgram } from './iplSemantics.ts';

/**
 * Full advisory validation: syntactic checks from the parser PLUS semantic
 * cross-reference checks (duplicates, unknown intent types, unprotected I/O,
 * unknown set targets). Every diagnostic is `info` or `warning` — never
 * blocks generation.
 */
export function validateIPLCode(code: string): SyntaxErrorItem[] {
  return [...validateIPLSyntax(code), ...analyzeIPLSemantics(code)];
}

export interface IPLParsedProject {
  /** Merged union of main + transitive imports (deterministic, cycle-guarded). */
  code: string;
  /** Import paths that could not be resolved against the provided file map. */
  unresolved: { file: string; importedFrom: string }[];
}

/**
 * Phase 7 — recursively resolves `import "file.ipl"` directives in IPL source
 * code, following nested imports depth-first, guarding against cycles, and
 * reporting any import that cannot be resolved. Unresolved imports are kept
 * verbatim in the output (deterministic) but listed in `unresolved` so callers
 * can surface a diagnostic instead of failing silently.
 */
export function resolveIPLProject(
  mainCode: string,
  sourceFiles: Record<string, string> = {},
  rootFileName?: string
): IPLParsedProject {
  const unresolved: { file: string; importedFrom: string }[] = [];
  const visited = new Set<string>();
  if (rootFileName) visited.add(rootFileName);

  const importRegex = /import\s+["']([^"']+)["'];?/g;

  function resolve(code: string, fromFile: string | null): string {
    return code.replace(importRegex, (match, importedFile) => {
      if (visited.has(importedFile)) {
        return `// --- ${importedFile} already included above ---`;
      }
      visited.add(importedFile);
      const importedCode = sourceFiles[importedFile];
      if (importedCode === undefined) {
        unresolved.push({ file: importedFile, importedFrom: fromFile ?? '<main>' });
        return match;
      }
      return `// --- Imported from ${importedFile} ---\n${resolve(importedCode, importedFile)}\n`;
    });
  }

  return { code: resolve(mainCode, null), unresolved };
}

/** Backwards-compatible single-file resolver (returns only the merged text). */
export function resolveIPLImports(mainCode: string, sourceFiles: Record<string, string> = {}): string {
  return resolveIPLProject(mainCode, sourceFiles).code;
}

/**
 * Phase 7 — project-wide advisory validation. Merges main + transitive imports
 * into one document before running syntax + semantic checks, so duplicate
 * declarations and unknown references are detected ACROSS files, not just
 * inside a single file. Unresolved imports surface as warning diagnostics.
 */
export function validateIPLProject(
  mainCode: string,
  sourceFiles: Record<string, string> = {},
  rootFileName?: string
): SyntaxErrorItem[] {
  const { code, unresolved } = resolveIPLProject(mainCode, sourceFiles, rootFileName);
  const diags = validateIPLCode(code);
  for (const u of unresolved) {
    diags.push({
      line: 1,
      column: 1,
      severity: 'warning',
      message: `Unresolved import "${u.file}" (imported from ${u.importedFrom}) — module will not contribute to the build.`
    });
  }
  return diags;
}

export const IPL_LANGUAGE_DEFINITION = {
  defaultToken: '',
  tokenPostfix: '.ipl',

  keywords: IPL_VERBS.map(v => v.name),

  typeKeywords: [
    ...IPL_INTENT_TYPES.map(t => t.name.replace(/\(.*\)$/, '')),
    'entity', 'module', 'string', 'array', 'object'
  ],

  operators: [
    '=', '==', '!=', '>', '<', '>=', '<=', '+', '-', '*', '/', '&&', '||', '!'
  ],

  symbols:  /[=><!~?:&|+\-*\/\^%]+/,

  tokenizer: {
    root: [
      [/[a-z_$][\w$]*/, {
        cases: {
          '@keywords': 'keyword',
          '@typeKeywords': 'type',
          '@default': 'identifier'
        }
      }],
      [/[A-Z][\w$]*/, 'type'],
      { include: '@whitespace' },
      [/[{}()\[\]]/, '@brackets'],
      [/@symbols/, {
        cases: {
          '@operators': 'operator',
          '@default': ''
        }
      }],
      [/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'],
      [/0[xX][0-9a-fA-F]+/, 'number.hex'],
      [/\d+/, 'number'],
      [/[;,.]/, 'delimiter'],
      [/"([^"\\]|\\.)*"/, 'string'],
      [/'([^'\\]|\\.)*'/, 'string'],
    ],

    whitespace: [
      [/[ \t\r\n]+/, 'white'],
      [/\/\*/, 'comment', '@comment'],
      [/\/\/.*/, 'comment'],
    ],

    comment: [
      [/[^\/*]+/, 'comment'],
      [/\/\*/, 'comment', '@push'],
      [/\*\//, 'comment', '@pop'],
      [/[/*]/, 'comment']
    ]
  }
};

export interface IPLSymbol {
  name: string;
  kind: 'entity' | 'module' | 'event';
  line: number;
  column: number;
}

/**
 * Extracts all declared symbols in IPL script (add <name>, listen event on <name>, etc.)
 */
export function extractIPLSymbols(code: string): IPLSymbol[] {
  const symbols: IPLSymbol[] = [];
  const lines = code.split('\n');

  for (let l = 0; l < lines.length; l++) {
    const lineText = lines[l];
    const addMatch = lineText.match(/\badd\s+([a-zA-Z0-9_]+)\s*\{/);
    if (addMatch) {
      symbols.push({
        name: addMatch[1],
        kind: 'entity',
        line: l + 1,
        column: lineText.indexOf(addMatch[1]) + 1
      });
    }

    const eventMatch = lineText.match(/\blisten\s+event\s+on\s+["']([^"']+)["']/);
    if (eventMatch) {
      symbols.push({
        name: eventMatch[1],
        kind: 'event',
        line: l + 1,
        column: lineText.indexOf(eventMatch[1]) + 1
      });
    }
  }

  return symbols;
}
