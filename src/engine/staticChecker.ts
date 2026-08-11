/**
 * Static artifact checker — "the holes in the racket" pass.
 *
 * Unlike the deterministic repairers (which fix known patterns) and the
 * behavioral verify (which runs the app), this pass READS the generated code
 * and cross-references relative import statements against the files actually
 * present in the artifact. Its job: catch the recurring bug where the model
 * emits `require('./entities')` (or `from .config import ...`) but never
 * generates the referenced file — which turns a fixable one-file gap into a
 * hard `Cannot find module` failure at runtime.
 *
 * The checker is deliberately language-agnostic and dumb: it extracts relative
 * import specifiers with regexes per language family, resolves each against the
 * importing file's directory, probes a conventional set of extensions, and
 * reports the ones that resolve to nothing. Non-relative specifiers
 * (`react`, `flask`, `src/models`) are ignored here — missing third-party
 * dependencies are the job of the harness' `diagnoseMissingDeps`, not this pass.
 *
 * Pure functions only, so the module is unit-testable in isolation.
 */

import type { ProjectArtifactFile } from './artifactGenerator';

export interface MissingModuleRef {
  /** The importing file, e.g. `src/orderService.js`. */
  importer: string;
  /** The raw specifier as written, e.g. `./entities`. */
  specifier: string;
  /** The resolved path we probed but did not find, e.g. `src/entities.js`. */
  resolved: string;
  /** Human-readable hint about what the model likely forgot to generate. */
  suggestion: string;
}

export interface InvalidJson {
  /** The file whose content is not valid JSON, e.g. `package.json`. */
  file: string;
  /** Why it failed to parse (JSON.parse error message). */
  reason: string;
  /** Human-readable hint. */
  suggestion: string;
}

/**
 * Normalizes a relative path to forward slashes with no leading `./` or `/`.
 * `src/../lib` -> `lib`, `./entities` -> `entities`, `../a.js` -> `a.js`.
 */
export function normalizeRelative(p: string): string {
  const parts: string[] = [];
  for (const seg of p.replace(/\\/g, '/').split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      parts.pop();
      continue;
    }
    parts.push(seg);
  }
  return parts.join('/');
}

/**
 * Resolves a relative specifier from the importing file's directory to a list
 * of candidate paths, normalized so callers can probe them against the
 * artifact's file set.
 *
 * Two syntax families are handled:
 *  - JS/TS paths (`./entities`, `../lib/util`): the `..` segments traverse
 *    directories, resolved against the importer's folder.
 *  - Python dotted modules (`.config`, `..base`, `.`): the leading dots encode
 *    package depth, not path segments — `from .config import x` is a SIBLING
 *    file `config.py`, `from ..base import x` is a file in the PARENT package.
 */
export function resolveCandidates(importer: string, specifier: string, extHint = ''): string[] {
  const base = normalizeRelative(importer);
  const dir = base.includes('/') ? base.slice(0, base.lastIndexOf('/')) : '';
  const dirParts = dir ? dir.split('/') : [];

  let target = '';
  const pythonDotted = /^(\.+)([.\w]*)$/.exec(specifier);
  if (pythonDotted) {
    const [, dots, name] = pythonDotted;
    // `.` = current package (same dir as importer), `..` = parent package, ...
    const levelsUp = Math.min(dots.length - 1, dirParts.length);
    target = [...dirParts.slice(0, dirParts.length - levelsUp), name].filter(Boolean).join('/');
  } else {
    target = normalizeRelative(`${dir}/${specifier}`);
  }

  const candidates = new Set<string>();
  const bareName = target.includes('/') ? target.slice(target.lastIndexOf('/') + 1) : target;
  if (/\.\w+$/.test(bareName)) {
    // Explicit extension (e.g. `./entities.js`) — only the exact file matches.
    candidates.add(target);
  } else {
    const exts = ['.js', '.jsx', '.ts', '.tsx', '.py', '.rs', '.go', '.mjs', '.cjs'];
    // Prefer the importing file's own language extension first.
    const hint = extHint && exts.includes(extHint) ? extHint : '';
    for (const e of (hint ? [hint, ...exts.filter(x => x !== hint)] : exts)) {
      candidates.add(`${target}${e}`);
    }
    // `./foo` may also mean `foo/index.<ext>`.
    for (const e of (hint ? [hint, ...exts.filter(x => x !== hint)] : exts)) {
      candidates.add(`${target}/index${e}`);
    }
  }
  return Array.from(candidates);
}

/** Extracts relative import specifiers from a source file, per language family. */
export function extractRelativeImports(file: ProjectArtifactFile): string[] {
  const { relativePath, content } = file;
  const specifiers = new Set<string>();

  if (/\.(jsx?|tsx?|mjs|cjs)$/.test(relativePath)) {
    const requireRe = /require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;
    const importRe = /(?:from\s+|import\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g;
    for (const re of [requireRe, importRe]) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(content)) !== null) specifiers.add(m[1]);
    }
  } else if (/\.py$/.test(relativePath)) {
    // `from . import config` -> sibling module `.config`, `from .m import x`
    // -> `.m`, `from ..m import x` -> `..m`. Bare `import models` is a top-level
    // module (dep or sibling package) — only captured as a specifier to probe.
    const fromRe = /from\s+(\.{1,3}[.\w]*)\s+import\s+([\w.]+)\s*$/gm;
    const importRe = /^\s*import\s+(\w+(?:\.\w+)*)\s*$/gm;
    let m: RegExpExecArray | null;
    while ((m = fromRe.exec(content)) !== null) {
      // `from . import config` means module `config` inside the current
      // package, i.e. `.config` — compose the real relative module path.
      const dotsModule = m[1];
      specifiers.add(/^\.+$/.test(dotsModule) ? `${dotsModule}${m[2]}` : dotsModule);
    }
    while ((m = importRe.exec(content)) !== null) specifiers.add(m[1]);
  } else if (/\.rs$/.test(relativePath)) {
    const useRe = /use\s+(super|self|crate|::)+[:\s]*(crate::)?([\w:]+)/g;
    let m: RegExpExecArray | null;
    while ((m = useRe.exec(content)) !== null) {
      const spec = m[0].replace(/^use\s+/, '').split('::')[0];
      if (spec && spec !== 'super' && spec !== 'self' && spec !== 'crate') specifiers.add(spec);
    }
  } else if (/\.go$/.test(relativePath)) {
    // Relative Go imports don't exist (module paths are deps); skip.
  }

  return Array.from(specifiers);
}

/**
 * The main check: given the artifact's files, find every relative import that
 * does not resolve to any generated file. Pure and deterministic.
 */
export function findMissingModuleRefs(files: ProjectArtifactFile[]): MissingModuleRef[] {
  const present = new Set(files.map(f => f.relativePath.replace(/\\/g, '/')));
  const missing: MissingModuleRef[] = [];

  for (const file of files) {
    const extHint = /\.(\w+)$/.exec(file.relativePath)?.[1] ? `.${/\.(\w+)$/.exec(file.relativePath)![1]}` : '';
    for (const specifier of extractRelativeImports(file)) {
      // Bare package imports (`flask`, `express`) are out of scope — deps, not files.
      if (!specifier.startsWith('.')) continue;
      const probed = resolveCandidates(file.relativePath, specifier, extHint);
      if (probed.some(p => present.has(p))) continue;

      const resolved = probed[0];
      const suggestion = `file "${resolved}" imported by ${file.relativePath} is not generated`;
      missing.push({ importer: file.relativePath, specifier, resolved, suggestion });
    }
  }
  return missing;
}

/**
 * Deterministic JSON gate: any `.json` file in the artifact must be parseable.
 * Catches the recurring LLM habit of writing JSON with a leading `//` comment
 * or trailing commas — invalid for Node's package resolver, which then refuses
 * to load the whole project. Pure and deterministic (0 tokens), like
 * `findMissingModuleRefs`; the LLM reviewer is unreliable for this class.
 */
export function findInvalidJson(files: ProjectArtifactFile[]): InvalidJson[] {
  const issues: InvalidJson[] = [];
  for (const file of files) {
    if (!/\.json$/i.test(file.relativePath)) continue;
    try {
      JSON.parse(file.content);
    } catch (err: any) {
      issues.push({
        file: file.relativePath,
        reason: err?.message ?? 'invalid JSON',
        suggestion: `file "${file.relativePath}" is not valid JSON (${err?.message ?? 'parse error'}) — rewrite it as strict JSON: no comments, no trailing commas`
      });
    }
  }
  return issues;
}
