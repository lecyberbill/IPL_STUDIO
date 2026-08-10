import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createDevApiServer, type DevApiServerOptions } from './devApiServer';

const tempRoots: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
}

function createMockRes() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    chunks: [] as string[],
    finished: false,
    setHeader(k: string, v: string) { this.headers[k] = v; },
    write(chunk: any) { this.chunks.push(String(chunk)); },
    end(body?: any) {
      if (body !== undefined) this.chunks.push(String(body));
      this.finished = true;
    }
  };
  return res;
}

function mockReq(url: string, method: string, headers: Record<string, string> = {}, body?: unknown) {
  const listeners: Record<string, (chunk?: unknown) => void> = {};
  const req: any = {
    url,
    method,
    headers,
    on(ev: string, cb: (chunk?: unknown) => void) { listeners[ev] = cb; },
    _emitData(chunk: unknown) { listeners['data']?.(chunk); },
    _emitEnd() { listeners['end']?.(); }
  };
  if (body !== undefined) {
    req._queuedBody = JSON.stringify(body);
  }
  return { req, listeners, emit: () => { req._emitData(req._queuedBody); req._emitEnd(); } };
}

function parseJson(res: any) {
  return JSON.parse(res.chunks.join(''));
}

afterEach(() => {
  for (const dir of tempRoots) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

describe('createDevApiServer — security gate', () => {
  const baseOptions = (overrides: Partial<DevApiServerOptions> = {}): DevApiServerOptions => ({
    devToken: '',
    isProduction: false,
    allowedCommands: null,
    ...overrides
  });

  it('passes loopback requests through', () => {
    const server = createDevApiServer(baseOptions());
    const res = createMockRes();
    let nextCalled = false;
    server.securityGate(
      { url: '/api/run-command', method: 'POST', headers: { host: 'localhost:5173' } },
      res,
      () => { nextCalled = true; }
    );
    expect(nextCalled).toBe(true);
    expect(res.statusCode).toBe(200);
  });

  it('rejects non-loopback Host headers (DNS-rebinding)', () => {
    const server = createDevApiServer(baseOptions());
    const res = createMockRes();
    server.securityGate(
      { url: '/api/run-command', method: 'POST', headers: { host: 'evil.example.com' } },
      res,
      () => { throw new Error('next must not be called'); }
    );
    expect(res.statusCode).toBe(403);
    expect(parseJson(res).error).toContain('loopback');
  });

  it('rejects cross-origin requests when no token is configured', () => {
    const server = createDevApiServer(baseOptions());
    const res = createMockRes();
    server.securityGate(
      { url: '/api/run-command', method: 'POST', headers: { host: 'localhost', origin: 'https://evil.example.com' } },
      res,
      () => { throw new Error('next must not be called'); }
    );
    expect(res.statusCode).toBe(403);
    expect(parseJson(res).error).toContain('Cross-origin');
  });

  it('enforces X-IPL-Token when a token is configured', () => {
    const server = createDevApiServer(baseOptions({ devToken: 'secret' }));
    const res = createMockRes();
    server.securityGate(
      { url: '/api/run-command', method: 'POST', headers: { host: 'localhost' } },
      res,
      () => { throw new Error('next must not be called'); }
    );
    expect(res.statusCode).toBe(401);

    const res2 = createMockRes();
    server.securityGate(
      { url: '/api/run-command', method: 'POST', headers: { host: 'localhost', 'x-ipl-token': 'secret' } },
      res2,
      () => {}
    );
    expect(res2.statusCode).toBe(200);
  });

  it('disables dev endpoints in production without a token', () => {
    const server = createDevApiServer(baseOptions({ isProduction: true }));
    const res = createMockRes();
    server.securityGate(
      { url: '/api/run-command', method: 'POST', headers: { host: 'localhost' } },
      res,
      () => { throw new Error('next must not be called'); }
    );
    expect(res.statusCode).toBe(403);
    expect(parseJson(res).error).toContain('production');
  });

  it('allows production dev endpoints when a token is configured', () => {
    const server = createDevApiServer(baseOptions({ devToken: 'secret', isProduction: true }));
    const res = createMockRes();
    server.securityGate(
      { url: '/api/run-command', method: 'POST', headers: { host: 'localhost', 'x-ipl-token': 'secret' } },
      res,
      () => {}
    );
    expect(res.statusCode).toBe(200);
  });

  it('ignores non-/api/ requests', () => {
    const server = createDevApiServer(baseOptions());
    const res = createMockRes();
    let nextCalled = false;
    server.securityGate(
      { url: '/index.html', method: 'GET', headers: { host: 'evil.example.com' } },
      res,
      () => { nextCalled = true; }
    );
    expect(nextCalled).toBe(true);
  });
});

describe('createDevApiServer — write-artifact handler', () => {
  it('writes files inside the workspace without confirmation', () => {
    const workspace = makeTempDir('devapi-ws-');
    const server = createDevApiServer({ devToken: '', isProduction: false, allowedCommands: null, workspaceRoot: workspace });
    const res = createMockRes();
    const { req, emit } = mockReq('/api/write-artifact', 'POST', { host: 'localhost' }, {
      outputDir: 'out',
      files: [
        { relativePath: 'app.py', content: 'print(1)' },
        { relativePath: 'nested/util.py', content: 'x = 1' }
      ]
    });
    server.handler(req, res, () => { throw new Error('next must not be called'); });
    emit();
    expect(res.statusCode).toBe(200);
    const data = parseJson(res);
    expect(data.writtenFilesCount).toBe(2);
    expect(fs.readFileSync(path.join(workspace, 'out', 'app.py'), 'utf-8')).toBe('print(1)');
    expect(fs.readFileSync(path.join(workspace, 'out', 'nested', 'util.py'), 'utf-8')).toBe('x = 1');
  });

  it('requires explicit confirmation before writing to an external directory', () => {
    const workspace = makeTempDir('devapi-ws-');
    const external = makeTempDir('devapi-ext-');
    const server = createDevApiServer({ devToken: '', isProduction: false, allowedCommands: null, workspaceRoot: workspace });

    const res = createMockRes();
    const first = mockReq('/api/write-artifact', 'POST', { host: 'localhost' }, {
      outputDir: external,
      files: [{ relativePath: 'app.py', content: 'print(1)' }]
    });
    server.handler(first.req, res, () => { throw new Error('next must not be called'); });
    first.emit();
    expect(res.statusCode).toBe(403);
    expect(parseJson(res).code).toBe('PATH_CONFIRMATION_REQUIRED');

    const res2 = createMockRes();
    const confirm = mockReq('/api/confirm-path', 'POST', { host: 'localhost' }, { path: external });
    server.handler(confirm.req, res2, () => { throw new Error('next must not be called'); });
    confirm.emit();
    expect(res2.statusCode).toBe(200);

    const res3 = createMockRes();
    const second = mockReq('/api/write-artifact', 'POST', { host: 'localhost' }, {
      outputDir: external,
      files: [{ relativePath: 'app.py', content: 'print(1)' }]
    });
    server.handler(second.req, res3, () => { throw new Error('next must not be called'); });
    second.emit();
    expect(res3.statusCode).toBe(200);
    expect(fs.readFileSync(path.join(external, 'app.py'), 'utf-8')).toBe('print(1)');
  });

  it('rejects files that escape the target directory', () => {
    const workspace = makeTempDir('devapi-ws-');
    const server = createDevApiServer({ devToken: '', isProduction: false, allowedCommands: null, workspaceRoot: workspace });
    const res = createMockRes();
    const { req, emit } = mockReq('/api/write-artifact', 'POST', { host: 'localhost' }, {
      outputDir: 'out',
      files: [{ relativePath: '../escape.py', content: 'x' }]
    });
    server.handler(req, res, () => { throw new Error('next must not be called'); });
    emit();
    expect(res.statusCode).toBe(500);
    expect(parseJson(res).error).toContain('escapes');
  });
});
