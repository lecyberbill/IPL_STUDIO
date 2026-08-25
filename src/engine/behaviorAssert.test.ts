import { describe, it, expect } from 'vitest';
import { evaluateBehavior, extractJson, getJsonPath } from './behaviorAssert';

describe('behaviorAssert — getJsonPath', () => {
  const doc = { items: [{ name: 'Keyboard', price: 49.9 }, { name: 'Mouse', price: 19.5 }], currency: 'EUR' };

  it('resolves nested array paths', () => {
    expect(getJsonPath(doc, 'items.0.name')).toBe('Keyboard');
    expect(getJsonPath(doc, 'items.1.price')).toBe(19.5);
    expect(getJsonPath(doc, 'currency')).toBe('EUR');
  });

  it('resolves length on arrays and strings', () => {
    expect(getJsonPath(doc, 'items.length')).toBe(2);
    expect(getJsonPath(doc, 'currency.length')).toBe(3);
  });

  it('returns undefined for missing keys', () => {
    expect(getJsonPath(doc, 'items.0.missing')).toBeUndefined();
    expect(getJsonPath(doc, 'nope')).toBeUndefined();
    expect(getJsonPath(doc, 'items.5.name')).toBeUndefined();
  });
});

describe('behaviorAssert — extractJson', () => {
  it('parses a whole JSON document', () => {
    expect(extractJson('{"a": 1}')).toEqual({ a: 1 });
  });

  it('parses the largest {...} block when logs surround the payload', () => {
    const out = 'Invoice ready:\n{"total": 42, "currency": "EUR"}\nDone.';
    expect(extractJson(out)).toEqual({ total: 42, currency: 'EUR' });
  });

  it('ignores embedded JSON in log lines and takes the real payload', () => {
    const out = [
      'Order details: {"drinkName":"Latte","basePrice":3.5}',
      'Receipt: {"price":4.2,"finalPrice":3.78}',
      '=== JSON Output ===',
      '{"orders":[{"drinkName":"Latte","finalPrice":3.78}],"grandTotal":3.78}',
      '=== Application Ready ==='
    ].join('\n');
    expect(extractJson(out)).toEqual({
      orders: [{ drinkName: 'Latte', finalPrice: 3.78 }],
      grandTotal: 3.78
    });
  });

  it('returns null for non-JSON output', () => {
    expect(extractJson('Order A-1001 for Alice: processing')).toBeNull();
    expect(extractJson('')).toBeNull();
  });
});

describe('behaviorAssert — evaluateBehavior', () => {
  it('rejects a wrong exit code', () => {
    const r = evaluateBehavior('ok', '', 1, { exitCode: 0 });
    expect(r.pass).toBe(false);
    expect(r.failures.join('')).toContain('exit code 1');
  });

  it('passes on exit code + stdoutContains + stdoutRegex', () => {
    const r = evaluateBehavior('Order A-1001 for Alice: processing\nTotal: 12.34', '', 0, {
      exitCode: 0,
      stdoutContains: ['Alice', 'processing'],
      stdoutRegex: 'Total: \\d+\\.\\d+'
    });
    expect(r.failures).toEqual([]);
  });

  it('reports a missing needle and a non-matching regex', () => {
    const r = evaluateBehavior('hello', '', 0, {
      stdoutContains: ['world'],
      stdoutRegex: '^start'
    });
    expect(r.pass).toBe(false);
    expect(r.failures).toHaveLength(2);
  });

  it('surfaces an invalid regex instead of crashing', () => {
    const r = evaluateBehavior('x', '', 0, { stdoutRegex: '([' });
    expect(r.failures.join('')).toContain('invalid stdoutRegex');
  });

  it('fails when JSON assertions are requested on non-JSON output', () => {
    const r = evaluateBehavior('Order A-1001 for Alice: processing', '', 0, {
      jsonInOutput: [{ path: 'total', gt: 0 }]
    });
    expect(r.failures.join('')).toContain('not valid JSON');
  });

  it('passes JSON-path assertions (equals, gt, arrayLength, matches)', () => {
    const stdout = [
      'invoice 1/2',
      '{"currency": "EUR", "subtotal": 69.4, "tax": 13.88, "total": 83.28, "items": [{"name": "Keyboard"}, {"name": "Mouse"}]}',
      'done'
    ].join('\n');
    const r = evaluateBehavior(stdout, '', 0, {
      jsonInOutput: [
        { path: 'items.length', equals: 2 },
        { path: 'currency', equals: 'EUR' },
        { path: 'subtotal', gt: 0 },
        { path: 'total', lt: 200 },
        { path: 'items.0.name', matches: '^Key' },
        { path: 'items.1.name', equals: 'Mouse' }
      ]
    });
    expect(r.failures).toEqual([]);
  });

  it('reports per-path failures with the offending value', () => {
    const r = evaluateBehavior('{"total": 42}', '', 0, {
      jsonInOutput: [
        { path: 'total', equals: 0 },
        { path: 'items', arrayLength: 3 },
        { path: 'missing', equals: 'x' }
      ]
    });
    expect(r.pass).toBe(false);
    expect(r.failures.join('\n')).toContain('json path "total" expected 0, got 42');
    expect(r.failures.join('\n')).toContain('json path "items" not found');
    expect(r.failures.join('\n')).toContain('json path "missing" not found');
  });

  it('flags a JSON-path assertion with no comparator', () => {
    const r = evaluateBehavior('{"a": 1}', '', 0, { jsonInOutput: [{ path: 'a' }] });
    expect(r.failures.join('')).toContain('has no assertion comparator');
  });

  it('approx tolerates IEEE-754 float error on a number', () => {
    // 3.78 + 2.0 === 5.779999999999999 in JS — exact intent, FP representation.
    const r = evaluateBehavior('{"grandTotal": 5.779999999999999}', '', 0, {
      jsonInOutput: [{ path: 'grandTotal', approx: 5.78, tolerance: 1e-6 }]
    });
    expect(r.pass).toBe(true);
    expect(r.failures).toEqual([]);
  });

  it('approx fails outside the tolerance and on a non-number', () => {
    const off = evaluateBehavior('{"v": 5.8}', '', 0, {
      jsonInOutput: [{ path: 'v', approx: 5.78, tolerance: 1e-6 }]
    });
    expect(off.pass).toBe(false);
    expect(off.failures.join('')).toContain('expected approx 5.78');

    const notNum = evaluateBehavior('{"v": "abc"}', '', 0, {
      jsonInOutput: [{ path: 'v', approx: 5.78 }]
    });
    expect(notNum.failures.join('')).toContain('is not a number');
  });
});
