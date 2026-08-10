/**
 * Secure dev-server launcher (Phase 8).
 *
 * Vite's CLI rejects unknown options, so the documented `--production` flag is
 * implemented here: this wrapper sets IPL_PRODUCTION=1 (equivalent to running
 * `npm run dev -- --production`) then boots Vite normally. With this flag every
 * dev API endpoint is disabled unless IPL_DEV_TOKEN is configured.
 *
 * Usage: npm run dev:secure
 */
process.env.IPL_PRODUCTION = '1';

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const viteBin = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', 'vite', 'bin', 'vite.js');

const child = spawn(process.execPath, [viteBin], { stdio: 'inherit' });

child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', (err) => {
  console.error('[dev:secure] Failed to start Vite:', err.message);
  process.exit(1);
});
