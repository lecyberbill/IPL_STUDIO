import { describe, it, expect } from 'vitest';
import { extractClarificationRequest } from './llmGenerator';

describe('extractClarificationRequest', () => {
  it('extracts a NEED_CLARIFICATION question', () => {
    const output = 'NEED_CLARIFICATION: Which entry point should the Node app use: index.js or src/main.js?';
    expect(extractClarificationRequest(output)).toBe('Which entry point should the Node app use: index.js or src/main.js?');
  });

  it('returns null for a normal fix response with <file> tags', () => {
    const output = '<file path="index.js">\nconsole.log("ok");\n</file>';
    expect(extractClarificationRequest(output)).toBeNull();
  });

  it('returns null for a conversational reply without the contract', () => {
    expect(extractClarificationRequest('Here is what I think the issue is...')).toBeNull();
  });

  it('is case-insensitive and trims surrounding whitespace', () => {
    expect(extractClarificationRequest('  need_clarification:   do you want a browser or a CLI app?  ')).toBe(
      'do you want a browser or a CLI app?'
    );
  });

  it('does not trigger on the word appearing inside a code comment', () => {
    const output = '<file path="a.py">\n# need_clarification: not a real request\nprint(1)\n</file>';
    expect(extractClarificationRequest(output)).toBeNull();
  });
});
