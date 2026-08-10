import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseMultiFileXml } from './artifactGenerator';

/**
 * Golden execution tests — the "does the generated app actually run?" proof.
 *
 * For every fixture in golden/<id>/:
 *  1. artifact.xml is parsed with the REAL parseMultiFileXml (regression proof
 *     of the parser itself),
 *  2. the resulting files are written to a temp dir,
 *  3. the configured command is executed,
 *  4. exit code + stdout are asserted against golden.json.
 *
 * The artifacts are frozen outputs (no LLM involved) so the suite is
 * deterministic. Fixtures requiring a missing runtime (e.g. python) are
 * skipped with a warning instead of failing.
 */

const GOLDEN_ROOT = path.resolve(process.cwd(), 'golden');

interface GoldenAssert {
  exitCode?: number;
  stdoutContains?: string[];
}

interface GoldenSpec {
  id: string;
  name: string;
  targetLang: string;
  command: string;
  assert: GoldenAssert;
}

interface RuntimeInfo {
  node: boolean;
  python: string | null;
}

function probeRuntime(): RuntimeInfo {
  const node = spawnSync('node', ['--version'], { encoding: 'utf8', windowsHide: true }).status === 0;
  let python: string | null = null;
  const candidates = [process.env.IPL_GOLDEN_PYTHON, 'python', 'python3', 'py'].filter(Boolean) as string[];
  for (const c of candidates) {
    const r = spawnSync(c, ['--version'], { encoding: 'utf8', windowsHide: true });
    if (r.status === 0) { python = c; break; }
  }
  return { node, python };
}

function loadGoldens(): GoldenSpec[] {
  const ids = readdirSync(GOLDEN_ROOT, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort();
  return ids.map(id => {
    const raw = readFileSync(path.resolve(GOLDEN_ROOT, id, 'golden.json'), 'utf8');
    return { id, ...JSON.parse(raw) } as GoldenSpec;
  });
}

/** Rewrites `python ...` to the probed interpreter (e.g. `py` on Windows). */
function resolveCommand(command: string, runtime: RuntimeInfo): string {
  if (/^python(3(\.\d+)?)?\b/.test(command) && runtime.python) {
    return command.replace(/^python(3(\.\d+)?)?/, runtime.python);
  }
  return command;
}

function runGolden(g: GoldenSpec, runtime: RuntimeInfo): { exitCode: number | null; stdout: string; stderr: string } {
  const artifactXml = readFileSync(path.resolve(GOLDEN_ROOT, g.id, 'artifact.xml'), 'utf8');
  const files = parseMultiFileXml(artifactXml);
  expect(files.length).toBeGreaterThan(0);

  const runDir = mkdtempSync(path.join(tmpdir(), 'ipl-golden-'));
  try {
    for (const f of files) {
      const target = path.resolve(runDir, f.relativePath);
      if (!target.startsWith(path.resolve(runDir))) {
        throw new Error(`Golden "${g.id}": file path "${f.relativePath}" escapes the sandbox.`);
      }
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, f.content, 'utf8');
    }

    const res = spawnSync(resolveCommand(g.command, runtime), {
      cwd: runDir,
      shell: true,
      timeout: 15_000,
      encoding: 'utf8',
      windowsHide: true
    });

    return { exitCode: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
  } finally {
    rmSync(runDir, { recursive: true, force: true });
  }
}

const runtime = probeRuntime();
const goldens = loadGoldens();

describe('golden execution (frozen artifacts must actually run)', () => {
  expect(goldens.length).toBeGreaterThan(0);

  for (const g of goldens) {
    const needsPython = /^python/.test(g.command);
    const canRun = needsPython ? runtime.python !== null : runtime.node;

    it.runIf(canRun)(`${g.id}: ${g.name}`, () => {
      const { exitCode, stdout, stderr } = runGolden(g, runtime);
      const fullOutput = `${stdout}\n${stderr}`.trim();

      expect(fullOutput, `exit code was ${exitCode}`).not.toBe('');
      expect(exitCode, `expected exit ${g.assert.exitCode ?? 0}, got ${exitCode}. Output:\n${fullOutput}`).toBe(g.assert.exitCode ?? 0);

      for (const needle of g.assert.stdoutContains ?? []) {
        expect(fullOutput, `stdout did not contain "${needle}". Output:\n${fullOutput}`).toContain(needle);
      }
    });
  }
});
