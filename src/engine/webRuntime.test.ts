import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findBrowserPath, runHeadlessBrowserCheck } from './webRuntime';

const tempFiles: string[] = [];

function tempFile(content = 'x'): string {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ipl-webrt-')), 'browser-stub');
  fs.writeFileSync(p, content);
  tempFiles.push(p);
  return p;
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const f of tempFiles.splice(0)) {
    try { fs.rmSync(path.dirname(f), { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

describe('runHeadlessBrowserCheck — defensive launch handling', () => {
  it('rejects a missing browser path / url up front', () => {
    expect(runHeadlessBrowserCheck('', 'file:///x')).toEqual({ ok: false, error: 'a browser path and a url are required' });
    expect(runHeadlessBrowserCheck('node', '')).toEqual({ ok: false, error: 'a browser path and a url are required' });
  });

  it('surfaces a launch failure (not "no DOM") when the executable is absent', () => {
    const bogus = path.join(os.tmpdir(), 'definitely-not-a-browser-xyz-123');
    const res = runHeadlessBrowserCheck(bogus, 'file:///whatever.html');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/could not launch the browser/);
  });
});

describe('findBrowserPath — env override', () => {
  it('honours IPL_BROWSER_PATH when it points to an existing file', () => {
    const stub = tempFile();
    vi.stubEnv('IPL_BROWSER_PATH', stub);
    expect(findBrowserPath()).toBe(stub);
  });

  it('ignores a non-existent IPL_BROWSER_PATH (no throw, never returns it)', () => {
    const bogus = path.join(os.tmpdir(), 'nope-browser-xyz-123');
    vi.stubEnv('IPL_BROWSER_PATH', bogus);
    const found = findBrowserPath();
    expect(found).not.toBe(bogus);
    expect(found === null || typeof found === 'string').toBe(true);
  });
});
