import { describe, it, expect } from 'vitest';
import { parseChatCommand, filterCommands, allCommandMetas, expandCustomCommand, BUILTIN_COMMANDS } from './chatCommands';

describe('parseChatCommand', () => {
  it('parses a leading command and its args (any id — custom included)', () => {
    expect(parseChatCommand('/verify')).toEqual({ id: 'verify', args: '' });
    expect(parseChatCommand('/new My App')).toEqual({ id: 'new', args: 'My App' });
    expect(parseChatCommand('/my-macro hello')).toEqual({ id: 'my-macro', args: 'hello' });
  });

  it('is case-insensitive and trims', () => {
    expect(parseChatCommand('  /HELP  ')).toEqual({ id: 'help', args: '' });
  });

  it('returns null for prose or a non-leading slash', () => {
    expect(parseChatCommand('please /verify')).toBeNull();
    expect(parseChatCommand('a ratio 1/2')).toBeNull();
    expect(parseChatCommand('')).toBeNull();
  });
});

describe('command catalogue + candidates', () => {
  it('merges built-ins with custom prompt commands', () => {
    const metas = allCommandMetas([{ id: 'test', instruction: 'Write tests' }]);
    expect(metas.some(m => m.id === 'test' && m.kind === 'prompt')).toBe(true);
    expect(metas.some(m => m.id === 'verify' && m.kind === 'action')).toBe(true);
  });

  it('prefix-matches and caps', () => {
    expect(filterCommands('ve', BUILTIN_COMMANDS).map(c => c.id)).toEqual(['verify']);
    expect(filterCommands('', BUILTIN_COMMANDS).length).toBe(BUILTIN_COMMANDS.length);
    expect(filterCommands('', BUILTIN_COMMANDS, 2)).toHaveLength(2);
  });

  it('expandCustomCommand appends optional args', () => {
    expect(expandCustomCommand('Write tests', '')).toBe('Write tests');
    expect(expandCustomCommand('Write tests', 'for @a.js')).toContain('Additional input: for @a.js');
  });
});
