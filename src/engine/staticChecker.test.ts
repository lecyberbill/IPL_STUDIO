import { describe, it, expect } from 'vitest';
import { findMissingModuleRefs, findFormMismatches, findIplLeakage, findPatchLeakage, findTruncatedFiles, findEsmScriptMismatch, normalizeRelative, resolveCandidates, extractRelativeImports } from './staticChecker';
import type { ProjectArtifactFile } from './artifactGenerator';

const file = (relativePath: string, content: string): ProjectArtifactFile => ({ relativePath, content });

describe('findTruncatedFiles (truncation gate)', () => {
  it('flags an HTML file that does not end with </html>', () => {
    const issues = findTruncatedFiles([file('index.html', '<div class="receipt-empty">\n<span')]);
    expect(issues).toHaveLength(1);
    expect(issues[0].file).toBe('index.html');
    expect(issues[0].reason).toContain('truncated');
  });

  it('accepts a complete HTML document', () => {
    expect(findTruncatedFiles([file('index.html', '<html><body><p>hi</p></body></html>')])).toEqual([]);
  });

  it('ignores non-HTML files', () => {
    expect(findTruncatedFiles([file('src/app.js', 'console.log(')])).toEqual([]);
  });
});

describe('findEsmScriptMismatch (ES module / script-tag gate)', () => {
  it('flags a <script src> without type="module" when the JS is an ES module', () => {
    const issues = findEsmScriptMismatch([
      file('index.html', '<script src="src/game.js"></script>'),
      file('src/game.js', 'export function tick() {}')
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0].file).toBe('index.html');
    expect(issues[0].reason).toContain('type="module"');
  });

  it('accepts a type="module" script tag for an ES module', () => {
    expect(findEsmScriptMismatch([
      file('index.html', '<script type="module" src="src/game.js"></script>'),
      file('src/game.js', 'export function tick() {}')
    ])).toEqual([]);
  });

  it('ignores classic (non-module) JS loaded as a classic script', () => {
    expect(findEsmScriptMismatch([
      file('index.html', '<script src="src/app.js"></script>'),
      file('src/app.js', 'function tick() {}')
    ])).toEqual([]);
  });
});

describe('findPatchLeakage (SEARCH/REPLACE markers are a syntax error)', () => {
  it('flags a stray ======= separator line in generated code', () => {
    const issues = findPatchLeakage([file('index.html', 'send(target, payload) {\n=======\n  return payload;\n}')]);
    expect(issues).toHaveLength(1);
    expect(issues[0].file).toBe('index.html');
    expect(issues[0].reason).toContain('SEARCH/REPLACE');
  });

  it('flags <<<<<<< SEARCH and >>>>>>> REPLACE markers too', () => {
    const issues = findPatchLeakage([file('src/app.js', '<<<<<<< SEARCH\nold();\n=======\nnew();\n>>>>>>> REPLACE')]);
    expect(issues).toHaveLength(1);
  });

  it('ignores files with no markers', () => {
    expect(findPatchLeakage([file('src/app.js', 'const a = 1; console.log(a);')])).toEqual([]);
  });
});

describe('findIplLeakage (P7 — spec must not leak into the deliverable)', () => {
  it('flags any .ipl file in the generated artifact', () => {
    const issues = findIplLeakage([
      file('index.html', '<html></html>'),
      file('src/app.js', 'console.log(1);'),
      file('app.ipl', '// pseudo-code'),
      file('data.ipl', 'seed Drink Espresso { basePrice: 1.50 }')
    ]);
    expect(issues.map(i => i.file)).toEqual(['app.ipl', 'data.ipl']);
    expect(issues[0].reason).toContain('IPL spec file emitted');
  });

  it('returns nothing when only target-language files are delivered', () => {
    expect(findIplLeakage([file('index.html', '<html></html>'), file('src/app.js', 'console.log(1);')])).toEqual([]);
  });
});

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

describe('findFormMismatches (P4 form-factor gate)', () => {
  it('flags an HTML asset for a CLI target', () => {
    const issues = findFormMismatches(
      [file('index.html', '<html><body>hi</body></html>'), file('src/app.js', 'console.log(1);')],
      'cli'
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].file).toBe('index.html');
    expect(issues[0].reason).toContain('web asset');
  });

  it('flags DOM usage in a CLI target when no web asset exists', () => {
    const issues = findFormMismatches(
      [file('src/app.js', 'document.getElementById("app").textContent = "hi";')],
      'cli'
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].reason).toContain('DOM/browser usage');
  });

  it('accepts a clean headless console script', () => {
    const issues = findFormMismatches(
      [file('index.js', 'const total = 100 * 1.2; console.log(total);')],
      'cli'
    );
    expect(issues).toEqual([]);
  });

  it('flags a missing HTML entry for a web target', () => {
    const issues = findFormMismatches([file('src/app.js', 'console.log(1);')], 'web');
    expect(issues).toHaveLength(1);
    expect(issues[0].reason).toContain('no HTML entry');
  });

  it('accepts a web tree with an HTML entry', () => {
    const issues = findFormMismatches([file('index.html', '<html>app</html>'), file('src/app.js', 'console.log(1);')], 'web');
    expect(issues).toEqual([]);
  });

  it('performs no check when formFactor is undefined or library', () => {
    expect(findFormMismatches([file('index.html', '<html>app</html>')], undefined)).toEqual([]);
    expect(findFormMismatches([file('index.html', '<html>app</html>')], 'library')).toEqual([]);
  });

  it('flags a web asset and DOM usage for a GUI target', () => {
    const web = findFormMismatches([file('index.html', '<html></html>'), file('src/app.js', 'SDL_Init();')], 'gui');
    expect(web[0].file).toBe('index.html');
    expect(web[0].reason).toContain('GUI target');

    const dom = findFormMismatches([file('src/app.js', 'document.getElementById("a").textContent = "x";')], 'gui');
    expect(dom).toHaveLength(1);
    expect(dom[0].reason).toContain('DOM/browser usage');
  });

  it('flags a GUI target that never opens a window (model fell back to CLI/script)', () => {
    const issues = findFormMismatches([file('main.cpp', 'int main() { std::cout << "hi"; return 0; }')], 'gui');
    expect(issues).toHaveLength(1);
    expect(issues[0].reason).toContain('no native GUI toolkit detected');
  });

  it('accepts a GUI tree that uses a native toolkit', () => {
    const cpp = findFormMismatches([file('main.cpp', 'SDL_Init(SDL_INIT_VIDEO); SDL_CreateWindow("Snake", 640, 480);')], 'gui');
    expect(cpp).toEqual([]);
    const py = findFormMismatches([file('main.py', 'import pygame; pygame.init();')], 'gui');
    expect(py).toEqual([]);
  });

  it('flags a web asset and DOM usage for a server target', () => {
    const web = findFormMismatches([file('index.html', '<html></html>'), file('src/main.py', 'uvicorn.run(app);')], 'server');
    expect(web[0].file).toBe('index.html');
    expect(web[0].reason).toContain('server target');

    const dom = findFormMismatches([file('src/main.js', 'document.body.innerHTML = "x"; express();')], 'server');
    expect(dom).toHaveLength(1);
    expect(dom[0].reason).toContain('DOM/browser usage');
  });

  it('flags a server target that never starts a server (model fell back to CLI)', () => {
    const issues = findFormMismatches([file('main.py', 'print("hi")')], 'server');
    expect(issues).toHaveLength(1);
    expect(issues[0].reason).toContain('no server framework detected');
  });

  it('accepts a server tree that listens on a port', () => {
    const py = findFormMismatches([file('main.py', 'from fastapi import FastAPI\napp = FastAPI()\nuvicorn.run(app);')], 'server');
    expect(py).toEqual([]);
    const js = findFormMismatches([file('index.js', 'const express = require("express"); const app = express(); app.listen(3000);')], 'server');
    expect(js).toEqual([]);
  });
});
