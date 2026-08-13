import { describe, it, expect } from 'vitest';
import { classifySmokeFiles, smokeCheckArgs, SMOKE_TOOL } from './smokeCheck';

describe('classifySmokeFiles (runtime smoke classification)', () => {
  it('maps JS and Python files to their checks', () => {
    const files = [
      { relativePath: 'src/app.js', content: '' },
      { relativePath: 'main.py', content: '' },
      { relativePath: 'index.html', content: '' },
      { relativePath: 'README.md', content: '' }
    ];
    expect(classifySmokeFiles(files)).toEqual([
      { file: 'src/app.js', lang: 'js' },
      { file: 'main.py', lang: 'python' }
    ]);
  });

  it('handles mjs/cjs and case-insensitive extensions', () => {
    const files = [
      { relativePath: 'index.MJS', content: '' },
      { relativePath: 'lib.cjs', content: '' },
      { relativePath: 'scripts/util.PY', content: '' }
    ];
    const langs = classifySmokeFiles(files).map(c => c.lang);
    expect(langs).toEqual(['js', 'js', 'python']);
  });

  it('returns nothing when no file needs a check', () => {
    expect(classifySmokeFiles([{ relativePath: 'index.html', content: '' }])).toEqual([]);
  });

  it('classifies rust, go, cpp and c files too', () => {
    const files = [
      { relativePath: 'src/main.rs', content: '' },
      { relativePath: 'main.go', content: '' },
      { relativePath: 'main.cpp', content: '' },
      { relativePath: 'util.c', content: '' }
    ];
    expect(classifySmokeFiles(files)).toEqual([
      { file: 'src/main.rs', lang: 'rust' },
      { file: 'main.go', lang: 'go' },
      { file: 'main.cpp', lang: 'cpp' },
      { file: 'util.c', lang: 'c' }
    ]);
  });

  it('maps each language to a toolchain and builds syntax-check argv', () => {
    expect(SMOKE_TOOL.js).toBe('node');
    expect(SMOKE_TOOL.python).toBe('python');
    expect(SMOKE_TOOL.rust).toBe('rustc');
    expect(SMOKE_TOOL.go).toBe('go');
    expect(SMOKE_TOOL.cpp).toBe('gpp');
    expect(SMOKE_TOOL.c).toBe('gcc');
    expect(smokeCheckArgs('js', 'a.js')).toEqual(['--check', 'a.js']);
    expect(smokeCheckArgs('go', 'a.go')).toEqual(['fmt', '-e', 'a.go']);
    expect(smokeCheckArgs('cpp', 'a.cpp')).toEqual(['-fsyntax-only', 'a.cpp']);
  });
});
