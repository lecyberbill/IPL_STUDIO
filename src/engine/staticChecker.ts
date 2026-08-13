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

import type { ProjectArtifactFile } from './artifactGenerator.ts';

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

export interface FormMismatch {
  /** The file responsible (or `(project)` when the whole tree is wrong). */
  file: string;
  /** Short description of the mismatch, e.g. "web asset present for a CLI target". */
  reason: string;
  /** Human-readable hint on how to realign the tree with the chosen form. */
  suggestion: string;
}

export interface IplLeakage {
  /** The `.ipl` file that leaked into the deliverable. */
  file: string;
  /** Why it is wrong. */
  reason: string;
  /** How to realign. */
  suggestion: string;
}

export interface PatchLeakage {
  /** The file containing a SEARCH/REPLACE marker. */
  file: string;
  /** Why it is wrong. */
  reason: string;
  /** How to realign. */
  suggestion: string;
}

export interface TruncatedFile {
  /** The file that was cut short. */
  file: string;
  /** Why it is wrong. */
  reason: string;
  /** How to realign. */
  suggestion: string;
}

export interface EsmScriptMismatch {
  /** The HTML file whose <script> tag is missing type="module". */
  file: string;
  /** Why it is wrong. */
  reason: string;
  /** How to realign. */
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

const WEB_ASSET_RE = /\.html?$/i;
const DOM_USE_RE = /document\.|window\.|getElementById|querySelector(All)?\s*\(|addEventListener\s*\(/;
const CODE_EXT_RE = /\.(jsx?|tsx?|py|rs|go|cpp|c|h|sh|mjs|cjs)$/i;
/** Signals a native desktop window / game loop (C++, Python, Rust, JS/Electron...). */
const GUI_TOOLKIT_RE = /CreateWindow|WinMain|SDL_Init|SDL_CreateWindow|SDL_Renderer|GLFW|OpenGL|glut|SFML|\bsf::|wxWidgets|wxWindow|tkinter|\bTk\(|pygame|PyQt|QtWidgets|egui|eframe|winit|iced|slint|appkit|NSApplication|electron|from ['"]electron['"]/i;
/** `.ipl` files are the SPEC (input), never part of the delivered application. */
const IPL_FILE_RE = /\.ipl$/i;
/** `.html` files that do not end with `</html>` were cut short (local-model failure mode). */
const HTML_CLOSE_RE = /<\/html>\s*$/i;
/** SEARCH/REPLACE diff markers leaking into generated code (a syntax error in most languages). */
const PATCH_ARTIFACT_RE = /^[ \t]*={7,}[ \t]*$|<<<<<<<\s*SEARCH|>>>>>>>\s*REPLACE/m;
/** Signals a backend service that listens for requests (framework or explicit server start). */
const SERVER_FRAMEWORK_RE = /FastAPI|uvicorn|Flask|Django|Express|Fastify|Koa|Hono|Starlette|Tornado|axum|actix|spring|listen\s*\(|app\.run\s*\(|uvicorn\.run|http\.Server|new\s+Server/i;

/**
 * Form-factor gate (P4) — deterministic (0 tokens). The model drifts toward
 * browser apps for CLI specs (`index.html`, `public/`, DOM calls), and the
 * same-model reviewer ratifies it. This gate READS the artifact and flags when
 * the produced tree contradicts the user-chosen execution form:
 *  - `cli`: any HTML asset or DOM/`window` usage is a mismatch.
 *  - `web`: absence of any HTML entry is a mismatch.
 *  - `gui`: browser assets or DOM usage are mismatches; so is a tree with no
 *    native GUI-toolkit signal (the model fell back to CLI or nothing).
 *  - `server`: browser assets or DOM usage are mismatches; so is a tree with
 *    no server-framework signal (the model fell back to a CLI script).
 *  - `library`: no check (module shape can't be asserted structurally here).
 *  - `undefined`: no check (historical behavior preserved).
 */
export function findFormMismatches(files: ProjectArtifactFile[], formFactor?: 'cli' | 'web' | 'gui' | 'server' | 'library'): FormMismatch[] {
  if (!formFactor || formFactor === 'library') return [];
  const issues: FormMismatch[] = [];

  if (formFactor === 'cli') {
    for (const f of files) {
      const p = f.relativePath.replace(/\\/g, '/');
      if (WEB_ASSET_RE.test(p)) {
        issues.push({
          file: f.relativePath,
          reason: 'web asset present for a CLI target',
          suggestion: `"${f.relativePath}" is a browser asset (HTML/static) but the target is an autonomous CLI — remove it and rebuild as a headless console script`
        });
      }
    }
    if (issues.length === 0) {
      for (const f of files) {
        if (!CODE_EXT_RE.test(f.relativePath)) continue;
        if (DOM_USE_RE.test(f.content)) {
          issues.push({
            file: f.relativePath,
            reason: 'DOM/browser usage in a CLI target',
            suggestion: `"${f.relativePath}" touches the browser DOM (document/window/getElementById/querySelector) but the target is an autonomous CLI — remove DOM code so it runs headless`
          });
          break;
        }
      }
    }
  } else if (formFactor === 'web') {
    const hasHtml = files.some(f => WEB_ASSET_RE.test(f.relativePath.replace(/\\/g, '/')));
    if (!hasHtml) {
      issues.push({
        file: '(project)',
        reason: 'no HTML entry for a web target',
        suggestion: 'the target is a web app but no index.html / .html / public/ asset was generated — provide an HTML entry point'
      });
    }
  } else if (formFactor === 'gui') {
    for (const f of files) {
      const p = f.relativePath.replace(/\\/g, '/');
      if (WEB_ASSET_RE.test(p)) {
        issues.push({
          file: f.relativePath,
          reason: 'web asset present for a GUI target',
          suggestion: `"${f.relativePath}" is a browser asset (HTML/static) but the target is a native windowed app — remove it and use a desktop GUI toolkit instead`
        });
      } else if (CODE_EXT_RE.test(p) && DOM_USE_RE.test(f.content)) {
        issues.push({
          file: f.relativePath,
          reason: 'DOM/browser usage in a GUI target',
          suggestion: `"${f.relativePath}" touches the browser DOM but the target is a native windowed app — use a desktop GUI toolkit instead`
        });
      }
    }
    if (issues.length === 0) {
      const hasGui = files.some(f => CODE_EXT_RE.test(f.relativePath) && GUI_TOOLKIT_RE.test(f.content));
      if (!hasGui) {
        issues.push({
          file: '(project)',
          reason: 'no native GUI toolkit detected',
          suggestion: 'the target is a native windowed app (C++/SDL, Python/tkinter-pygame, Rust/egui, JS/Electron...) but no GUI toolkit (CreateWindow/SDL/tkinter/pygame/egui/Electron...) is used — the model likely fell back to a CLI or plain script'
        });
      }
    }
  } else if (formFactor === 'server') {
    for (const f of files) {
      const p = f.relativePath.replace(/\\/g, '/');
      if (WEB_ASSET_RE.test(p)) {
        issues.push({
          file: f.relativePath,
          reason: 'web asset present for a server target',
          suggestion: `"${f.relativePath}" is a browser asset (HTML/static) but the target is a headless backend service — remove it and serve the API only`
        });
      } else if (CODE_EXT_RE.test(p) && DOM_USE_RE.test(f.content)) {
        issues.push({
          file: f.relativePath,
          reason: 'DOM/browser usage in a server target',
          suggestion: `"${f.relativePath}" touches the browser DOM but the target is a headless backend service — remove DOM code`
        });
      }
    }
    if (issues.length === 0) {
      const hasServer = files.some(f => CODE_EXT_RE.test(f.relativePath) && SERVER_FRAMEWORK_RE.test(f.content));
      if (!hasServer) {
        issues.push({
          file: '(project)',
          reason: 'no server framework detected',
          suggestion: 'the target is a backend service but no server framework (FastAPI/Flask/Express/gin/axum...) and no listen()/app.run() was found — the model likely fell back to a CLI script that exits'
        });
      }
    }
  }

  return issues;
}

/**
 * IPL-leakage gate — deterministic (0 tokens). The spec (`*.ipl`) is the INPUT;
 * the deliverable must contain only target-language application files. The
 * model sometimes re-emits the spec (or pseudo-code variants like `app.ipl`,
 * `engine.ipl`) inside the artifact — flag them so the consolidation auto-fix
 * removes them before delivery.
 */
export function findIplLeakage(files: ProjectArtifactFile[]): IplLeakage[] {
  const issues: IplLeakage[] = [];
  for (const f of files) {
    if (IPL_FILE_RE.test(f.relativePath)) {
      issues.push({
        file: f.relativePath,
        reason: 'IPL spec file emitted as an output artifact',
        suggestion: `"${f.relativePath}" is an IPL spec file — the spec is the input, never part of the delivered application. Remove it; deliver only target-language files.`
      });
    }
  }
  return issues;
}

/**
 * Patch-artifact gate — deterministic (0 tokens). The model sometimes leaks
 * SEARCH/REPLACE diff markers (`<<<<<<< SEARCH`, `=======`, `>>>>>>> REPLACE`)
 * into the generated code, which is a syntax error in most languages (the
 * coffee run shipped a stray `=======` that crashed the whole script). Flag
 * every file carrying such a marker so the auto-fix strips it.
 */
export function findPatchLeakage(files: ProjectArtifactFile[]): PatchLeakage[] {
  const issues: PatchLeakage[] = [];
  for (const f of files) {
    if (PATCH_ARTIFACT_RE.test(f.content)) {
      issues.push({
        file: f.relativePath,
        reason: 'SEARCH/REPLACE patch artifact leaked into generated code',
        suggestion: `"${f.relativePath}" contains a <<<<<<< SEARCH / ======= / >>>>>>> REPLACE separator — a broken merge/patch marker that is a syntax error. Remove those marker lines.`
      });
    }
  }
  return issues;
}

/**
 * Truncation gate — deterministic (0 tokens). A complete HTML document ends
 * with `</html>`; local models sometimes cut their output mid-file (the bonsai
 * run shipped an `index.html` ending mid-`<span>`, no `</html>`, no script tag
 * → the whole app was inert). Any `.html` that does not end with `</html>` is
 * flagged so the auto-fix regenerates the complete file before delivery.
 */
export function findTruncatedFiles(files: ProjectArtifactFile[]): TruncatedFile[] {
  const issues: TruncatedFile[] = [];
  for (const f of files) {
    if (!/\.html?$/i.test(f.relativePath)) continue;
    if (!HTML_CLOSE_RE.test(f.content)) {
      issues.push({
        file: f.relativePath,
        reason: 'HTML file is truncated (does not end with </html>)',
        suggestion: `"${f.relativePath}" was cut short mid-file (missing </html> and likely </body> + closing tags/script). Regenerate the COMPLETE file — every element closed, </body></html> at the end.`
      });
    }
  }
  return issues;
}

/** A `.js` file that uses ESM syntax (import/export). */
const ESM_USE_RE = /\b(?:import|export)\s/;

/**
 * ES-module/script-tag gate — deterministic (0 tokens). When a generated `.js`
 * uses `import`/`export` (an ES module) but the HTML loads it as a classic
 * `<script src="...">` WITHOUT `type="module"`, the browser rejects the file at
 * runtime ("export declarations may only appear at top level of a module") —
 * and neither `node --check` (Node auto-detects ESM) nor a plain HTTP GET can
 * see it. Flag every such tag so the auto-fix adds `type="module"`.
 */
export function findEsmScriptMismatch(files: ProjectArtifactFile[]): EsmScriptMismatch[] {
  const esmNames = new Set<string>();
  for (const f of files) {
    if (/\.(js|mjs)$/i.test(f.relativePath) && ESM_USE_RE.test(f.content)) {
      esmNames.add(f.relativePath.split(/[\\/]/).pop()?.toLowerCase() ?? '');
    }
  }
  if (esmNames.size === 0) return [];

  const issues: EsmScriptMismatch[] = [];
  for (const f of files) {
    if (!/\.html?$/i.test(f.relativePath)) continue;
    const scriptRe = /<script\b([^>]*)src=["']([^"']+\.js)["']([^>]*)>/gi;
    let m: RegExpExecArray | null;
    while ((m = scriptRe.exec(f.content)) !== null) {
      const attrs = `${m[1]} ${m[3]}`;
      if (/\btype\s*=\s*["']module["']/i.test(attrs)) continue;
      const srcName = m[2].split(/[\\/]/).pop()?.toLowerCase() ?? '';
      if (esmNames.has(srcName)) {
        issues.push({
          file: f.relativePath,
          reason: `ES module "${m[2]}" loaded without type="module"`,
          suggestion: `"${f.relativePath}" loads "${m[2]}" (which uses import/export) as a classic script — the browser rejects it. Add type="module" to that <script> tag.`
        });
      }
    }
  }
  return issues;
}
