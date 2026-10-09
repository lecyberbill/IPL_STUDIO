import { describe, it, expect } from 'vitest';
import { validateIPLCode, parseIPLToTree, validateIPLProject, resolveIPLProject } from './iplGrammar';

/**
 * Fuzz hardening for the core promise: "rails, not walls". The parser must
 * NEVER throw and must only ever emit advisory diagnostics (`info | warning`),
 * no matter how malformed the input is — because the input can be raw LLM
 * output or a user drafting an intent. A deterministic PRNG keeps it reproducible
 * in CI (no flakes, no external entropy).
 */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(0xc0ffee);
const rand = (n: number): number => Math.floor(rng() * n);

const RAW_CHARS =
  'abcXYZ019 \t\n\r{}()[],;:.=<>+-*/!&|"\'\\_#@\u00e9\u20ac\u03c0/ *<>\n';

const TOKENS = [
  'add', 'entity', 'seed', 'read', 'send', 'listen', 'compute', 'if', 'else', 'for', 'in',
  'try', 'catch', 'return', 'import', 'from', 'on', 'to', 'where', 'format',
  '"str"', "'s'", '{', '}', '(', ')', '[', ']', ':', ';', ',', '.', '=', '==', '!=', '>=',
  '1', '2.5', '0x1f', '1e5', 'text', 'number', 'options', '"json"', 'true', 'false',
  '// comment', '/* block */', '\\', '@', '_x', '$y', '\n'
];

function randomRaw(maxLen: number): string {
  const len = rand(maxLen + 1);
  let out = '';
  for (let i = 0; i < len; i++) out += RAW_CHARS[rand(RAW_CHARS.length)];
  return out;
}

function randomTokens(maxCount: number): string {
  const count = rand(maxCount + 1);
  const parts: string[] = [];
  for (let i = 0; i < count; i++) parts.push(TOKENS[rand(TOKENS.length)]);
  return parts.join(rand(2) ? ' ' : '\n');
}

describe('parser fuzz — arbitrary input never throws (rails, not walls)', () => {
  it(`${2000} random inputs: validate + parse + tree, all advisory-only`, () => {
    const failures: string[] = [];
    for (let i = 0; i < 2000; i++) {
      const input = i % 2 === 0 ? randomRaw(90) : randomTokens(32);
      try {
        const diags = validateIPLCode(input);
        const hard = diags.filter(d => d.severity !== 'info' && d.severity !== 'warning');
        if (hard.length > 0) failures.push(`non-advisory diagnostic on ${JSON.stringify(input)}: ${hard.map(d => d.severity).join(',')}`);
        parseIPLToTree(input);
        validateIPLProject(input, { 'other.ipl': randomTokens(12) });
      } catch (e) {
        failures.push(`threw on ${JSON.stringify(input).slice(0, 120)}: ${(e as Error).message}`);
      }
    }
    expect(failures.slice(0, 5), `${failures.length} fuzz failures (showing 5)`).toEqual([]);
  });

  it('cyclic / self-referential imports resolve without hanging or throwing', () => {
    const files = {
      'a.ipl': 'import "b.ipl";\nadd entity A { id: id }',
      'b.ipl': 'import "a.ipl";\nimport "b.ipl";\nadd entity B { id: id }'
    };
    let result: ReturnType<typeof resolveIPLProject> | undefined;
    expect(() => { result = resolveIPLProject('import "a.ipl";', files, 'main.ipl'); }).not.toThrow();
    expect(result!.unresolved).toEqual([]);
    expect(typeof result!.code).toBe('string');
  });
});
