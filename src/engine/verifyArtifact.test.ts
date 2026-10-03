import { describe, it, expect } from 'vitest';
import { verifyArtifact, toArtifactFiles } from './verifyArtifact';

const SPEC = `add entity Product { sku: text, price: number }
listen event on "x" {
  send receipt to screen { format: "json", sku: p.sku, price: p.price }
}`;

describe('verifyArtifact (Pure IDE core: artifact + contract -> receipts)', () => {
  it('passes a clean artifact that preserves the contract', () => {
    const files = [{ relativePath: 'main.js', content: 'const sku = "SKU-1"; const price = 2; console.log({ sku, price });' }];
    const r = verifyArtifact(files, SPEC);
    expect(r.verdict).toBe('pass');
    expect(r.gates).toEqual([]);
    expect(r.semantic?.identity.preserved).toBeGreaterThan(0);
  });

  it('derives the structural oracle from the spec (send format:json keys)', () => {
    const r = verifyArtifact([{ relativePath: 'a.js', content: '' }], SPEC);
    expect(r.derivedOracle).toEqual({ stdoutContains: ['"sku"', '"price"'] });
  });

  it('fails on a missing module import (deterministic gate)', () => {
    const r = verifyArtifact([{ relativePath: 'index.js', content: "const x = require('./missing');" }], SPEC);
    expect(r.verdict).toBe('fail');
    expect(r.gates.some(g => g.gate === 'imports' && g.severity === 'error')).toBe(true);
  });

  it('fails on invalid JSON and on IPL-spec leakage', () => {
    const badJson = verifyArtifact([{ relativePath: 'package.json', content: '{ // comment\n "name": "x" }' }], SPEC);
    expect(badJson.verdict).toBe('fail');
    expect(badJson.gates.some(g => g.gate === 'json')).toBe(true);

    const leaked = verifyArtifact([{ relativePath: 'app.ipl', content: 'add entity X { y: text }' }], SPEC);
    expect(leaked.verdict).toBe('fail');
    expect(leaked.gates.some(g => g.gate === 'ipl-leak')).toBe(true);
  });

  it('fails when the contract is entirely lost in the source', () => {
    const r = verifyArtifact([{ relativePath: 'main.js', content: 'console.log(1);' }], SPEC);
    expect(r.verdict).toBe('fail');
    expect(r.semantic?.identity.preserved).toBe(0);
  });

  it('reports oracle/spec parity when an explicit oracle is supplied', () => {
    const spec = `add entity G { currency: options("EUR", "USD") }
listen event on "x" { send r to screen { format: "json", currency: g.currency } }`;
    const files = [{ relativePath: 'a.js', content: 'const currency = "EUR";' }];
    const ok = verifyArtifact(files, spec, { oracle: { jsonInOutput: [{ path: 'currency', equals: 'EUR' }] } });
    expect(ok.parity?.ok).toBe(true);

    const drift = verifyArtifact(files, spec, { oracle: { jsonInOutput: [{ path: 'currency', equals: 'GBP' }] } });
    expect(drift.parity?.ok).toBe(false);
  });

  it('toArtifactFiles parses raw XML artifacts', () => {
    const xml = '<file path="a.js">\nconsole.log(1);\n</file>';
    const files = toArtifactFiles(xml);
    expect(files).toEqual([{ relativePath: 'a.js', content: 'console.log(1);' }]);
  });
});
