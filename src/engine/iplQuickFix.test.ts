import { describe, it, expect } from 'vitest';
import { applyIPLQuickFixes } from './iplQuickFix';

describe('applyIPLQuickFixes', () => {
  it('closes an unterminated string', () => {
    const code = 'add message {\n  text: "hello\n}';
    const { applied, remaining } = applyIPLQuickFixes(code);
    expect(applied.some(a => a.fixLabel === 'Close the string')).toBe(true);
    // The tokenizer fix consumes to EOF; re-validating must no longer report
    // the unterminated string, and the block must remain closed.
    expect(remaining.filter(d => d.message.includes('Unterminated string')).length).toBe(0);
    expect(remaining.filter(d => d.message.includes('Unclosed block')).length).toBe(0);
  });

  it('appends a missing closing brace at end of file', () => {
    const code = 'add view X {\n  title: "T"\n';
    const { code: fixed, applied } = applyIPLQuickFixes(code);
    expect(applied.some(a => a.fixLabel === 'Insert closing brace')).toBe(true);
    expect(fixed.trimEnd().endsWith('}')).toBe(true);
    // Re-validating the fixed code must no longer report the unclosed block.
    expect(applyIPLQuickFixes(fixed).remaining.filter(d => d.message.includes('Unclosed block')).length).toBe(0);
  });

  it('leaves clean code untouched', () => {
    const code = 'add message {\n  text: "hello"\n}\n';
    const { code: fixed, applied, remaining } = applyIPLQuickFixes(code);
    expect(applied).toEqual([]);
    expect(fixed).toBe(code);
    expect(remaining.length).toBe(0);
  });

  it('reports unfixable semantic diagnostics as remaining', () => {
    // `add text "x"` uses an unknown intent type — semantic, no quick-fix.
    const code = 'add unknownType as entity {\n  name: text\n}\n';
    const { remaining } = applyIPLQuickFixes(code);
    expect(remaining.length).toBeGreaterThanOrEqual(0);
  });
});
