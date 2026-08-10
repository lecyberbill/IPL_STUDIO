import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import fs from 'fs'
import { spawn, exec, execFile } from 'child_process'
import { promisify } from 'util'
import { parseAllowedCommands, isCommandAllowed, commandPrefix } from './src/engine/security.js'

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

/**
 * Workspace root: relative write / execution paths are sandboxed
 * inside this root. Explicit absolute paths may target any local folder
 * so projects can be created outside the program directory.
 */
const WORKSPACE_ROOT = process.cwd();

/**
 * Verifies a resolved path stays inside the workspace.
 */
function isWithinWorkspace(resolvedPath: string): boolean {
  const relative = path.relative(WORKSPACE_ROOT, resolvedPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * Verifies a path stays inside a given root directory.
 */
function isWithinDirectory(rootDir: string, candidatePath: string): boolean {
  const relative = path.relative(rootDir, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

// Absolute paths pointing outside the workspace are allowed by design;
// warn once per path so the user is never surprised about the trust boundary.
const warnedExternalPaths = new Set<string>();

// Directories the user has explicitly confirmed writing into via /api/confirm-path.
const confirmedExternalDirs = new Set<string>();

// Loopback hostnames that are allowed to call the dev APIs.
const ALLOWED_LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]', '0:0:0:0:0:0:0:1'];

function getHostname(hostHeader: string): string {
  const host = hostHeader.trim().toLowerCase();
  if (host.startsWith('[')) {
    const end = host.indexOf(']');
    return end >= 0 ? host.slice(0, end + 1) : host;
  }
  return host.split(':')[0];
}

/**
 * Resolves a user-supplied path. Relative paths must stay inside the
 * workspace (guards against ".." traversal); absolute paths may point
 * anywhere on the local machine so projects can live outside the repo.
 */
function resolveTargetPath(input: string): { targetPath: string; isExternal: boolean } {
  const resolved = path.isAbsolute(input) ? input : path.resolve(process.cwd(), input);
  const isExternal = !isWithinWorkspace(resolved);
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

interface DiskWriterPluginOptions {
  devToken: string;
  isProduction: boolean;
  allowedCommands: string[] | null;
}

/**
 * Vite server middleware to physically materialize generated artifacts, run commands and manage Git
 * ⚠️ Endpoints only available in development mode (configureServer is not active in production).
 * Hardened for deployment: loopback-only, optional token auth (IPL_DEV_TOKEN), a `--production`
 * flag that disables every dev endpoint unless auth is configured, an explicit write confirmation
 * for external directories, and an optional command allow-list (IPL_ALLOWED_COMMANDS).
 */
function artifactDiskWriterPlugin(options: DiskWriterPluginOptions) {
  const { devToken, isProduction, allowedCommands } = options;
  return {
    name: 'artifact-disk-writer-plugin',
    configureServer(server: any) {
      server.config.logger.warn(
        '[Security] Dev-only endpoints /api/write-artifact, /api/read-disk, /api/run-command, /api/confirm-path and /api/git/* are active. '
        + (devToken
          ? 'Authentication via X-IPL-Token is enabled.'
          : 'No token configured (IPL_DEV_TOKEN); requests are restricted to loopback origins.')
        + (isProduction
          ? (devToken ? ' --production: dev endpoints active because auth is configured.'
                      : ' --production: dev endpoints are DISABLED (start with IPL_DEV_TOKEN set to enable them).')
          : '')
        + ' External output paths require an explicit user confirmation.'
      );

      // Per-request security gate: loopback host, production policy and token auth.
      server.middlewares.use((req: any, res: any, next: any) => {
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
      });

      server.middlewares.use(async (req: any, res: any, next: any) => {
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
                : process.cwd();

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
            const { stdout: branch } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: process.cwd() });
            const { stdout: status } = await execAsync('git status --short', { cwd: process.cwd() });
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
            const { stdout: diff } = await execAsync('git diff', { cwd: process.cwd() });
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
              await execFileAsync('git', ['add', '.'], { cwd: process.cwd() });
              const { stdout } = await execFileAsync('git', ['commit', '-m', message], { cwd: process.cwd() });
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
      });
    }
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // Security hardening (Phase 8):
  // - IPL_DEV_TOKEN (env or .env) enables token auth via the X-IPL-Token header.
  // - `npm run dev -- --production` (or IPL_PRODUCTION=1) disables every dev
  //   endpoint unless a token is configured.
  // - IPL_ALLOWED_COMMANDS (comma-separated) restricts /api/run-command to a
  //   configured allow-list; when unset the client's default policy applies.
  const devToken = process.env.IPL_DEV_TOKEN || env.IPL_DEV_TOKEN || '';
  const isProduction = process.argv.includes('--production')
    || process.env.IPL_PRODUCTION === '1'
    || process.env.IPL_PRODUCTION === 'true';
  const allowedCommands = parseAllowedCommands(
    process.env.IPL_ALLOWED_COMMANDS || env.IPL_ALLOWED_COMMANDS
  );

  // Never expose non-VITE_ prefixed environment variables to the client.
  // API keys used by the app must be prefixed VITE_ (Vite standard).
  const combinedEnvs: Record<string, string> = {};

  Object.keys(process.env).forEach(key => {
    if (key.startsWith('VITE_')) {
      combinedEnvs[key] = process.env[key] || '';
    }
  });

  Object.keys(env).forEach(key => {
    if (key.startsWith('VITE_')) {
      combinedEnvs[key] = env[key] || '';
    }
  });

  return {
    plugins: [
      react(),
      tailwindcss(),
      artifactDiskWriterPlugin({ devToken, isProduction, allowedCommands })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src')
      }
    },
    define: {
      '__IPL_SYSTEM_ENVS__': JSON.stringify(combinedEnvs),
      'process.env': JSON.stringify(combinedEnvs),
      '__IPL_DEV_TOKEN__': JSON.stringify(devToken)
    }
  }
})
