import { describe, it, expect } from 'vitest';
import { extractArtifactMentions, filterMentionCandidates } from './artifactMentions';

const PATHS = ['index.html', 'src/app.js', 'src/utils.js', 'style.css'];

describe('extractArtifactMentions', () => {
  it('resolves @path mentions that match known artifact files', () => {
    expect(extractArtifactMentions('fix the bug in @src/app.js please', PATHS)).toEqual(['src/app.js']);
  });

  it('deduplicates and ignores unknown mentions / emails', () => {
    expect(extractArtifactMentions('@src/app.js and @src/app.js and @nope.js mail@host.com', PATHS)).toEqual(['src/app.js']);
  });

  it('returns empty when no known file is mentioned', () => {
    expect(extractArtifactMentions('nothing here', PATHS)).toEqual([]);
  });
});

describe('filterMentionCandidates', () => {
  it('substring-matches (case-insensitive) and caps the list', () => {
    expect(filterMentionCandidates('app', PATHS)).toEqual(['src/app.js']);
    expect(filterMentionCandidates('.js', PATHS)).toEqual(['src/app.js', 'src/utils.js']);
    expect(filterMentionCandidates('', PATHS, 2)).toHaveLength(2);
  });
});
