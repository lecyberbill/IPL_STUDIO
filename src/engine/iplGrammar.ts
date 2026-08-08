/**
 * Specification and Grammar of IPL v1.0 (Intent Programming Language)
 * Monarch tokenizer for Monaco, brace validation, import preprocessor, and symbol extraction.
 *
 * The verb/type data model lives in iplCore.ts (single source of truth) and the
 * real parser + soft diagnostics live in iplParser.ts. This module re-exports
 * both so existing imports keep working unchanged.
 */

import { IPL_VERBS, IPL_INTENT_TYPES } from './iplCore.ts';

// Re-export the core data model (verbs + intent types) for backwards compatibility.
export { IPL_VERBS, IPL_INTENT_TYPES, renderVerbTable, renderIntentTypeTable, grammarSignatureText } from './iplCore.ts';
export type { IPLVerb, IPLTypeDefinition } from './iplCore.ts';

// Re-export the parser and its types for backwards compatibility.
export { validateIPLCode, parseIPL, parseIPLToTree } from './iplParser.ts';
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

/**
 * Recursively resolves `import "file.ipl"` directives in IPL source code
 */
export function resolveIPLImports(mainCode: string, sourceFiles: Record<string, string> = {}): string {
  const importRegex = /import\s+["']([^"']+)["'];?/g;
  return mainCode.replace(importRegex, (match, importedFile) => {
    if (sourceFiles[importedFile]) {
      return `// --- Imported from ${importedFile} ---\n${sourceFiles[importedFile]}\n`;
    }
    return match;
  });
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
