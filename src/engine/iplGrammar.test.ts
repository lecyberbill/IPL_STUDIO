import { describe, expect, it } from 'vitest';
import { validateIPLCode, validateIPLProject, resolveIPLProject, resolveIPLImports, IPL_LANGUAGE_DEFINITION } from './iplGrammar.ts';
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
    expect(text).toContain(`The ${IPL_VERBS.length} Canonical Action Verbs`);
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

describe('resolveIPLProject (Phase 7 multi-file)', () => {
  const FILES = {
    'main.ipl': 'import "a.ipl";\nadd entity Root {\n  name: text\n}\n',
    'a.ipl': 'import "b.ipl";\nadd entity A {\n  name: text\n}\n',
    'b.ipl': 'add entity B {\n  name: text\n}\n'
  };

  it('inlines a single-level import', () => {
    const { code, unresolved } = resolveIPLProject('import "b.ipl";\nadd entity Root { name: text }\n', FILES, 'main.ipl');
    expect(code).toContain('// --- Imported from b.ipl ---');
    expect(code).toContain('add entity B');
    expect(code).not.toContain('import "b.ipl"');
    expect(unresolved).toHaveLength(0);
  });

  it('follows nested imports recursively', () => {
    const { code, unresolved } = resolveIPLProject(FILES['main.ipl'], FILES, 'main.ipl');
    expect(code).toContain('// --- Imported from a.ipl ---');
    expect(code).toContain('// --- Imported from b.ipl ---');
    expect(code).toContain('add entity B');
    expect(code).toContain('add entity A');
    expect(code).toContain('add entity Root');
    expect(unresolved).toHaveLength(0);
  });

  it('guards against import cycles without infinite recursion', () => {
    const cyclic = {
      'main.ipl': 'import "a.ipl";\n',
      'a.ipl': 'import "main.ipl";\nadd entity A { name: text }\n'
    };
    const { code, unresolved } = resolveIPLProject(cyclic['main.ipl'], cyclic, 'main.ipl');
    expect(code).toContain('// --- main.ipl already included above ---');
    expect(code).toContain('add entity A');
    expect(unresolved).toHaveLength(0);
  });

  it('dedupes a file imported twice (diamond) and marks the second inclusion', () => {
    const diamond = {
      'main.ipl': 'import "a.ipl";\nimport "b.ipl";\nadd entity Root { name: text }\n',
      'a.ipl': 'import "c.ipl";\nadd entity A { name: text }\n',
      'b.ipl': 'import "c.ipl";\nadd entity B { name: text }\n',
      'c.ipl': 'add entity C { name: text }\n'
    };
    const { code } = resolveIPLProject(diamond['main.ipl'], diamond, 'main.ipl');
    const cOccurrences = code.split('add entity C').length - 1;
    expect(cOccurrences).toBe(1);
    expect(code).toContain('// --- c.ipl already included above ---');
  });

  it('reports unresolved imports and keeps the import line verbatim', () => {
    const { code, unresolved } = resolveIPLProject('import "missing.ipl";\n', { 'main.ipl': 'import "missing.ipl";\n' }, 'main.ipl');
    expect(code).toContain('import "missing.ipl"');
    expect(unresolved).toEqual([{ file: 'missing.ipl', importedFrom: '<main>' }]);
  });

  it('resolveIPLImports stays a thin backwards-compatible wrapper', () => {
    const merged = resolveIPLImports('import "b.ipl";\nadd entity Root { name: text }\n', FILES);
    expect(merged).toContain('add entity B');
    expect(merged).not.toContain('import "b.ipl"');
  });
});

describe('validateIPLProject (Phase 7 cross-file semantics)', () => {
  it('resolves references across files (no unknown-target warning)', () => {
    const files = {
      'main.ipl': 'import "orders.ipl";\nadd entity orderData {\n  name: text,\n  status: text\n}\n',
      'orders.ipl': 'set orderData.status = "done"\n'
    };
    // The submodule alone cannot see the entity declared in main...
    expect(validateIPLCode(files['orders.ipl']).some(e => e.message.includes('never declared or produced'))).toBe(true);
    // ...but the merged project resolves it.
    const diags = validateIPLProject(files['main.ipl'], files, 'main.ipl');
    expect(diags.some(e => e.message.includes('never declared or produced'))).toBe(false);
  });

  it('detects duplicate declarations across files', () => {
    const files = {
      'main.ipl': 'import "users.ipl";\nadd entity User {\n  name: text\n}\n',
      'users.ipl': 'add entity User {\n  name: text\n}\n'
    };
    const diags = validateIPLProject(files['main.ipl'], files, 'main.ipl');
    expect(diags.some(e => e.message.includes('Duplicate declaration of "User"'))).toBe(true);
  });

  it('surfaces unresolved imports as project-wide warnings', () => {
    const files = {
      'main.ipl': 'import "ghost.ipl";\nadd entity Root { name: text }\n'
    };
    const diags = validateIPLProject(files['main.ipl'], files, 'main.ipl');
    expect(diags.some(e => e.message.includes('Unresolved import "ghost.ipl"'))).toBe(true);
  });
});
