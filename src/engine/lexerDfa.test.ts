import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { tokenize } from './iplParser';
import { runLexerDfa } from './lexerDfa';

/**
 * Machine-checked claim (Phase 14): the IPL tokenizer *is* a DFA. The DFA in
 * `lexerDfa.ts` must agree token-for-token with the canonical scanner in
 * `iplParser.ts` over the whole corpus and a set of lexical edge cases.
 *
 * Positions and the two soft diagnostics are out of scope (the canonical
 * scanner owns them); only the `(type, value)` stream is compared.
 */

const key = (t: { type: string; value: string }): string => `${t.type}:${t.value}`;
const CORPUS_ROOT = path.resolve(process.cwd(), 'corpus');

function iplFiles(dir: string): string[] {
  try {
    return readdirSync(dir).filter(f => f.endsWith('.ipl')).sort().map(f => path.join(dir, f));
  } catch {
    return [];
  }
}

const files = [
  ...iplFiles(path.join(CORPUS_ROOT, 'single')),
  ...iplFiles(path.join(CORPUS_ROOT, 'edge')),
];

describe('lexerDfa — agreement with the canonical tokenizer over the corpus', () => {
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    it(path.basename(file), () => {
      const src = readFileSync(file, 'utf8');
      expect(runLexerDfa(src).map(key)).toEqual(tokenize(src).tokens.map(key));
    });
  }
});

const EDGE_CASES: Record<string, string> = {
  'empty': '',
  'whitespace only': ' \t\r\n  \n',
  'decimal / frac / exponent / hex': 'a 1 1. 1.5 .5 1e5 1e+5 1E-3 0x1f 0xFFg 08 1.2.3',
  'identifiers': 'foo _bar $baz x1 _ e E a1Z',
  'two-char operators': 'a == b != c >= d <= e && f || g',
  'single operators': 'a = b < c > d + e - f * g / h ! i',
  'lone ampersand/pipe are punctuation': 'a & b | c',
  'punctuation': '{}()[],;:',
  'line then block comment': 'a // trailing\nb /* x * y ** / z */ c',
  'nested-star block comment': '/* a /* b */ c',
  'dsl string with escapes': 'msg "he said \\"hi\\" \\n done" nl',
  'single-quoted string': "s 'a \\' b' next",
  'string spanning a line': '"line one\ntwo" tail',
  'unterminated string (token only)': 'a "oops',
  'irregular characters': 'a @ # % ` ~ ? €',
  'no trailing newline': 'send r to screen { format: "json" }',
};

describe('lexerDfa — agreement on lexical edge cases', () => {
  for (const [name, src] of Object.entries(EDGE_CASES)) {
    it(name, () => {
      expect(runLexerDfa(src).map(key)).toEqual(tokenize(src).tokens.map(key));
    });
  }
});
