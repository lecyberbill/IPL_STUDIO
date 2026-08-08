import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import fs from 'fs'
import { spawn, exec, execFile } from 'child_process'
import { promisify } from 'util'

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
    console.warn(`[Security] Operating outside the workspace: ${resolved}. Intended for explicit absolute-path project folders; keep the dev server on localhost.`);
  }
  return { targetPath: resolved, isExternal };
}

/**
 * Vite server middleware to physically materialize generated artifacts, run commands and manage Git
 * ⚠️ Endpoints only available in development mode (configureServer is not active in production).
 * Absolute paths may target any local folder (projects can live outside the program directory);
 * keep the server on localhost and do NOT expose it to an untrusted network.
 */
function artifactDiskWriterPlugin() {
  return {
    name: 'artifact-disk-writer-plugin',
    configureServer(server: any) {
      server.config.logger.warn(
        '[Security] Dev-only endpoints /api/write-artifact, /api/read-disk, /api/run-command and /api/git/* are active. '
        + 'Absolute output paths may write/run anywhere on this machine. '
        + 'NEVER expose this development server to an untrusted network.'
      );
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

              const { targetPath: resolvedDir } = resolveTargetPath(outputDir);

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
      artifactDiskWriterPlugin()
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src')
      }
    },
    define: {
      '__IPL_SYSTEM_ENVS__': JSON.stringify(combinedEnvs),
      'process.env': JSON.stringify(combinedEnvs)
    }
  }
})
