import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { validateIPLCode, parseIPLToTree, resolveIPLProject, validateIPLProject } from '../src/engine/iplGrammar';
import { treeToIPLCode } from '../src/components/BlockViewEditor';
import type { SyntaxErrorItem } from '../src/engine/iplParser';

/**
 * Language corpus — the "rails, not walls" torture test.
 *
 * Every spec under corpus/ must:
 *  1. parse without throwing (no parser crash on any input),
 *  2. only ever emit `info | warning` diagnostics (never hard errors),
 *  3. survive the block-editor round-trip: parse → treeToIPLCode → reparse
 *     produces the exact same set of diagnostic messages (the spec's intent is
 *     not deformed by serialization).
 *
 * Multi-file projects under corpus/projects/ additionally exercise recursive
 * import resolution: nested imports resolve fully, cycles terminate cleanly,
 * and a missing import is reported as a warning (not a crash).
 *
 * Fully deterministic, no LLM involved — runs on every CI push for free.
 */

const CORPUS_ROOT = path.resolve(process.cwd(), 'corpus');

function listIplFiles(dir: string): string[] {
  return readdirSync(dir).filter(f => f.endsWith('.ipl')).sort();
}

function onlyAdvisory(diags: SyntaxErrorItem[]): string[] {
  const hard = diags.filter(d => d.severity !== 'info' && d.severity !== 'warning');
  return hard.map(d => `${d.severity ?? 'undefined'}:${d.message}`);
}

const messageKey = (d: SyntaxErrorItem) => `${d.severity}:${d.message}`;

function checkSpec(name: string, code: string): void {
  let diags: SyntaxErrorItem[];
  expect(() => { diags = validateIPLCode(code); }).not.toThrow();
  diags = validateIPLCode(code);
  expect(onlyAdvisory(diags), `${name}: non-advisory diagnostics`).toEqual([]);

  // Block-editor round-trip must preserve the spec's diagnostic fingerprint.
  let roundtripped: string;
  expect(() => {
    roundtripped = treeToIPLCode(parseIPLToTree(code));
  }, `${name}: round-trip threw`).not.toThrow();
  roundtripped = treeToIPLCode(parseIPLToTree(code));

  const rtDiags = validateIPLCode(roundtripped);
  expect(onlyAdvisory(rtDiags), `${name}: round-trip introduced non-advisory diagnostics`).toEqual([]);
  expect(rtDiags.map(messageKey).sort(), `${name}: round-trip changed the diagnostic fingerprint`).toEqual(diags.map(messageKey).sort());
}

describe('corpus — single-file specs (12 verbs × 7 intent types + combined)', () => {
  const dir = path.join(CORPUS_ROOT, 'single');
  const files = listIplFiles(dir);
  expect(files.length).toBeGreaterThan(0);

  for (const f of files) {
    it(`parses cleanly and survives the round-trip: ${f}`, () => {
      checkSpec(f, readFileSync(path.join(dir, f), 'utf8'));
    });
  }
});

describe('corpus — edge cases (comments, strings, nesting, one-liners)', () => {
  const dir = path.join(CORPUS_ROOT, 'edge');
  const files = listIplFiles(dir);
  expect(files.length).toBeGreaterThan(0);

  for (const f of files) {
    it(`parses cleanly and survives the round-trip: ${f}`, () => {
      checkSpec(f, readFileSync(path.join(dir, f), 'utf8'));
    });
  }
});

describe('corpus — multi-file projects (import resolution)', () => {
  const root = path.join(CORPUS_ROOT, 'projects');
  const projects = readdirSync(root).filter(d => existsSync(path.join(root, d, 'main.ipl'))).sort();
  expect(projects.length).toBeGreaterThan(0);

  const EXPECT_UNRESOLVED: Record<string, string[]> = {
    nested: [],
    cycle: [],
    missing: ['does-not-exist.ipl']
  };

  for (const name of projects) {
    it(`${name}: imports resolve deterministically with advisory-only diagnostics`, () => {
      const dir = path.join(root, name);
      const files = listIplFiles(dir);
      const sourceFiles: Record<string, string> = {};
      for (const f of files) {
        sourceFiles[f] = readFileSync(path.join(dir, f), 'utf8');
        checkSpec(`${name}/${f}`, sourceFiles[f]);
      }

      const mainCode = sourceFiles['main.ipl'];
      const { code, unresolved } = resolveIPLProject(mainCode, sourceFiles, 'main.ipl');
      expect(code.length).toBeGreaterThan(0);

      const expected = EXPECT_UNRESOLVED[name] ?? [];
      expect(unresolved.map(u => u.file).sort(), `${name}: unresolved imports`).toEqual(expected);

      const diags = validateIPLProject(mainCode, sourceFiles, 'main.ipl');
      expect(onlyAdvisory(diags), `${name}: non-advisory diagnostics`).toEqual([]);
    });
  }
});
