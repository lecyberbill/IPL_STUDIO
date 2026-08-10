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
    define: {
      '__IPL_SYSTEM_ENVS__': JSON.stringify(combinedEnvs),
      'process.env': JSON.stringify(combinedEnvs),
      '__IPL_DEV_TOKEN__': JSON.stringify(devToken)
    }
  }
})
