import { describe, it, expect } from 'vitest';
import { classifySmokeFiles } from './smokeCheck';

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
});
