import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { parseAllowedCommands } from './src/engine/security.js'
import { artifactDiskWriterPlugin } from './src/server/devApiServer.js'

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
    // Only scan the app's own entry for dependency pre-bundling. Without this,
    // Vite crawls every *.html under the project root — including benchmark
    // artifacts in output/ whose <script src="app.js"> targets don't exist,
    // which breaks the dependency scan at dev server startup.
    optimizeDeps: {
      entries: ['index.html']
    },
    define: {
      '__IPL_SYSTEM_ENVS__': JSON.stringify(combinedEnvs),
      'process.env': JSON.stringify(combinedEnvs),
      '__IPL_DEV_TOKEN__': JSON.stringify(devToken)
    },
    build: {
      // monaco-editor is ~4 MB and inherently large (all language contributions
      // + editor core). It is now isolated into its own cacheable chunk
      // (monaco-vendor) so the app entry stays tiny (~300 kB). The limit below
      // acknowledges that monaco is a known, cacheable outlier — not app code.
      chunkSizeWarningLimit: 5000,
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: 'monaco-vendor',
                test: /node_modules[\\/](monaco-editor|@monaco-editor)/,
                priority: 30
              },
              {
                name: 'xterm-vendor',
                test: /node_modules[\\/](xterm|xterm-addon-fit)/,
                priority: 30
              },
              {
                name: 'react-vendor',
                test: /node_modules[\\/](react|react-dom|scheduler|zustand)/,
                priority: 20
              },
              {
                name: 'ui-vendor',
                test: /node_modules[\\/](lucide-react|@tailwindcss)/,
                priority: 15
              }
            ]
          }
        }
      }
    }
  }
})
