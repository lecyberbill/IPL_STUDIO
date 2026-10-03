/**
 * `@file` mentions in the chat — reference a specific artifact file so the
 * model knows which file the request is about. Pure and testable.
 */

/** Extracts `@path` mentions that match a known artifact file (ignores unknowns). */
export function extractArtifactMentions(text: string, knownPaths: string[]): string[] {
  const known = new Set(knownPaths);
  const out = new Set<string>();
  const re = /@([A-Za-z0-9_][\w./-]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (known.has(m[1])) out.add(m[1]);
  }
  return [...out];
}

/** Autocomplete candidates for an in-progress `@query` (substring match, capped). */
export function filterMentionCandidates(query: string, knownPaths: string[], max = 8): string[] {
  const q = query.toLowerCase();
  return knownPaths.filter(p => p.toLowerCase().includes(q)).slice(0, max);
}
