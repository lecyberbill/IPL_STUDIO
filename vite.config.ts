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
 * Racine de l'espace de travail : tous les chemins d'écriture / d'exécution
 * sont cloisonnés à l'intérieur de cette racine pour limiter l'impact en cas
 * d'exposition accidentelle du serveur de dev.
 */
const WORKSPACE_ROOT = process.cwd();

/**
 * Vérifie qu'un chemin résolu reste bien à l'intérieur de l'espace de travail.
 */
function isWithinWorkspace(resolvedPath: string): boolean {
  const relative = path.relative(WORKSPACE_ROOT, resolvedPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * Middleware Vite serveur pour matérialiser physiquement les artefacts générés, exécuter des commandes et gérer Git
 * ⚠️ Endpoints uniquement disponibles en mode développement (configureServer n'est pas actif en production).
 */
function artifactDiskWriterPlugin() {
  return {
    name: 'artifact-disk-writer-plugin',
    configureServer(server: any) {
      server.config.logger.warn(
        '[Security] Dev-only endpoints /api/write-artifact, /api/read-disk, /api/run-command et /api/git/* sont actifs. '
        + 'N\'exposez JAMAIS ce serveur de développement sur un réseau non fiable.'
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
                res.end(JSON.stringify({ error: 'Paramètres outputDir et files requis' }));
                return;
              }

              const resolvedDir = path.isAbsolute(outputDir) 
                ? outputDir 
                : path.resolve(process.cwd(), outputDir);

              if (!isWithinWorkspace(resolvedDir)) {
                res.statusCode = 403;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  error: 'outputDir doit rester à l\'intérieur de l\'espace de travail du projet.'
                }));
                return;
              }

              fs.mkdirSync(resolvedDir, { recursive: true });

              let writtenCount = 0;
              files.forEach((file: { relativePath: string; content: string }) => {
                const fullPath = path.join(resolvedDir, file.relativePath);
                if (!isWithinWorkspace(fullPath)) {
                  throw new Error(`Fichier "${file.relativePath}" sort de l'espace de travail, écriture refusée.`);
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
                res.end(JSON.stringify({ error: 'Paramètre outputDir requis' }));
                return;
              }

              const resolvedDir = path.isAbsolute(outputDir) 
                ? outputDir 
                : path.resolve(process.cwd(), outputDir);

              if (!isWithinWorkspace(resolvedDir)) {
                res.statusCode = 403;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  error: 'outputDir doit rester à l\'intérieur de l\'espace de travail du projet.'
                }));
                return;
              }

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
              res.statusCode = 500;
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
                res.end(JSON.stringify({ error: 'Command est requise' }));
                return;
              }

              const targetCwd = cwd
                ? path.resolve(process.cwd(), cwd)
                : process.cwd();

              if (!isWithinWorkspace(targetCwd)) {
                res.statusCode = 403;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  error: 'Le répertoire de travail (cwd) doit rester à l\'intérieur de l\'espace de travail du projet.'
                }));
                return;
              }

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
                res.write(`\n[Exit code: ${code}] - Processus terminé\n`);
                res.end();
              });

              proc.on('error', (err) => {
                res.write(`\n[Erreur d'exécution: ${err.message}]\n`);
                res.end();
              });
            } catch (err: any) {
              res.statusCode = 500;
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
              statusText: status.trim() || 'Rien à commiter, la copie de travail est propre.'
            }));
          } catch (err: any) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ branch: 'main', statusText: 'Dépôt Git local prêt.' }));
          }
        } else if (req.url === '/api/git/diff' && req.method === 'GET') {
          try {
            const { stdout: diff } = await execAsync('git diff', { cwd: process.cwd() });
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ diffText: diff || 'Aucune différence Git détectée.' }));
          } catch (err: any) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ diffText: 'Dépôt Git non initialisé ou aucune modification.' }));
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
              res.statusCode = 500;
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

  // Ne jamais exposer de variables d'environnement non préfixées VITE_ côté client.
  // Les clés API utilisées par l'application doivent être préfixées VITE_ (standard Vite).
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
