import { describe, expect, it } from 'vitest';
import { validateIPLCode, IPL_LANGUAGE_DEFINITION } from './iplGrammar.ts';
import { grammarSignatureText, renderVerbTable, renderIntentTypeTable, IPL_VERBS, IPL_INTENT_TYPES } from './iplCore.ts';

describe('combined validateIPLCode', () => {
  it('merges syntax and semantic diagnostics', () => {
    const errs = validateIPLCode('add entity User {\n  name: text,\n  age: integer\n}\nset ghost.state = "x"\n');
    const messages = errs.map(e => e.message);
    expect(messages.some(m => m.includes('Unknown intent type "integer"'))).toBe(true);
    expect(messages.some(m => m.includes('never declared or produced'))).toBe(true);
  });

  it('stays advisory only (info or warning, never error)', () => {
    const errs = validateIPLCode('add entity User {');
    expect(errs.length).toBeGreaterThan(0);
    for (const e of errs) {
      expect(['info', 'warning']).toContain(e.severity);
    }
  });
});

describe('grammar signature (data-driven)', () => {
  it('embeds the verb and type tables', () => {
    const text = grammarSignatureText();
    expect(text).toContain('The 12 Canonical Action Verbs');
    expect(text).toContain('The 7 Human Intent Types');
    expect(text).toContain('| Verb |');
    expect(text).toContain('| Type |');
  });

  it('renders exactly one row per verb and per intent type', () => {
    const verbRows = renderVerbTable().split('\n').filter(l => l.startsWith('| `'));
    expect(verbRows).toHaveLength(IPL_VERBS.length);
    const typeRows = renderIntentTypeTable().split('\n').filter(l => l.startsWith('| `'));
    expect(typeRows).toHaveLength(IPL_INTENT_TYPES.length);
  });

  it('renders options with its (...) suffix in the type table', () => {
    expect(renderIntentTypeTable()).toContain('| `options(...)`');
  });
});

describe('data-driven Monarch typeKeywords', () => {
  it('derives intent types from iplCore and strips the (...) suffix', () => {
    expect(IPL_LANGUAGE_DEFINITION.typeKeywords).toContain('text');
    expect(IPL_LANGUAGE_DEFINITION.typeKeywords).toContain('number');
    expect(IPL_LANGUAGE_DEFINITION.typeKeywords).toContain('options');
    expect(IPL_LANGUAGE_DEFINITION.typeKeywords).not.toContain('options(...)');
  });
});
