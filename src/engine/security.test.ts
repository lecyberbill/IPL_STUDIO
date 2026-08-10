import { describe, it, expect } from 'vitest';
import { parseAllowedCommands, commandPrefix, isCommandAllowed, DEFAULT_ALLOWED_COMMANDS } from './security';

describe('parseAllowedCommands', () => {
  it('returns null for unset/empty values', () => {
    expect(parseAllowedCommands(undefined)).toBeNull();
    expect(parseAllowedCommands('')).toBeNull();
    expect(parseAllowedCommands('   ')).toBeNull();
  });

  it('parses a comma-separated list case-insensitively', () => {
    expect(parseAllowedCommands('python, Node, GIT')).toEqual(['python', 'node', 'git']);
  });

  it('skips empty segments and trims whitespace', () => {
    expect(parseAllowedCommands('python,, node , ')).toEqual(['python', 'node']);
  });
});

describe('commandPrefix', () => {
  it('extracts the executable for simple commands', () => {
    expect(commandPrefix('python main.py')).toBe('python');
    expect(commandPrefix('node index.js')).toBe('node');
    expect(commandPrefix('npm run build')).toBe('npm');
    expect(commandPrefix('g++ -std=c++20 main.cpp -o main && ./main')).toBe('g++');
  });

  it('normalizes ./ and ../ prefixes', () => {
    expect(commandPrefix('./myapp --port 8080')).toBe('myapp');
    expect(commandPrefix('../bin/tool')).toBe('tool');
  });

  it('handles Windows drive-letter paths', () => {
    expect(commandPrefix('C:\\dev\\python.exe -x')).toBe('python.exe');
    expect(commandPrefix('D:/tools/node.exe script.js')).toBe('node.exe');
  });

  it('returns empty string for blank or comment-only input', () => {
    expect(commandPrefix('')).toBe('');
    expect(commandPrefix('   ')).toBe('');
  });
});

describe('isCommandAllowed', () => {
  it('allows recognized dev commands from the default list', () => {
    expect(isCommandAllowed('python main.py')).toBe(true);
    expect(isCommandAllowed('node index.js')).toBe(true);
    expect(isCommandAllowed('cargo run')).toBe(true);
    expect(isCommandAllowed('git status')).toBe(true);
  });

  it('rejects destructive or unexpected executables', () => {
    expect(isCommandAllowed('rm -rf /')).toBe(false);
    expect(isCommandAllowed('del /s C:\\Windows')).toBe(false);
    expect(isCommandAllowed('format C:')).toBe(false);
    expect(isCommandAllowed('shutdown /s')).toBe(false);
    expect(isCommandAllowed('powershell -Command Remove-Item -Recurse C:\\')).toBe(false);
  });

  it('honors a custom allow-list', () => {
    expect(isCommandAllowed('node index.js', ['node'])).toBe(true);
    expect(isCommandAllowed('python main.py', ['node'])).toBe(false);
    expect(isCommandAllowed('python main.py', [])).toBe(false);
  });

  it('rejects empty input even when allowed is empty', () => {
    expect(isCommandAllowed('', DEFAULT_ALLOWED_COMMANDS)).toBe(false);
  });
});
