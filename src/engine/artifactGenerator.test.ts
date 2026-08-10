import { describe, it, expect } from 'vitest';
import { parseMultiFileXml } from './artifactGenerator';

describe('parseMultiFileXml', () => {
  it('extracts file content wrapped in a leading markdown code fence', () => {
    const raw = [
      '<file path="src/config.py">',
      '```python',
      'from enum import Enum',
      'class Currency(str, Enum):',
      '    EUR = "EUR"',
      '```',
      '</file>',
      '<file path="main.py">',
      'print("hello")',
      '</file>'
    ].join('\n');

    const files = parseMultiFileXml(raw);
    expect(files.map(f => f.relativePath)).toEqual(['src/config.py', 'main.py']);
    expect(files[0].content).toBe('from enum import Enum\nclass Currency(str, Enum):\n    EUR = "EUR"');
    expect(files[1].content).toBe('print("hello")');
  });

  it('keeps leading fence stripping idempotent when no fence is present', () => {
    const raw = '<file path="a.py">\ndef f():\n    pass\n</file>';
    const files = parseMultiFileXml(raw);
    expect(files[0].content).toBe('def f():\n    pass');
  });
});
