import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import fs from 'fs'
import { spawn, exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec);

/**
 * Middleware Vite serveur pour matérialiser physiquement les artefacts générés, exécuter des commandes et gérer Git
 */
function artifactDiskWriterPlugin() {
  return {
    name: 'artifact-disk-writer-plugin',
    configureServer(server: any) {
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

              fs.mkdirSync(resolvedDir, { recursive: true });

              let writtenCount = 0;
              files.forEach((file: { relativePath: string; content: string }) => {
                const fullPath = path.join(resolvedDir, file.relativePath);
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

              const targetCwd = cwd && fs.existsSync(cwd) ? cwd : process.cwd();

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
                res.write(`\n[Processus terminé avec le code ${code}]\n`);
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
              const message = data.message || 'IPL Studio Auto-Commit';
              await execAsync('git add .', { cwd: process.cwd() });
              const { stdout } = await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd: process.cwd() });
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

  const combinedEnvs: Record<string, string> = {};
  
  Object.keys(process.env).forEach(key => {
    if (key.startsWith('VITE_') || key.includes('API_KEY') || key.includes('DP_')) {
      combinedEnvs[key] = process.env[key] || '';
    }
  });

  Object.keys(env).forEach(key => {
    combinedEnvs[key] = env[key] || '';
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
