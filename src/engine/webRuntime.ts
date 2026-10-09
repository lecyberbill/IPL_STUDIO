/**
 * Dependency-free real-browser runtime check for web targets.
 *
 * Uses a system Chromium-based browser (Chrome / Edge / Chromium) in headless
 * mode to actually LOAD the page and capture RUNTIME errors — the class a
 * serve+HTTP-GET and a `node --check` both miss (e.g. `process is not defined`,
 * uncaught TypeError, runtime SyntaxError).
 *
 * Pure Node built-ins only (no project imports) so it is usable both from the
 * Vite-bundled dev server and from the plain-`node` benchmark runner.
 */

import fs from 'fs';
import { spawnSync } from 'child_process';

/** Finds a system Chromium-based browser. Env override: `IPL_BROWSER_PATH`. */
export function findBrowserPath(): string | null {
  const env = process.env.IPL_BROWSER_PATH;
  if (env && fs.existsSync(env)) return env;
  const pf = process.env['ProgramFiles'] || 'C:/Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)';
  const candidates = process.platform === 'win32'
    ? [
        `${pf}/Google/Chrome/Application/chrome.exe`,
        `${pf86}/Google/Chrome/Application/chrome.exe`,
        `${pf86}/Microsoft/Edge/Application/msedge.exe`,
        `${pf}/Microsoft/Edge/Application/msedge.exe`
      ]
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
      : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'];
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch { /* ignore */ }
  }
  for (const name of ['chrome', 'google-chrome', 'chromium', 'msedge']) {
    const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [name], { encoding: 'utf8', windowsHide: true });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim().split(/\r?\n/)[0];
  }
  return null;
}

export interface BrowserCheckResult {
  ok: boolean;
  error?: string;
  stdout?: string;
}

/**
 * Loads `url` (a `file://` URL of the entry HTML) in headless mode and returns
 * ok=false when the page logs an uncaught runtime error or renders no DOM.
 * `--virtual-time-budget` bounds the wait; `--dump-dom` prints the rendered DOM.
 */
export function runHeadlessBrowserCheck(browser: string, url: string, timeoutMs = 20000): BrowserCheckResult {
  if (!browser || !url) return { ok: false, error: 'a browser path and a url are required' };
  const args = [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    '--enable-logging=stderr', '--v=1', '--virtual-time-budget=3000', '--dump-dom', url
  ];
  const res = spawnSync(browser, args, { encoding: 'utf8', timeout: timeoutMs, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  if (res.error) {
    const code = (res.error as NodeJS.ErrnoException).code;
    const reason = code === 'ETIMEDOUT'
      ? `timed out after ${timeoutMs}ms`
      : code === 'ENOENT'
        ? 'the browser executable was not found'
        : res.error.message;
    return { ok: false, error: `could not launch the browser (${reason})` };
  }
  const log = `${res.stdout || ''}\n${res.stderr || ''}`;
  const err = log.match(/Uncaught [^\n\r]*|(?:ReferenceError|TypeError|SyntaxError)[^\n\r]*|is not defined[^\n\r]*/i);
  if (err) return { ok: false, error: `browser runtime error: ${err[0].replace(/\s+/g, ' ').trim().slice(0, 200)}` };
  if (!res.stdout || res.stdout.trim().length < 20) return { ok: false, error: 'browser produced no rendered DOM' };
  return { ok: true, stdout: res.stdout };
}
