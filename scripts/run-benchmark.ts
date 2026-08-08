/**
 * IPL Studio — Automated LLM Benchmark Harness ("the moment of truth").
 *
 * Runs the real 2-Pass generator (Pass 1 topology + Pass 2 XML) against the
 * canonical specs, parses the artifact with the real parseMultiFileXml, writes
 * it to disk, and verifies it (run command / marker / ES-module scan / node
 * syntax check). Emits a Markdown report under output/benchmark/.
 *
 * Usage:
 *   node scripts/run-benchmark.ts                        # all specs, 1 iteration, external mode
 *   node scripts/run-benchmark.ts --mode mock            # offline pipeline smoke test (no LLM/network)
 *   node scripts/run-benchmark.ts --mode external --model deepseek-chat --iterations 2
 *   node scripts/run-benchmark.ts --spec hello           # single spec
 *   node scripts/run-benchmark.ts --mode lmstudio        # local LM Studio
 *   node scripts/run-benchmark.ts --mode local           # local Ollama
 *   node scripts/run-benchmark.ts --python <venvDir|exe> # resolve `python` via a venv Scripts dir or an exe path
 *
 * External mode reads the API key from VITE_DP_API_KEY (or DEEPSEEK_API_KEY /
 * OPENAI_API_KEY / VITE_OPENAI_API_KEY / VITE_GEMINI_API_KEY) or a local .env.
 *
 * Exit code: 0 if every run passed, 1 otherwise.
 */
import { readFileSync, mkdirSync, writeFileSync, readdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { resolve as pathResolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseMultiFileXml } from '../src/engine/artifactGenerator.ts';
import { callLLM, buildPass1Prompt, buildPass2Prompt, refineIPLArtifact, extractClarificationRequest, DEFAULT_LLM_CONFIG } from '../src/engine/llmGenerator.ts';
import type { LLMConfig, TargetLanguage } from '../src/engine/llmGenerator.ts';
import { applyDeterministicRepairs } from '../src/engine/deterministicRepair.ts';
import type { DeterministicRepair } from '../src/engine/deterministicRepair.ts';

// ---------------------------------------------------------------------------
// CLI options
// ---------------------------------------------------------------------------

interface CliArgs {
  mode: 'external' | 'lmstudio' | 'local' | 'mock';
  model?: string;
  endpoint?: string;
  iterations: number;
  spec?: string;
  timeoutPerPassMs: number;
  timeoutRunMs: number;
  quiet: boolean;
  pythonPath?: string;
  repairPasses: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { mode: 'external', iterations: 1, timeoutPerPassMs: 120_000, timeoutRunMs: 30_000, quiet: false, repairPasses: 3 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--mode') args.mode = next() as CliArgs['mode'];
    else if (a === '--model') args.model = next();
    else if (a === '--endpoint') args.endpoint = next();
    else if (a === '--iterations') args.iterations = Math.max(1, parseInt(next() || '1', 10));
    else if (a === '--spec') args.spec = next();
    else if (a === '--timeout-pass') args.timeoutPerPassMs = parseInt(next() || '120000', 10);
    else if (a === '--timeout-run') args.timeoutRunMs = parseInt(next() || '30000', 10);
    else if (a === '--python') args.pythonPath = next();
    else if (a === '--repair-passes') args.repairPasses = Math.max(0, parseInt(next() || '3', 10));
    else if (a === '--quiet') args.quiet = true;
    else if (a === '--help') {
      console.log(`IPL Studio Benchmark Harness

Usage: node scripts/run-benchmark.ts [options]

Options:
  --mode <external|lmstudio|local|mock>   LLM backend (default: external)
  --model <name>                          model id (default: deepseek-chat / per mode)
  --endpoint <url>                        override endpoint
  --iterations <n>                        runs per spec (default: 1)
  --spec <id>                             run a single spec
  --timeout-pass <ms>                     per-pass LLM timeout (default: 120000)
  --timeout-run <ms>                      command execution timeout (default: 30000)
  --python <venvDir|exe>                  resolve \`python\` via a venv Scripts dir or a direct exe path
  --repair-passes <n>                     self-healing repair passes after a FAIL (0 = off, default: 3)
  --quiet                                 suppress streaming logs
  --help                                  this help`);
      process.exit(0);
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// .env loader (never commit .env; it is gitignored)
// ---------------------------------------------------------------------------

function loadDotEnv(): void {
  try {
    const envPath = pathResolve(import.meta.dirname, '../.env');
    const content = readFileSync(envPath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const eq = line.indexOf('=');
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // No .env file — rely on real environment variables.
  }
}

// ---------------------------------------------------------------------------
// Benchmark specs
// ---------------------------------------------------------------------------

interface BenchSpec {
  id: string;
  name: string;
  targetLang: TargetLanguage;
  code: string;
  verify: {
    command?: string;
    marker?: string;
    markerCaseInsensitive?: boolean;
    forbid?: string[];
  };
}

const SPECS: BenchSpec[] = [
  {
    id: 'hello',
    name: 'Hello World (Console Card)',
    targetLang: 'html',
    code: `// IPL Project v1.0 - Hello World
add message {
  text: "Hello World IPL Studio v1.0",
  target: "console"
}

compute timestamp from system
send message to screen
return success`,
    verify: { marker: 'Hello World', forbid: ['<script type="module"', 'type="module"'] }
  },
  {
    id: 'typed-order',
    name: 'Typed E-Commerce Order Spec',
    targetLang: 'python',
    code: `add entity Order {
  id: id,
  customerName: text,
  totalAmount: number,
  isPaid: boolean,
  createdAt: date,
  status: options("pending", "processing", "shipped", "delivered")
}

listen event on "checkout:completed" {
  read orderData from event {
    where: totalAmount > 0
  }

  if (orderData.isPaid == true) {
    set orderData.status = "processing"
    send confirmationEmail to orderData.customerName {
      subject: "Order Confirmation",
      orderId: orderData.id
    }
  } else {
    set orderData.status = "pending"
  }
}`,
    verify: { command: 'python main.py' }
  },
  {
    id: 'weather',
    name: 'Weather Forecast Dashboard',
    targetLang: 'html',
    code: `// IPL Spec v1.0 - Real-Time Weather Forecast Dashboard
add view WeatherDashboard {
  title: "Live Weather Forecast Dashboard",
  theme: "dark"
}
add entity WeatherRequest {
  id: id,
  locationName: text,
  units: options("metric", "imperial")
}
add entity WeatherReport {
  city: text,
  temperature: number,
  isAlertActive: boolean
}
listen event on "weather:search" {
  try {
    read currentReport from weatherService { query: locationName }
    compute weatherIndex from currentReport {
      comfortScore: currentReport.temperature - (currentReport.humidity * 0.1)
    }
    if (currentReport.temperature > 35) {
      set currentReport.isAlertActive = true
      send alert to extremeAlertBanner { severity: "HIGH" }
    }
    send update to weatherSummaryCard { data: currentReport, index: weatherIndex }
    return { report: currentReport, status: "SUCCESS" }
  } catch (err) {
    send log to systemMonitor { level: "ERROR", message: err.message }
    return { status: "FAILED", reason: "unavailable" }
  }
}`,
    verify: { marker: 'Weather', markerCaseInsensitive: true, forbid: ['<script type="module"', 'type="module"'] }
  },
  {
    id: 'form',
    name: 'User Registration Form',
    targetLang: 'javascript',
    code: `// IPL Project v1.0 - User Registration Form
add form {
  title: "Member Registration",
  fields: ["email", "password"]
}

listen event on "form:submit" {
  read email from form
  if (email != "") {
    send welcome to email
    set status = "success"
  } else {
    set status = "error"
  }
}`,
    verify: { marker: 'Register', markerCaseInsensitive: true, forbid: ['<script type="module"', 'type="module"'] }
  },
  {
    id: 'node-hello',
    name: 'Node CLI Greeter',
    targetLang: 'javascript',
    code: `// IPL Project v1.0 - CLI Greeter
add message {
  text: "Hello World IPL Studio v1.0",
  target: "console"
}

compute timestamp from system
send message to screen
return success`,
    verify: { command: 'node index.js', marker: 'Hello World' }
  }
];

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

type RunStatus = 'PASS' | 'WARN' | 'FAIL';

interface PassTiming {
  ms: number;
  chars: number;
  approxTokens: number;
}

interface RunResult {
  specId: string;
  specName: string;
  iteration: number;
  status: RunStatus;
  statusDetail: string;
  pass1: PassTiming;
  pass2: PassTiming;
  totalMs: number;
  fileCount: number;
  totalBytes: number;
  files: string[];
  artifactXml: string;
  /** 0 = first-try PASS; 1..N = repair passes needed; -1 = failed even after repairs. */
  repairsToSuccess: number;
  /** Human-readable descriptions of each deterministic/LLM repair applied. */
  repairDetails: string[];
  /** Original first-try status before any repair attempt (for trend reporting). */
  firstTryStatus: RunStatus;
  /** Full stderr/stdout captured from the failing verify command. */
  failureOutput?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const log = (args: CliArgs, msg: string, kind: 'info' | 'success' | 'warn' | 'error' = 'info') => {
  if (args.quiet) return;
  const icon = kind === 'success' ? '✅' : kind === 'warn' ? '⚠️' : kind === 'error' ? '❌' : '→';
  console.log(`  ${icon} ${msg}`);
};

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolvePromise, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
    p.then(v => { clearTimeout(t); resolvePromise(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

function approxTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

/** Renders a canned artifact (mock mode) that should PASS the spec's checks. */
function buildMockArtifact(spec: BenchSpec): string {
  const marker = spec.verify.marker ?? 'IPL Studio';
  if (spec.verify.command?.startsWith('python')) {
    return [
      '<file path="main.py">',
      `print("${marker}")`,
      'print("IPL Studio 2-Pass generator: mock artifact")',
      '</file>'
    ].join('\n');
  }
  if (spec.verify.command?.startsWith('node')) {
    return [
      '<file path="index.js">',
      `console.log("${marker}");`,
      '</file>'
    ].join('\n');
  }
  return [
    '<file path="index.html">',
    '<!DOCTYPE html>',
    '<html><head><title>IPL Studio</title>',
    '<script src="https://cdn.tailwindcss.com"></script>',
    '</head><body>',
    `<div id="app">${marker}</div>`,
    '<script src="js/main.js"></script>',
    '</body></html>',
    '</file>',
    '<file path="js/main.js">',
    `document.getElementById("app").textContent = "${marker}";`,
    '</file>'
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

interface GenerationOutput {
  xml: string;
  pass1: PassTiming;
  pass2: PassTiming;
}

async function generateReal(spec: BenchSpec, config: LLMConfig, args: CliArgs): Promise<GenerationOutput> {
  const pass1Prompt = buildPass1Prompt(spec.code, spec.targetLang);

  const t1 = Date.now();
  const p1Text = await withTimeout(
    callLLM(pass1Prompt, config, () => {}, undefined, { temperature: 0.4 }),
    args.timeoutPerPassMs,
    'Pass 1'
  );
  const pass1: PassTiming = { ms: Date.now() - t1, chars: p1Text.length, approxTokens: approxTokens(p1Text.length) };

  const topology = extractTopologyJson(p1Text) ?? '';

  const t2 = Date.now();
  const xml = await withTimeout(
    callLLM(buildPass2Prompt(spec.code, spec.targetLang, topology), config, () => {}, undefined, { temperature: 0.15, seed: 42 }),
    args.timeoutPerPassMs,
    'Pass 2'
  );
  const pass2: PassTiming = { ms: Date.now() - t2, chars: xml.length, approxTokens: approxTokens(xml.length) };

  return { xml, pass1, pass2 };
}

/** Extracts a JSON object from Pass 1 output (resilient to code fences / noise). */
function extractTopologyJson(text: string): string | null {
  const jsonBlock = text.match(/```json\s*([\s\S]*?)```/);
  const candidate = jsonBlock ? jsonBlock[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    JSON.parse(candidate.slice(start, end + 1));
    return candidate.slice(start, end + 1);
  } catch {
    return null;
  }
}

async function generateMock(spec: BenchSpec): Promise<GenerationOutput> {
  return {
    xml: buildMockArtifact(spec),
    pass1: { ms: 0, chars: 0, approxTokens: 0 },
    pass2: { ms: 0, chars: 0, approxTokens: 0 }
  };
}

// ---------------------------------------------------------------------------
// Disk write + verification
// ---------------------------------------------------------------------------

function writeArtifact(runDir: string, xml: string): { files: string[]; totalBytes: number } {
  const parsed = parseMultiFileXml(xml);
  const files: string[] = [];
  let totalBytes = 0;
  for (const f of parsed) {
    if (!f.relativePath || /^[a-zA-Z]:[\\/]/.test(f.relativePath) || f.relativePath.includes('..')) continue;
    const target = pathResolve(runDir, f.relativePath);
    if (!target.startsWith(pathResolve(runDir))) continue;
    mkdirSync(pathResolve(target, '..'), { recursive: true });
    writeFileSync(target, f.content, 'utf8');
    files.push(f.relativePath);
    totalBytes += Buffer.byteLength(f.content, 'utf8');
  }
  return { files, totalBytes };
}

function runCommand(cwd: string, command: string, timeoutMs: number, pythonPath?: string): { exitCode: number | null; output: string; timedOut: boolean } {
  const resolved = resolvePythonCommand(command, pythonPath);
  const res = spawnSync(resolved, { cwd, shell: true, timeout: timeoutMs, encoding: 'utf8', windowsHide: true });
  return {
    exitCode: res.status,
    output: `${res.stdout || ''}\n${res.stderr || ''}`.trim(),
    timedOut: !!res.error && (res.error as NodeJS.ErrnoException).code === 'ETIMEDOUT'
  };
}

/**
 * Resolves a `python`/`python3` prefix in a shell command to a concrete
 * interpreter: a venv `Scripts` dir is prepended to PATH (or the venv's
 * `bin` on POSIX), otherwise a direct exe path replaces the command.
 */
function resolvePythonCommand(command: string, pythonPath?: string): string {
  if (!pythonPath) return command;
  if (!/^python(3|3\.\d+)?\b/.test(command)) return command;
  try {
    const isDir = existsSync(pythonPath) && statSync(pythonPath).isDirectory();
    if (isDir) {
      const pythons = ['python.exe', 'python3.exe', 'python', 'python3']
        .map(name => pathResolve(pythonPath, name))
        .find(p => existsSync(p));
      if (pythons) {
        const dirs = pathResolve(pythons, '..');
        process.env.PATH = `${dirs}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`;
      }
      return command;
    }
  } catch {
    // fall through to direct exe handling
  }
  return command.replace(/^python(3|3\.\d+)?/, `"${pathResolve(pythonPath)}"`);
}

async function verify(spec: BenchSpec, runDir: string, args: CliArgs): Promise<{ status: RunStatus; detail: string; output?: string }> {
  const allFiles = readdirSync(runDir, { recursive: true }) as string[];
  const allContent = allFiles
    .filter(f => !f.endsWith('.txt'))
    .map(f => {
      try { return readFileSync(pathResolve(runDir, f), 'utf8'); } catch { return ''; }
    })
    .join('\n');

  if (spec.verify.marker) {
    const needle = spec.verify.marker;
    const found = spec.verify.markerCaseInsensitive
      ? allContent.toLowerCase().includes(needle.toLowerCase())
      : allContent.includes(needle);
    if (!found) return { status: 'FAIL', detail: `marker "${needle}" not found in generated files` };
  }

  for (const forbidden of spec.verify.forbid ?? []) {
    if (allContent.includes(forbidden)) {
      return { status: 'FAIL', detail: `forbidden pattern "${forbidden}" present (browser/ES-module hazard)` };
    }
  }

  if (spec.verify.command) {
    const jsFiles = allFiles.filter(f => f.endsWith('.js'));
    for (const f of jsFiles) {
      const check = spawnSync('node', ['--check', pathResolve(runDir, f)], { encoding: 'utf8', windowsHide: true });
      if (check.status !== 0) {
        return { status: 'FAIL', detail: `node --check failed on ${f}: ${(check.stderr || '').trim().slice(0, 200)}` };
      }
    }

    const run = runCommand(runDir, spec.verify.command, args.timeoutRunMs, args.pythonPath);
    if (run.timedOut) return { status: 'WARN', detail: `command timed out after ${args.timeoutRunMs} ms (long-running server?)` };
    if (run.exitCode === null) return { status: 'WARN', detail: 'toolchain not available (command could not be spawned)' };
    if (run.exitCode === 127 || run.exitCode === 9009) {
      return { status: 'WARN', detail: `toolchain not available (${spec.verify.command} not found on this machine)` };
    }
    if (run.exitCode !== 0) {
      if (/is not recognized as an internal|n'est pas reconnu|command not found|not recognized|ENOENT/i.test(run.output)) {
        return { status: 'WARN', detail: `toolchain not available (${spec.verify.command} not found on this machine)` };
      }
      if (/cannot find module/i.test(run.output)) {
        return { status: 'WARN', detail: `entry missing (${spec.verify.command}) — generated app may be browser-based` };
      }
      // The entry file may live in a subdirectory (e.g. src/main.py). Retry with
      // the discovered path before failing.
      const retried = retryWithDiscoveredEntry(spec.verify.command, allFiles);
      if (retried) {
        const retry = runCommand(runDir, retried.command, args.timeoutRunMs, args.pythonPath);
        if (retry.exitCode === 0) return { status: 'PASS', detail: `verified OK (entry discovered as ${retried.entry})` };
        return { status: 'FAIL', detail: `${spec.verify.command} failed (${run.output.slice(0, 120)}) — retried ${retried.command}: ${retry.output.slice(0, 160) || `exit ${retry.exitCode}`}`, output: `${run.output}\n--- retried ---\n${retry.output}` };
      }
      return { status: 'FAIL', detail: `exit code ${run.exitCode}: ${run.output.slice(0, 200)}`, output: run.output };
    }
  }

  return { status: 'PASS', detail: 'verified OK' };
}

/**
 * If a run command references an entry file that is missing at the run root but
 * exists deeper in the tree (e.g. `python main.py` vs `src/main.py`), rewrite
 * the command to use the discovered path. As a last resort, try the shallowest
 * conventional entry file (main/app/index) so a structurally different but
 * runnable app is measured as runnable rather than misnamed.
 */
function retryWithDiscoveredEntry(command: string, allFiles: string[]): { command: string; entry: string } | null {
  const m = /^((?:python(?:3|3\.\d+)?|node)\s+)([\w./-]+\.\w+)(.*)$/.exec(command);
  if (!m) return null;
  const ext = m[2].endsWith('.py') ? '.py' : '.js';
  const depth = (f: string) => f.split(/[\\/]/).length;

  const exact = allFiles.filter(f => f.split(/[\\/]/).pop() === m[2].split(/[\\/]/).pop());
  const candidates = (exact.length > 0
    ? exact
    : allFiles
        .filter(f => f.endsWith(ext) && !/(^|[\\/])tests?([\\/]|$)/i.test(f))
        .filter(f => /(^|[\\/])(main|app|index)(\.\w+)?$/.test(f.replace(/\\/g, '/')))
  ).sort((a, b) => depth(a) - depth(b));
  if (candidates.length === 0) return null;
  const entry = candidates[0].replace(/\\/g, '/');
  return { command: `${m[1]}${entry}${m[3]}`, entry };
}

// ---------------------------------------------------------------------------
// Self-healing repair loop
// ---------------------------------------------------------------------------

function readRunFiles(runDir: string): DeterministicRepair[] {
  const all = readdirSync(runDir, { recursive: true }) as string[];
  return all
    .filter(f => !f.endsWith('.txt'))
    .map(f => {
      try {
        return { relativePath: f, content: readFileSync(pathResolve(runDir, f), 'utf8') };
      } catch {
        return null;
      }
    })
    .filter((f): f is DeterministicRepair => f !== null);
}

/**
 * Attempts up to `repairPasses` self-healing passes on a failing run:
 *  1. LLM-independent deterministic fixes (ES-module strip, Tailwind CDN) —
 *     no tokens spent if this resolves it.
 *  2. LLM repair via refineIPLArtifact fed with the captured failure output.
 * Returns the final verify result plus repair bookkeeping.
 */
async function repairAndVerify(
  spec: BenchSpec,
  runDir: string,
  args: CliArgs,
  config: LLMConfig,
  firstTry: { status: RunStatus; detail: string; output?: string }
): Promise<{ v: { status: RunStatus; detail: string; output?: string }; repairsToSuccess: number; repairDetails: string[]; firstTryStatus: RunStatus }> {
  const repairDetails: string[] = [];
  let v = firstTry;

  for (let pass = 1; pass <= args.repairPasses; pass++) {
    // Pass 1 deterministic: rewrite files in place from disk.
    const files = readRunFiles(runDir);
    const det = applyDeterministicRepairs(files);
    if (det.applied.length > 0) {
      for (const f of det.files) {
        writeFileSync(pathResolve(runDir, f.relativePath), f.content, 'utf8');
      }
      repairDetails.push(...det.applied.map(a => `pass ${pass} [deterministic]: ${a}`));
      v = await verify(spec, runDir, args);
      if (v.status === 'PASS') return { v, repairsToSuccess: pass, repairDetails, firstTryStatus: firstTry.status };
    }

    // LLM repair pass.
    if (args.mode !== 'mock') {
      const existingXml = readRunFiles(runDir)
        .map(f => `<file path="${f.relativePath}">\n${f.content}\n</file>`)
        .join('\n\n');
      const prompt = `THE CODE FAILED TO EXECUTE. ANALYZE AND FIX THE FILES SO THE SCRIPT RUNS WITHOUT ERROR:\n\nConsole Log Output:\n${(v.output ?? v.detail).slice(0, 2000)}`;
      try {
        const fixed = await withTimeout(
          refineIPLArtifact(existingXml, prompt, spec.targetLang, config, () => {}, () => {}),
          args.timeoutPerPassMs,
          `repair pass ${pass}`
        );

        // The model cannot fix confidently without a precision. In the harness
        // there is no user to answer — record it honestly instead of guessing.
        const clarification = extractClarificationRequest(fixed);
        if (clarification) {
          repairDetails.push(`pass ${pass} [llm]: NEED_CLARIFICATION — ${clarification}`);
          return {
            v: { status: 'WARN', detail: `clarification requested by model: ${clarification}` },
            repairsToSuccess: -1,
            repairDetails,
            firstTryStatus: firstTry.status
          };
        }

        const existingFiles = parseMultiFileXml(existingXml);
        const updated = parseMultiFileXml(fixed, existingFiles);
        if (updated.length > 0) {
          for (const f of updated) {
            mkdirSync(pathResolve(runDir, pathResolve(f.relativePath, '..')), { recursive: true });
            writeFileSync(pathResolve(runDir, f.relativePath), f.content, 'utf8');
          }
          repairDetails.push(`pass ${pass} [llm]: refineIPLArtifact applied (${updated.length} files)`);
          v = await verify(spec, runDir, args);
          if (v.status === 'PASS') return { v, repairsToSuccess: pass, repairDetails, firstTryStatus: firstTry.status };
        }
      } catch (err: any) {
        repairDetails.push(`pass ${pass} [llm]: failed (${err.message})`);
      }
    }
  }

  return { v, repairsToSuccess: -1, repairDetails, firstTryStatus: firstTry.status };
}

// ---------------------------------------------------------------------------
// History + trend
// ---------------------------------------------------------------------------

interface HistoryEntry {
  runId: string;
  date: string;
  mode: string;
  model: string;
  endpoint: string;
  specs: Array<{
    id: string;
    firstTryStatus: RunStatus;
    finalStatus: RunStatus;
    repairsToSuccess: number;
    totalMs: number;
  }>;
}

function loadHistory(historyPath: string): HistoryEntry[] {
  try {
    const raw = readFileSync(historyPath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Returns a per-spec trend line comparing this run's first-try PASS rate to the last N runs. */
function buildTrendSection(historyPath: string, runId: string, results: RunResult[], model: string): string[] {
  const history = loadHistory(historyPath).filter(h => h.model === model && h.runId !== runId);
  const lines: string[] = ['## Trend', ''];
  if (history.length === 0) {
    lines.push('_No prior runs recorded for this model — first history entry._');
    return lines;
  }

  const lastRuns = history.slice(-10);
  const bySpec = new Map<string, RunResult[]>();
  for (const r of results) {
    const arr = bySpec.get(r.specId) ?? [];
    arr.push(r);
    bySpec.set(r.specId, arr);
  }

  lines.push('| Spec | Prev runs | Prev first-try PASS% | This run | Δ |');
  lines.push('| :--- | :---: | :---: | :---: | :---: |');
  for (const [id, runs] of bySpec) {
    const prevSpecs = lastRuns.flatMap(h => h.specs).filter(s => s.id === id);
    if (prevSpecs.length === 0) continue;
    const prevPass = prevSpecs.filter(s => s.firstTryStatus === 'PASS').length;
    const prevPct = Math.round((prevPass / prevSpecs.length) * 100);
    const curPass = runs.filter(r => r.firstTryStatus === 'PASS').length;
    const curPct = Math.round((curPass / runs.length) * 100);
    const delta = curPct - prevPct;
    const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '—';
    lines.push(`| ${id} | ${prevSpecs.length} | ${prevPct}% | ${curPct}% | ${arrow}${Math.abs(delta)} |`);
  }
  lines.push('');
  return lines;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function buildReport(args: CliArgs, config: LLMConfig, results: RunResult[]): string {
  const lines: string[] = [];
  lines.push('# 📊 IPL Studio — Automated Benchmark Report');
  lines.push('');
  lines.push(`- **Date**: ${new Date().toISOString()}`);
  lines.push(`- **Engine**: 2-Pass LLM Generator (Pass 1 topology + Pass 2 XML)`);
  lines.push(`- **Mode**: ${args.mode}${args.mode === 'mock' ? ' (offline pipeline smoke test)' : ''}`);
  if (args.mode !== 'mock') lines.push(`- **Model**: ${config.model} · **Endpoint**: ${config.externalEndpoint || config.lmStudioEndpoint || config.localEndpoint}`);
  lines.push(`- **Iterations per spec**: ${args.iterations}`);
  lines.push('');

  const bySpec = new Map<string, RunResult[]>();
  for (const r of results) {
    const arr = bySpec.get(r.specId) ?? [];
    arr.push(r);
    bySpec.set(r.specId, arr);
  }

  lines.push('## Summary');
  lines.push('');
  lines.push('| Spec | Runs | PASS | WARN | FAIL | Avg total (ms) | Avg files | Avg size (KB) | Repairs |');
  lines.push('| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |');
  let totalPass = 0;
  let totalRuns = 0;
  let totalFirstTryFail = 0;
  let totalRepairedToPass = 0;
  for (const [id, runs] of bySpec) {
    const pass = runs.filter(r => r.status === 'PASS').length;
    const warn = runs.filter(r => r.status === 'WARN').length;
    const fail = runs.filter(r => r.status === 'FAIL').length;
    totalPass += pass;
    totalRuns += runs.length;
    const avgMs = Math.round(runs.reduce((s, r) => s + r.totalMs, 0) / runs.length);
    const avgFiles = Math.round(runs.reduce((s, r) => s + r.fileCount, 0) / runs.length);
    const avgKB = Math.round((runs.reduce((s, r) => s + r.totalBytes, 0) / runs.length) / 1024);
    const repairLabel = runs.map(r => r.repairsToSuccess).join('/');
    lines.push(`| ${id} | ${runs.length} | ${pass} | ${warn} | ${fail} | ${avgMs} | ${avgFiles} | ${avgKB} | ${repairLabel} |`);
    for (const r of runs) {
      if (r.firstTryStatus === 'FAIL') {
        totalFirstTryFail++;
        if (r.status === 'PASS') totalRepairedToPass++;
      }
    }
  }
  lines.push('');
  lines.push(`**Overall first-try PASS rate**: ${totalRuns ? `${Math.round((totalPass / totalRuns) * 100)}% (${totalPass}/${totalRuns})` : 'n/a'}`);
  if (totalFirstTryFail > 0) {
    lines.push(`**Success-after-repair rate**: ${Math.round((totalRepairedToPass / totalFirstTryFail) * 100)}% (${totalRepairedToPass}/${totalFirstTryFail} failed first-try runs recovered by repair)`);
  }
  lines.push('_Repairs column: `0` = first-try PASS, `1..N` = repair passes needed, `-1` = failed even after repair. Values are per run/iteration._');
  lines.push('');

  lines.push('## Detailed Runs');
  lines.push('');
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'WARN' ? '⚠️' : '❌';
    lines.push(`### ${r.specName} — run ${r.iteration} ${icon} **${r.status}** (${r.totalMs} ms, ${r.fileCount} files, ${(r.totalBytes / 1024).toFixed(1)} KB)`);
    lines.push('');
    lines.push(`- **Detail**: ${r.statusDetail}`);
    lines.push(`- **First try**: ${r.firstTryStatus} · **Repairs to success**: ${r.repairsToSuccess}`);
    if (r.repairDetails.length > 0) {
      lines.push(`- **Repairs applied**:`);
      for (const d of r.repairDetails) lines.push(`  - ${d}`);
    }
    if (args.mode !== 'mock') {
      lines.push(`- **Pass 1**: ${r.pass1.ms} ms · ≈ ${r.pass1.approxTokens} tokens`);
      lines.push(`- **Pass 2**: ${r.pass2.ms} ms · ≈ ${r.pass2.approxTokens} tokens`);
    }
    lines.push(`- **Files**: ${r.files.join(', ') || '(none)'}`);
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<number> {
  loadDotEnv();
  const args = parseArgs(process.argv.slice(2));

  const specs = args.spec ? SPECS.filter(s => s.id === args.spec) : SPECS;
  if (specs.length === 0) {
    console.error(`Unknown spec "${args.spec}". Available: ${SPECS.map(s => s.id).join(', ')}`);
    return 2;
  }

  let config: LLMConfig = { ...DEFAULT_LLM_CONFIG, mode: args.mode as LLMConfig['mode'] };
  if (args.mode === 'external') {
    const apiKey =
      process.env.VITE_DP_API_KEY ||
      process.env.DEEPSEEK_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.VITE_OPENAI_API_KEY ||
      process.env.VITE_GEMINI_API_KEY ||
      '';
    if (!apiKey) {
      console.error('No API key found. Set VITE_DP_API_KEY (or DEEPSEEK_API_KEY / OPENAI_API_KEY) or define it in .env.');
      return 2;
    }
    config.customApiKey = apiKey;
  }
  if (args.model) config.model = args.model;
  if (args.endpoint) {
    if (args.mode === 'external') config.externalEndpoint = args.endpoint;
    else if (args.mode === 'lmstudio') config.lmStudioEndpoint = args.endpoint;
    else config.localEndpoint = args.endpoint;
  }

  const root = pathResolve(import.meta.dirname, '../output/benchmark');
  const runId = new Date().toISOString().replace(/[:.]/g, '-');

  console.log(`IPL Studio Benchmark — mode=${args.mode} iterations=${args.iterations}`);
  if (args.mode !== 'mock') console.log(`Model: ${config.model} · Endpoint: ${config.externalEndpoint || config.lmStudioEndpoint || config.localEndpoint}`);
  console.log('');

  const results: RunResult[] = [];

  for (const spec of specs) {
    console.log(`▶ ${spec.name} [${spec.id}] → ${spec.targetLang}`);
    for (let i = 1; i <= args.iterations; i++) {
      log(args, `run ${i}/${args.iterations}`, 'info');
      const runDir = pathResolve(root, spec.id, `run-${runId}-${i}`);
      rmSync(runDir, { recursive: true, force: true });
      mkdirSync(runDir, { recursive: true });

      const start = Date.now();
      let gen: GenerationOutput;
      let genError = '';
      try {
        gen = args.mode === 'mock' ? await generateMock(spec) : await generateReal(spec, config, args);
      } catch (err: any) {
        genError = err.message;
        const result: RunResult = {
          specId: spec.id, specName: spec.name, iteration: i, status: 'FAIL', statusDetail: `generation error: ${genError}`,
          pass1: { ms: 0, chars: 0, approxTokens: 0 }, pass2: { ms: 0, chars: 0, approxTokens: 0 },
          totalMs: Date.now() - start, fileCount: 0, totalBytes: 0, files: [], artifactXml: '',
          repairsToSuccess: -1, repairDetails: [], firstTryStatus: 'FAIL'
        };
        results.push(result);
        log(args, result.statusDetail, 'error');
        continue;
      }

      const written = writeArtifact(runDir, gen.xml);
      const firstTry = await verify(spec, runDir, args);

      // Self-healing: try to repair failing runs (deterministic + LLM) up to --repair-passes.
      let v = firstTry;
      let repairsToSuccess = 0;
      let repairDetails: string[] = [];
      if (firstTry.status === 'FAIL' && args.repairPasses > 0 && args.mode !== 'mock') {
        const repaired = await repairAndVerify(spec, runDir, args, config, firstTry);
        v = repaired.v;
        repairsToSuccess = repaired.repairsToSuccess;
        repairDetails = repaired.repairDetails;
      } else if (firstTry.status === 'FAIL') {
        repairsToSuccess = -1;
      }

      const result: RunResult = {
        specId: spec.id, specName: spec.name, iteration: i, status: v.status, statusDetail: v.detail,
        pass1: gen.pass1, pass2: gen.pass2,
        totalMs: Date.now() - start,
        fileCount: written.files.length, totalBytes: written.totalBytes, files: written.files,
        artifactXml: gen.xml,
        repairsToSuccess, repairDetails, firstTryStatus: firstTry.status,
        failureOutput: v.output
      };
      results.push(result);
      const repairNote = repairDetails.length > 0 ? ` · repaired (${repairsToSuccess} pass${repairsToSuccess === 1 ? '' : 'es'})` : '';
      log(args, `${v.status} — ${v.detail}${repairNote} (${result.totalMs} ms, ${written.files.length} files)`, v.status === 'PASS' ? 'success' : v.status === 'WARN' ? 'warn' : 'error');
    }
    console.log('');
  }

  // Persist run history for trend/regression reporting.
  const historyPath = pathResolve(root, 'history.json');
  const history: HistoryEntry[] = loadHistory(historyPath);
  history.push({
    runId,
    date: new Date().toISOString(),
    mode: args.mode,
    model: config.model,
    endpoint: config.externalEndpoint || config.lmStudioEndpoint || config.localEndpoint || '',
    specs: results.map(r => ({
      id: r.specId,
      firstTryStatus: r.firstTryStatus,
      finalStatus: r.status,
      repairsToSuccess: r.repairsToSuccess,
      totalMs: r.totalMs
    }))
  });
  // Keep only the last 50 runs.
  if (history.length > 50) history.splice(0, history.length - 50);
  writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf8');

  let report = buildReport(args, config, results);
  report += '\n' + buildTrendSection(historyPath, runId, results, config.model).join('\n') + '\n';
  const reportPath = pathResolve(root, `report-${runId}.md`);
  mkdirSync(root, { recursive: true });
  writeFileSync(reportPath, report, 'utf8');
  console.log(`Report written to ${reportPath}`);
  console.log(`History: ${history.length} run(s) in ${historyPath}`);
  console.log('');

  const failed = results.some(r => r.status === 'FAIL');
  return failed ? 1 : 0;
}

main().then(code => process.exit(code));
