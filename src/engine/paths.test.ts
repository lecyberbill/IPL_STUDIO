import { describe, it, expect } from 'vitest';
import { toSafeName, defaultOutputDir, DEFAULT_OUTPUT_BASE } from './paths';

describe('toSafeName — portable folder-name sanitiser', () => {
  it('lowercases and replaces anything outside [a-z0-9]', () => {
    expect(toSafeName('My Project!')).toBe('my_project');
    expect(toSafeName('Weather-App v2')).toBe('weather_app_v2');
  });

  it('never returns an empty segment', () => {
    expect(toSafeName('')).toBe('my_project');
    expect(toSafeName('!!!')).toBe('my_project');
    expect(toSafeName('   ')).toBe('my_project');
  });

  it('removes path separators and traversal — only [a-z0-9_] survives', () => {
    expect(toSafeName('../../etc/passwd')).toBe('etc_passwd');
    expect(toSafeName('a/b\\c')).toBe('a_b_c');
    expect(toSafeName('..')).toBe('my_project');
    expect(toSafeName('C:\\Windows')).toBe('c_windows');
  });

  it('guards Windows reserved device names', () => {
    expect(toSafeName('CON')).toBe('_con');
    expect(toSafeName('nul')).toBe('_nul');
    expect(toSafeName('com1')).toBe('_com1');
    expect(toSafeName('LPT9')).toBe('_lpt9');
    expect(toSafeName('console')).toBe('console');
  });

  it('collapses underscores and bounds the length', () => {
    expect(toSafeName('a---b___c')).toBe('a_b_c');
    expect(toSafeName('x'.repeat(200))).toHaveLength(64);
  });
});

describe('defaultOutputDir', () => {
  it('joins the base with the sanitised name', () => {
    expect(defaultOutputDir('My App')).toBe(`${DEFAULT_OUTPUT_BASE}/my_app`);
    expect(DEFAULT_OUTPUT_BASE).toBe('output');
  });
});
