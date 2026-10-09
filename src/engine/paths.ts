/**
 * Centralized management of project output paths.
 * Uses paths relative to the workspace to stay portable
 * across machines (the Vite middleware resolves relative paths
 * relative to the project root).
 */

export const DEFAULT_OUTPUT_BASE = 'output';

/** Windows reserved device names (case-insensitive) that cannot be a folder. */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/;

/** Upper bound so a pathological project name cannot exceed path limits. */
const MAX_SAFE_NAME = 64;

/**
 * Normalises a project name into a portable folder-name segment.
 *
 * Guarantees: only `[a-z0-9_]`, never empty, never a path separator or `..`,
 * never a Windows reserved device name, bounded length. This is a *filename*
 * sanitiser, not a security boundary (the write path still enforces the
 * workspace sandbox) — but it keeps `mkdir` from failing on names like `CON`.
 */
export function toSafeName(name: string): string {
  const safe = name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!safe) return 'my_project';
  const guarded = WINDOWS_RESERVED.test(safe) ? `_${safe}` : safe;
  return guarded.slice(0, MAX_SAFE_NAME);
}

export function defaultOutputDir(projectName: string): string {
  return `${DEFAULT_OUTPUT_BASE}/${toSafeName(projectName)}`;
}
