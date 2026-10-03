import { describe, it, expect } from 'vitest';
import { exportContractPrompt } from './exportContract';

const SPEC = `add entity Product { sku: id, name: text, price: number }
seed Product p1 { sku: "SKU-42", price: 9.99 }
listen event on "x" {
  compute finalPrice from p { formula: price * 2 }
  send receipt to screen { format: "json", sku: p.sku, finalPrice: finalPrice }
}`;

describe('exportContractPrompt (IPL as an input for any model)', () => {
  it('renders the contract as portable requirements (entities, fixtures, formulas, keys)', () => {
    const p = exportContractPrompt(SPEC);
    expect(p).toContain('INTENT CONTRACT');
    expect(p).toContain('Product has fields: sku (id), name (text), price (number)');
    expect(p).toContain('finalPrice = price * 2');
    expect(p).toContain('JSON document with the keys: sku, finalPrice');
    expect(p).toContain('Preserve every identifier');
  });

  it('is stable/deterministic for the same spec', () => {
    expect(exportContractPrompt(SPEC)).toBe(exportContractPrompt(SPEC));
  });

  it('degrades gracefully for a spec without JSON output', () => {
    expect(exportContractPrompt('// nothing here')).toContain('keys: (none)');
  });
});
