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

/** Strips SEARCH/REPLACE diff markers (`<<<<<<< SEARCH`, `=======`, `>>>>>>> REPLACE`) from generated code. */
function stripPatchArtifacts(content: string): string {
  return content
    .replace(/^[ \t]*<<<<<<<\s*SEARCH[ \t]*$/gm, '')
    .replace(/^[ \t]*={7,}[ \t]*$/gm, '')
    .replace(/^[ \t]*>>>>>>>\s*REPLACE[ \t]*$/gm, '')
    .replace(/\n{3,}/g, '\n\n');
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

    // SEARCH/REPLACE markers are a syntax error in every language — strip them
    // mechanically before any LLM repair call.
    const noMarkers = stripPatchArtifacts(content);
    if (noMarkers !== content) {
      applied.push(`${f.relativePath}: stripped SEARCH/REPLACE patch markers`);
      content = noMarkers;
    }

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

    if (/\.py$/i.test(f.relativePath)) {
      const fixedImports = fixPythonRelativeImports(content, f.relativePath, files);
      if (fixedImports !== content) {
        applied.push(`${f.relativePath}: rewrote relative import that referenced a module in a sibling directory`);
        content = fixedImports;
      }
    }

    return { relativePath: f.relativePath, content };
  });

  return { files: repaired, applied };
}

/**
 * Fixes Python relative imports like `from .config import X` in
 * `src/models/foo.py` when `config.py` actually lives in the parent directory
 * (`src/config.py`), i.e. the module referenced by `.config` does not exist in
 * the current package but does exist in the parent. Only rewrites when the
 * target is verifiably resolvable, so a legitimate sibling import is untouched.
 */
function fixPythonRelativeImports(content: string, relativePath: string, files: DeterministicRepair[]): string {
  const parts = relativePath.split(/[\\/]/);
  const fileName = parts.pop();
  if (!fileName || !fileName.endsWith('.py')) return content;
  if (fileName === '__init__.py') return content;
  if (parts.length === 0) return content;

  const currentPkg = parts.join('/');
  const parentPkg = parts.slice(0, -1).join('/');
  const has = (pkg: string, module: string) => {
    const asFile = files.some(f => f.relativePath.replace(/[\\/]/g, '/') === `${pkg}/${module}.py`);
    const asPkg = files.some(f => f.relativePath.replace(/[\\/]/g, '/').startsWith(`${pkg}/${module}/`));
    return asFile || asPkg;
  };

  // `from .X import ...` -> `from ..X import ...` when X is only in the parent.
  return content.replace(
    /^(\s*)from\s+\.([A-Za-z_][\w.]*)\s+import\b/gm,
    (m, indent: string, moduleChain: string) => {
      const [first] = moduleChain.split('.');
      const siblingExists = has(currentPkg, first);
      const parentExists = parentPkg !== '' && has(parentPkg, first);
      if (siblingExists || !parentExists) return m;
      return `${indent}from ..${moduleChain} import`;
    }
  );
}
