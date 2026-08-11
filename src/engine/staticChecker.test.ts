import { describe, it, expect } from 'vitest';
import { findMissingModuleRefs, normalizeRelative, resolveCandidates, extractRelativeImports } from './staticChecker';
import type { ProjectArtifactFile } from './artifactGenerator';

const file = (relativePath: string, content: string): ProjectArtifactFile => ({ relativePath, content });

describe('normalizeRelative', () => {
  it('strips ./ and leading slashes', () => {
    expect(normalizeRelative('./entities')).toBe('entities');
    expect(normalizeRelative('entities')).toBe('entities');
    expect(normalizeRelative('/entities')).toBe('entities');
  });

  it('collapses .. segments', () => {
    expect(normalizeRelative('../lib/util')).toBe('lib/util');
    expect(normalizeRelative('src/../lib')).toBe('lib');
    expect(normalizeRelative('../../x/y')).toBe('x/y');
  });

  it('normalizes backslashes', () => {
    expect(normalizeRelative('.\\entities')).toBe('entities');
  });
});

describe('resolveCandidates', () => {
  it('probes extensions and index files', () => {
    const cands = resolveCandidates('src/index.js', './entities');
    expect(cands).toContain('src/entities.js');
    expect(cands).toContain('src/entities/index.js');
    expect(cands).toContain('src/entities.py');
  });

  it('resolves relative to the importer directory', () => {
    const cands = resolveCandidates('src/app/main.js', '../config');
    expect(cands).toContain('src/config.js');
  });
});

describe('extractRelativeImports', () => {
  it('catches require(), from-import and dynamic import in JS/TS', () => {
    const f = file('src/index.js', `const a = require('./entities');\nimport x from '../lib/util';\nconst d = import('./db');`);
    expect(extractRelativeImports(f)).toEqual(expect.arrayContaining(['./entities', '../lib/util', './db']));
  });

  it('catches relative and dotted Python imports', () => {
    const f = file('src/models/order.py', `from . import config\nfrom ..base import Entity\nimport models\n`);
    expect(extractRelativeImports(f)).toEqual(expect.arrayContaining(['.config', '..base']));
    // `import models` (top-level) is captured separately from `from ... import`.
    expect(extractRelativeImports(f)).toContain('models');
  });

  it('ignores non-relative specifiers', () => {
    const f = file('src/index.js', `const a = require('express');\nimport b from 'flask';`);
    expect(extractRelativeImports(f)).toEqual([]);
  });

  it('is a no-op for languages without relative-file imports (Go)', () => {
    const f = file('main.go', `import "fmt"\nimport "github.com/x/y"\n`);
    expect(extractRelativeImports(f)).toEqual([]);
  });
});

describe('findMissingModuleRefs', () => {
  it('flags the coffee-shop bug: ./entities required but never generated', () => {
    const files = [
      file('src/index.js', `const OrderService = require('./orderService');\nconst { Drink } = require('./entities');`),
      file('src/orderService.js', `const { Order } = require('./entities');`)
    ];
    const missing = findMissingModuleRefs(files);
    expect(missing.length).toBeGreaterThanOrEqual(2);
    expect(missing.every(m => m.resolved === 'src/entities.js')).toBe(true);
    expect(missing[0].suggestion).toContain('entities.js');
  });

  it('does NOT flag imports that resolve to a generated file', () => {
    const files = [
      file('src/index.js', `const OrderService = require('./orderService');`),
      file('src/orderService.js', `module.exports = {};`)
    ];
    expect(findMissingModuleRefs(files)).toEqual([]);
  });

  it('resolves relative imports across directories', () => {
    const files = [
      file('src/app/main.js', `import { helper } from '../lib/helper';`),
      file('src/lib/helper.js', `module.exports = {};`)
    ];
    expect(findMissingModuleRefs(files)).toEqual([]);
  });

  it('reports missing parent-package Python imports', () => {
    const files = [
      file('src/models/order.py', `from .config import settings`),
      file('src/models/config.py', `settings = {}`)
    ];
    expect(findMissingModuleRefs(files)).toEqual([]);

    const broken = [
      file('src/models/order.py', `from .config import settings`)
    ];
    const missing = findMissingModuleRefs(broken);
    expect(missing.length).toBe(1);
    expect(missing[0].resolved).toBe('src/models/config.py');
    expect(missing[0].specifier).toBe('.config');
  });
});
