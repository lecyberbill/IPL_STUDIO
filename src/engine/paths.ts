/**
 * Centralized management of project output paths.
 * Uses paths relative to the workspace to stay portable
 * across machines (the Vite middleware resolves relative paths
 * relative to the project root).
 */

export const DEFAULT_OUTPUT_BASE = 'output';

export function toSafeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'my_project';
}

export function defaultOutputDir(projectName: string): string {
  return `${DEFAULT_OUTPUT_BASE}/${toSafeName(projectName)}`;
}
