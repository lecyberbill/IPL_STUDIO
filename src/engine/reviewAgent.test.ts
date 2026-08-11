import { describe, it, expect } from 'vitest';
import { buildReviewPrompt, parseReviewOutput } from './reviewAgent';
import type { ProjectArtifactFile } from './artifactGenerator';

const file = (relativePath: string, content: string): ProjectArtifactFile => ({ relativePath, content });

describe('buildReviewPrompt', () => {
  it('lists every file with its content', () => {
    const prompt = buildReviewPrompt([
      file('src/index.js', `const x = require('./missing');`),
      file('src/util.js', `module.exports = {};`)
    ]);
    expect(prompt).toContain('FILE src/index.js');
    expect(prompt).toContain('FILE src/util.js');
    expect(prompt).toContain("require('./missing')");
  });

  it('contains no IPL vocabulary', () => {
    const prompt = buildReviewPrompt([file('main.py', `print("hi")`)]);
    const lower = prompt.toLowerCase();
    expect(lower).not.toContain('ipl');
    expect(lower).not.toContain('listen event');
    expect(lower).not.toContain('compute ');
    expect(lower).not.toContain('grammar');
  });
});

describe('parseReviewOutput', () => {
  it('parses a clean issues array', () => {
    const raw = JSON.stringify({
      issues: [
        { severity: 'error', file: 'src/index.js', message: 'require("./entities") but entities.js is missing', suggestion: 'create src/entities.js' }
      ]
    });
    const issues = parseReviewOutput(raw);
    expect(issues).toEqual([
      { severity: 'error', file: 'src/index.js', message: 'require("./entities") but entities.js is missing', suggestion: 'create src/entities.js' }
    ]);
  });

  it('tolerates prose and code fences around the JSON', () => {
    const raw = `Here is my review:\n\n\`\`\`json\n${JSON.stringify({ issues: [{ severity: 'warning', file: 'a.js', message: 'dead code' }] })}\n\`\`\`\n\nHope that helps.`;
    expect(parseReviewOutput(raw)).toHaveLength(1);
  });

  it('returns [] when no JSON is present', () => {
    expect(parseReviewOutput('no issues found, the code is fine')).toEqual([]);
  });

  it('defaults missing severity to warning and drops malformed entries', () => {
    const raw = JSON.stringify({
      issues: [
        { file: 'a.js', message: 'no severity' },
        { file: 'b.js' },
        'not an object'
      ]
    });
    const issues = parseReviewOutput(raw);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].file).toBe('a.js');
  });

  it('returns [] for malformed JSON', () => {
    expect(parseReviewOutput('{ "issues": [ broken')).toEqual([]);
  });
});
