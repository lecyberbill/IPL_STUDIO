import { describe, it, expect } from 'vitest';
import { resolveTool, resolveToolchainCommand, installCommandFor } from './toolchains';
import type { Toolchains } from './toolchains';

describe('toolchains resolution', () => {
  it('resolveTool returns the configured path when set, else the default name', () => {
    expect(resolveTool('python')).toBe('python');
    expect(resolveTool('python', { python: 'C:/venv/Scripts/python.exe' })).toBe('C:/venv/Scripts/python.exe');
    expect(resolveTool('python', { python: '  ' })).toBe('python');
    expect(resolveTool('rustc', { rustc: 'C:/rust/bin/rustc.exe' })).toBe('C:/rust/bin/rustc.exe');
  });

  it('resolveToolchainCommand rewrites the executable to the configured path', () => {
    const toolchains: Toolchains = { python: 'C:/venv/Scripts/python.exe' };
    expect(resolveToolchainCommand('python main.py', toolchains)).toBe('C:/venv/Scripts/python.exe main.py');
    expect(resolveToolchainCommand('node index.js', toolchains)).toBe('node index.js');
    expect(resolveToolchainCommand('python main.py')).toBe('python main.py');
    expect(resolveToolchainCommand('python main.py', { python: 'python' })).toBe('python main.py');
  });

  it('installCommandFor is OS-aware', () => {
    expect(installCommandFor('node', 'win32')).toContain('winget');
    expect(installCommandFor('python', 'darwin')).toContain('brew');
    expect(installCommandFor('gpp', 'linux')).toContain('build-essential');
    expect(installCommandFor('rustc', 'win32')).toContain('Rustup');
  });
});
