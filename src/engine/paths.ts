/**
 * Gestion centralisée des chemins d'output des projets.
 * Utilise des chemins relatifs à l'espace de travail pour rester portable
 * d'une machine à l'autre (le middleware Vite résout les chemins relatifs
 * par rapport à la racine du projet).
 */

export const DEFAULT_OUTPUT_BASE = 'output';

export function toSafeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'my_project';
}

export function defaultOutputDir(projectName: string): string {
  return `${DEFAULT_OUTPUT_BASE}/${toSafeName(projectName)}`;
}
