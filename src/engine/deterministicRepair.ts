/**
 * LLM-independent, deterministic pre-repair fixes for the two documented
 * cloud failure modes:
 *
 *  1. ES-module hazard: <script type="module"> in a single-file HTML target
 *     breaks under file:// (CORS). Stripped from HTML files.
 *  2. Missing Tailwind CDN: HTML that uses `class="..."` but no Tailwind CDN
 *     script renders unstyled. The CDN <script> is injected into <head>.
 *
 * These are cheap, reproducible fixes applied BEFORE spending an LLM repair
 * call, so the agent only burns tokens when deterministic repair cannot help.
 */
export interface DeterministicRepair {
  relativePath: string;
  content: string;
}

export interface DeterministicRepairResult {
  files: DeterministicRepair[];
  applied: string[];
}

const TAILWIND_CDN = '<script src="https://cdn.tailwindcss.com"></script>';

/** Strips `type="module"` (and module variants) from all <script> tags in HTML. */
function stripModuleScriptTags(content: string): string {
  return content.replace(/<script\b([^>]*?)\btype\s*=\s*["']module["']([^>]*)>/gi, (_m, pre: string, post: string) => {
    return `<script${pre}${post}>`;
  });
}

/** Injects the Tailwind CDN script into <head> if the page uses class attributes but has no CDN. */
function ensureTailwindCdn(content: string): string {
  if (content.includes('cdn.tailwindcss.com')) return content;
  if (!/class\s*=\s*["'][^"']+["']/.test(content)) return content;

  const cdnScript = `  ${TAILWIND_CDN}\n`;
  if (/<head\b[^>]*>/i.test(content) && /<\/head>/i.test(content)) {
    return content.replace(/<\/head>/i, `${cdnScript}</head>`);
  }
  if (/<body\b[^>]*>/i.test(content)) {
    return content.replace(/<body\b[^>]*>/i, (m) => `${m}\n${cdnScript}`);
  }
  return content.replace(/<!DOCTYPE[^>]*>/i, (m) => `${m}\n${cdnScript}`);
}

/**
 * Applies deterministic repairs to a set of project files (in-memory, no disk
 * I/O). Returns the repaired files plus a human-readable list of applied fixes.
 */
export function applyDeterministicRepairs(files: DeterministicRepair[]): DeterministicRepairResult {
  const applied: string[] = [];
  const repaired = files.map((f) => {
    let content = f.content;
    const isHtml = /\.html?$/i.test(f.relativePath);

    if (isHtml) {
      const stripped = stripModuleScriptTags(content);
      if (stripped !== content) {
        applied.push(`${f.relativePath}: stripped type="module" from <script>`);
        content = stripped;
      }
      const withCdn = ensureTailwindCdn(content);
      if (withCdn !== content) {
        applied.push(`${f.relativePath}: injected Tailwind CDN script`);
        content = withCdn;
      }
    }

    return { relativePath: f.relativePath, content };
  });

  return { files: repaired, applied };
}
