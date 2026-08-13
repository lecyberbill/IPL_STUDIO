import path from 'path';
import fs from 'fs';
import http from 'http';
import os from 'os';
import { spawn, exec, execFile } from 'child_process';
import { promisify } from 'util';
import { isCommandAllowed, commandPrefix } from '../engine/security.js';
import { classifySmokeFiles } from '../engine/smokeCheck.js';
import type { SmokeFileResult, SmokeResult } from '../engine/smokeCheck.js';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

/**
 * Loopback hostnames that are allowed to call the dev APIs.
 */
const ALLOWED_LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]', '0:0:0:0:0:0:0:1'];

export interface DevApiServerOptions {
  /** Optional token enabling X-IPL-Token auth on every dev endpoint. */
  devToken: string;
  /** When true, dev endpoints are disabled unless a token is configured. */
  isProduction: boolean;
  /** Optional server-side command allow-list (null = client default policy only). */
  allowedCommands: string[] | null;
  /** Sandbox root for relative paths. Defaults to process.cwd(). */
  workspaceRoot?: string;
  /** Optional logger used for the startup security notice. */
  logger?: { warn: (message: string) => void };
}

export interface DevApiServer {
  securityGate: (req: any, res: any, next: any) => void;
  handler: (req: any, res: any, next: any) => void;
  startupWarning: string;
}

/**
 * Verifies a resolved path stays inside a given root directory.
 */
function isWithinDirectory(rootDir: string, candidatePath: string): boolean {
  const relative = path.relative(rootDir, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function getHostname(hostHeader: string): string {
  const host = hostHeader.trim().toLowerCase();
  if (host.startsWith('[')) {
    const end = host.indexOf(']');
    return end >= 0 ? host.slice(0, end + 1) : host;
  }
  return host.split(':')[0];
}

// ---------------------------------------------------------------------------
// Static file serving (test the generated web app straight from the IDE)
// ---------------------------------------------------------------------------

const STATIC_MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.webmanifest': 'application/manifest+json'
};

interface ActiveStaticServer {
  port: number;
  server: http.Server;
  outputDir: string;
}

/** One loopback static server per output directory (reused until stopped). */
const activeStaticServers = new Map<string, ActiveStaticServer>();

// ---------------------------------------------------------------------------
// Runtime smoke test (deterministic syntax checks — `node --check`, py_compile)
// ---------------------------------------------------------------------------

/** Runs `node --check <file>`; resolves with the error text (or undefined when clean). */
function checkNodeSyntax(file: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile('node', ['--check', file], { timeout: 15000 }, (err, _stdout, stderr) => {
      resolve(err ? (stderr || err.message || 'syntax error').slice(0, 400) : undefined);
    });
  });
}

/** Runs `python -m py_compile <file>` (falls back to `py` when `python` is absent). */
function checkPythonSyntax(file: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const run = (pythonCmd: string) => {
      execFile(pythonCmd, ['-m', 'py_compile', file], { timeout: 15000 }, (err, _stdout, stderr) => {
        if (err && (err as NodeJS.ErrnoException).code === 'ENOENT' && pythonCmd === 'python') {
          run('py');
          return;
        }
        resolve(err ? (stderr || err.message || 'syntax error').slice(0, 400) : undefined);
      });
    };
    run('python');
  });
}

/**
 * Writes the generated files to a temp sandbox and runs the deterministic
 * syntax checks (JS + Python). Returns per-file results. Portable: the checked
 * runtimes are the same ones the generated apps target.
 */
export async function runSyntaxSmoke(files: Array<{ relativePath: string; content: string }>): Promise<SmokeResult> {
  const checks = classifySmokeFiles(files);
  if (checks.length === 0) return { passed: true, files: [] };

  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'ipl-smoke-'));
  try {
    for (const f of files) {
      const target = path.resolve(sandbox, f.relativePath);
      if (!isWithinDirectory(sandbox, target)) continue;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, f.content, 'utf8');
    }
    const results: SmokeFileResult[] = [];
    for (const c of checks) {
      const target = path.resolve(sandbox, c.file);
      if (c.lang === 'js') {
        const err = await checkNodeSyntax(target);
        results.push({ file: c.file, ok: !err, error: err });
      } else {
        const err = await checkPythonSyntax(target);
        results.push({ file: c.file, ok: !err, error: err });
      }
    }
    return { passed: results.every(r => r.ok), files: results };
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
}

/** Stops the loopback static server serving `outputDir`, if any. */
export function stopStaticServer(outputDir: string): boolean {
  const key = path.resolve(outputDir);
  const entry = activeStaticServers.get(key);
  if (entry) {
    entry.server.close();
    activeStaticServers.delete(key);
    return true;
  }
  return false;
}

/**
 * Starts (or reuses) a loopback-only HTTP static server for `outputDir` on a
 * free port (port 0 = OS-assigned). Returns the base URL. Reads files from disk
 * on every request, so regenerating the project updates what the browser sees
 * without restarting the server.
 */
export async function serveStaticDir(outputDir: string): Promise<{ url: string; port: number }> {
  const root = path.resolve(outputDir);
  const existing = activeStaticServers.get(root);
  if (existing) return { url: `http://localhost:${existing.port}`, port: existing.port };

  const server = http.createServer((req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const target = path.resolve(root, `.${urlPath === '/' ? '/index.html' : urlPath}`);
      if (!isWithinDirectory(root, target)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
      }
      fs.stat(target, (err, st) => {
        if (err || !st.isFile()) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not found');
          return;
        }
        const ext = path.extname(target).toLowerCase();
        res.writeHead(200, { 'Content-Type': STATIC_MIME[ext] || 'application/octet-stream' });
        fs.createReadStream(target).pipe(res);
      });
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal error');
    }
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', rejectListen);
      resolveListen();
    });
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  activeStaticServers.set(root, { port, server, outputDir: root });
  return { url: `http://localhost:${port}`, port };
}

/**
 * The dev-only backend for IPL Studio, reusable outside Vite.
 *
 * The returned `securityGate` + `handler` are plain connect-style middlewares
 * (`(req, res, next) => void`), so the exact same policy powers both the Vite
 * dev server (via `artifactDiskWriterPlugin`) and any future Node server
 * (Phase 9 desktop shell, plain `http` + connect, express, ...).
 *
 * Hardened for deployment: loopback-only, optional token auth (IPL_DEV_TOKEN),
 * a production flag that disables every dev endpoint unless auth is configured,
 * an explicit write confirmation for external directories, and an optional
 * command allow-list (IPL_ALLOWED_COMMANDS).
 */
export function createDevApiServer(options: DevApiServerOptions): DevApiServer {
  const { devToken, isProduction, allowedCommands } = options;
  const workspaceRoot = options.workspaceRoot || process.cwd();

  // Absolute paths pointing outside the workspace are allowed by design;
  // warn once per path so the user is never surprised about the trust boundary.
  const warnedExternalPaths = new Set<string>();

  // Directories the user has explicitly confirmed writing into via /api/confirm-path.
  const confirmedExternalDirs = new Set<string>();

  const startupWarning =
    '[Security] Dev-only endpoints /api/write-artifact, /api/read-disk, /api/run-command, /api/confirm-path and /api/git/* are active. '
    + (devToken
      ? 'Authentication via X-IPL-Token is enabled.'
      : 'No token configured (IPL_DEV_TOKEN); requests are restricted to loopback origins.')
    + (isProduction
      ? (devToken ? ' --production: dev endpoints active because auth is configured.'
                  : ' --production: dev endpoints are DISABLED (start with IPL_DEV_TOKEN set to enable them).')
      : '')
    + ' External output paths require an explicit user confirmation.';

  /**
   * Resolves a user-supplied path. Relative paths must stay inside the
   * workspace (guards against ".." traversal); absolute paths may point
   * anywhere on the local machine so projects can live outside the repo.
   */
  function resolveTargetPath(input: string): { targetPath: string; isExternal: boolean } {
    const resolved = path.isAbsolute(input) ? input : path.resolve(workspaceRoot, input);
    const isExternal = !isWithinDirectory(workspaceRoot, resolved);
    if (isExternal && !path.isAbsolute(input)) {
      const err: any = new Error('Relative path escapes the project workspace. Use an absolute path to target a folder outside of it.');
      err.statusCode = 403;
      throw err;
    }
    if (isExternal && !warnedExternalPaths.has(resolved)) {
      warnedExternalPaths.add(resolved);
      console.warn(`[Security] Operating outside the workspace: ${resolved}. Intended for explicit absolute-path project folders; writes still require an explicit user confirmation.`);
    }
    return { targetPath: resolved, isExternal };
  }

  // Per-request security gate: loopback host, production policy and token auth.
  const securityGate = (req: any, res: any, next: any) => {
    if (!req.url?.startsWith('/api/')) {
      next();
      return;
    }

    // DNS-rebinding guard: the Host header must resolve to loopback.
    const host = getHostname(String(req.headers.host || ''));
    if (!ALLOWED_LOOPBACK_HOSTS.includes(host)) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Dev APIs are restricted to loopback connections (localhost).' }));
      return;
    }

    // --production: every dev endpoint is disabled unless auth is configured.
    if (isProduction && !devToken) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Dev APIs are disabled in production. Start with IPL_DEV_TOKEN set to enable them.' }));
      return;
    }

    // Token auth (enforced whenever a token is configured).
    if (devToken && req.headers['x-ipl-token'] !== devToken) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Unauthorized: missing or invalid X-IPL-Token header.' }));
      return;
    }

    // Without a token, reject requests carrying a cross-origin Origin
    // header (a page hosted on another site cannot invoke the dev APIs).
    if (!devToken) {
      const origin = String(req.headers.origin || '');
      if (origin) {
        let originHost = '';
        try {
          originHost = new URL(origin).hostname.toLowerCase();
        } catch { /* keep '' -> blocked below */ }
        if (!ALLOWED_LOOPBACK_HOSTS.includes(originHost)) {
          res.statusCode = 403;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Cross-origin requests to the dev APIs are blocked.' }));
          return;
        }
      }
    }

    next();
  };

  const handler = async (req: any, res: any, next: any) => {
    if (req.url === '/api/write-artifact' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk: any) => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const { outputDir, files } = data;
          if (!outputDir || !Array.isArray(files)) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'outputDir and files parameters are required' }));
            return;
          }

          const { targetPath: resolvedDir, isExternal } = resolveTargetPath(outputDir);

          // Sandbox: external directories need an explicit confirmation first.
          if (isExternal && !confirmedExternalDirs.has(resolvedDir)) {
            res.statusCode = 403;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              error: 'This output directory is outside the project workspace and needs your explicit confirmation before writes.',
              code: 'PATH_CONFIRMATION_REQUIRED',
              path: resolvedDir
            }));
            return;
          }

          fs.mkdirSync(resolvedDir, { recursive: true });

          let writtenCount = 0;
          files.forEach((file: { relativePath: string; content: string }) => {
            if (path.isAbsolute(file.relativePath)) {
              throw new Error(`File "${file.relativePath}" must use a relative path.`);
            }
            const fullPath = path.join(resolvedDir, file.relativePath);
            if (!isWithinDirectory(resolvedDir, fullPath)) {
              throw new Error(`File "${file.relativePath}" escapes the target directory, write refused.`);
            }
            const parentDir = path.dirname(fullPath);
            fs.mkdirSync(parentDir, { recursive: true });
            fs.writeFileSync(fullPath, file.content, 'utf-8');
            writtenCount++;
          });

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            success: true,
            targetDir: resolvedDir,
            writtenFilesCount: writtenCount
          }));
        } catch (err: any) {
          res.statusCode = err.statusCode || 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    } else if (req.url === '/api/serve' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk: any) => { body += chunk; });
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          const { outputDir } = data;
          if (!outputDir) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'outputDir parameter is required' }));
            return;
          }
          const { targetPath: resolvedDir } = resolveTargetPath(outputDir);
          if (!fs.existsSync(resolvedDir)) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: `Directory does not exist: ${resolvedDir}` }));
            return;
          }
          const { url, port } = await serveStaticDir(resolvedDir);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true, url, port }));
        } catch (err: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    } else if (req.url === '/api/serve-stop' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk: any) => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const { outputDir } = data;
          const stopped = outputDir ? stopStaticServer(outputDir) : false;
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true, stopped }));
        } catch (err: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    } else if (req.url === '/api/smoke-test' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk: any) => { body += chunk; });
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          const files = data.files;
          if (!Array.isArray(files)) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'files parameter (array) is required' }));
            return;
          }
          const result = await runSyntaxSmoke(files);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(result));
        } catch (err: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    } else if (req.url === '/api/read-disk' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk: any) => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const { outputDir } = data;
          if (!outputDir) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'outputDir parameter is required' }));
            return;
          }

          const { targetPath: resolvedDir } = resolveTargetPath(outputDir);

          if (!fs.existsSync(resolvedDir)) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, targetDir: resolvedDir, files: [] }));
            return;
          }

          const ignored = ['.git', 'node_modules', 'venv', '__pycache__', '.DS_Store', 'dist', 'build', '.idea', '.vscode'];
          const readDirRecursive = (dirPath: string, rootDir: string): Array<{ relativePath: string; content: string }> => {
            const result: Array<{ relativePath: string; content: string }> = [];
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });

            for (const entry of entries) {
              if (ignored.includes(entry.name)) continue;
              const fullPath = path.join(dirPath, entry.name);
              if (entry.isDirectory()) {
                result.push(...readDirRecursive(fullPath, rootDir));
              } else if (entry.isFile()) {
                try {
                  const content = fs.readFileSync(fullPath, 'utf-8');
                  const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
                  result.push({ relativePath, content });
                } catch {
                  // skip binary or unreadable files
                }
              }
            }
            return result;
          };

          const diskFiles = readDirRecursive(resolvedDir, resolvedDir);

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            success: true,
            targetDir: resolvedDir,
            files: diskFiles
          }));
        } catch (err: any) {
          res.statusCode = err.statusCode || 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    } else if (req.url === '/api/confirm-path' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk: any) => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const { path: targetPath } = data;
          if (!targetPath || typeof targetPath !== 'string') {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'path parameter is required' }));
            return;
          }

          const { targetPath: resolved } = resolveTargetPath(targetPath);
          confirmedExternalDirs.add(resolved);

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true, confirmedPath: resolved }));
        } catch (err: any) {
          res.statusCode = err.statusCode || 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    } else if (req.url === '/api/run-command' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk: any) => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const { command, cwd } = data;
          if (!command) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Command is required' }));
            return;
          }

          // Command allow-list: only enforced when IPL_ALLOWED_COMMANDS is set.
          if (allowedCommands && !isCommandAllowed(command, allowedCommands)) {
            res.statusCode = 403;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              error: `Command "${commandPrefix(command)}" is not in the allow-list (IPL_ALLOWED_COMMANDS).`,
              code: 'COMMAND_NOT_ALLOWED',
              command
            }));
            return;
          }

          const targetCwd = cwd
            ? resolveTargetPath(cwd).targetPath
            : workspaceRoot;

          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.setHeader('Transfer-Encoding', 'chunked');

          const proc = spawn(command, {
            cwd: targetCwd,
            shell: true
          });

          proc.stdout.on('data', (chunk) => {
            res.write(chunk.toString());
          });

          proc.stderr.on('data', (chunk) => {
            res.write(chunk.toString());
          });

          proc.on('close', (code) => {
            res.write(`\n[Exit code: ${code}] - Process finished\n`);
            res.end();
          });

          proc.on('error', (err) => {
            res.write(`\n[Execution error: ${err.message}]\n`);
            res.end();
          });
        } catch (err: any) {
          res.statusCode = err.statusCode || 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    } else if (req.url === '/api/git/status' && req.method === 'GET') {
      try {
        const { stdout: branch } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: workspaceRoot });
        const { stdout: status } = await execAsync('git status --short', { cwd: workspaceRoot });
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          branch: branch.trim(),
          statusText: status.trim() || 'Nothing to commit, working tree clean.'
        }));
      } catch (err: any) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ branch: 'main', statusText: 'Local Git repository ready.' }));
      }
    } else if (req.url === '/api/git/diff' && req.method === 'GET') {
      try {
        const { stdout: diff } = await execAsync('git diff', { cwd: workspaceRoot });
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ diffText: diff || 'No Git differences detected.' }));
      } catch (err: any) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ diffText: 'Git repository not initialized or no changes.' }));
      }
    } else if (req.url === '/api/git/commit' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk: any) => { body += chunk; });
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          const message = String(data.message || 'IPL Studio Auto-Commit')
            .replace(/\r?\n/g, ' ')
            .trim() || 'IPL Studio Auto-Commit';
          await execFileAsync('git', ['add', '.'], { cwd: workspaceRoot });
          const { stdout } = await execFileAsync('git', ['commit', '-m', message], { cwd: workspaceRoot });
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true, log: stdout }));
        } catch (err: any) {
          res.statusCode = err.statusCode || 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    } else {
      next();
    }
  };

  return { securityGate, handler, startupWarning };
}

/**
 * Vite plugin wrapper: registers the same dev-only API middlewares on the
 * Vite dev server. ⚠️ Endpoints only available in development mode
 * (configureServer is not active in production builds).
 */
export function artifactDiskWriterPlugin(options: DevApiServerOptions) {
  const logger = options.logger || { warn: (msg: string) => console.warn(msg) };
  return {
    name: 'artifact-disk-writer-plugin',
    configureServer(server: any) {
      const devApi = createDevApiServer(options);
      logger.warn(devApi.startupWarning);
      server.middlewares.use(devApi.securityGate);
      server.middlewares.use(devApi.handler);
    }
  };
}
