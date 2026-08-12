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
import { readFileSync, mkdirSync, writeFileSync, readdirSync, rmSync, existsSync, statSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve as pathResolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseMultiFileXml } from '../src/engine/artifactGenerator.ts';
import type { ProjectArtifactFile } from '../src/engine/artifactGenerator.ts';
import { findMissingModuleRefs } from '../src/engine/staticChecker.ts';
import type { MissingModuleRef } from '../src/engine/staticChecker.ts';
import { buildReviewPrompt, parseReviewOutput } from '../src/engine/reviewAgent.ts';
import type { ReviewIssue } from '../src/engine/reviewAgent.ts';
import { consolidateArtifact, filesToXml } from '../src/engine/consolidationAgent.ts';
import { callLLM, buildPass1Prompt, buildPass2Prompt, refineIPLArtifact, extractClarificationRequest, createRunTokenUsage, DEFAULT_LLM_CONFIG } from '../src/engine/llmGenerator.ts';
import type { LLMConfig, TargetLanguage, RunTokenUsage, TokenBucket } from '../src/engine/llmGenerator.ts';
import { applyDeterministicRepairs } from '../src/engine/deterministicRepair.ts';
import type { DeterministicRepair } from '../src/engine/deterministicRepair.ts';
import { evaluateBehavior } from '../src/engine/behaviorAssert.ts';
import type { BehaviorAssert } from '../src/engine/behaviorAssert.ts';

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
  reviewPass: boolean;
  consolidate: boolean;
  /** Directory where generated runs are executed (isolated from the repo). Default: os.tmpdir()/ipl-benchmark. */
  sandboxDir?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { mode: 'external', iterations: 1, timeoutPerPassMs: 120_000, timeoutRunMs: 30_000, quiet: false, repairPasses: 3, reviewPass: false, consolidate: false };
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
    else if (a === '--review') args.reviewPass = true;
    else if (a === '--consolidate') args.consolidate = true;
    else if (a === '--sandbox') args.sandboxDir = next();
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
  --review                                run the LLM review pass (skeptical code reviewer) after generation
  --consolidate                           run the consolidation agent (delivery gate) before writing/verifying
  --sandbox <dir>                         execute generated runs in <dir> (default: os.tmpdir()/ipl-benchmark)
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
    assert?: BehaviorAssert;
  };
}

const SPECS: BenchSpec[] = [
  {
    id: 'hello',
    name: 'Hello World (Console Card)',
    targetLang: 'html',
    code: `// IPL Project v1.0 - Hello World
add message {
  text: "Hello World IPL Studio v1.3.0",
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
    verify: {
      command: 'python main.py',
      // Behavioral proof: the generated app must actually process the order
      // data from the spec (not just run) — same oracle as the typed-order golden.
      assert: { stdoutContains: ['A-1001', 'processing'] }
    }
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
  text: "Hello World IPL Studio v1.3.0",
  target: "console"
}

compute timestamp from system
send message to screen
return success`,
    verify: {
      command: 'node index.js',
      marker: 'Hello World',
      // Behavioral proof: the CLI must actually print the greeting at runtime.
      assert: { stdoutContains: ['Hello World'] }
    }
  },
  {
    id: 'parking',
    name: 'Smart Parking Garage (dynamic pricing + VIP discount)',
    targetLang: 'python',
    code: `add entity Vehicle {
  plate: text,
  isVip: boolean,
  entryMinute: number,
  exitMinute: number
}

add entity ParkingGarage {
  hourlyRate: number,
  vipDiscountRate: number,
  currency: options("EUR", "USD")
}

listen event on "vehicle:exit" {
  read vehicle from gate {
    where: exitMinute > entryMinute
  }

  compute durationHours from vehicle {
    formula: (exitMinute - entryMinute) / 60
  }

  if vehicle.isVip == true {
    compute cost from vehicle {
      formula: round((durationHours * hourlyRate) * (1 - vipDiscountRate) * 100) / 100
    }
  } else {
    compute cost from vehicle {
      formula: round((durationHours * hourlyRate) * 100) / 100
    }
  }

  send receipt to screen {
    format: "json",
    plate: vehicle.plate,
    cost: cost,
    durationHours: durationHours,
    isVip: vehicle.isVip
  }

  return success
}`,
    verify: {
      command: 'python main.py',
      // Behavioral proof: the generated app must reproduce the parking garage
      // semantics from the spec — same oracle as the parking-python golden.
      assert: {
        stdoutRegex: '"currency": "EUR"',
        jsonInOutput: [
          { path: 'currency', equals: 'EUR' },
          { path: 'vehicles.length', equals: 2 },
          { path: 'vehicles.0.plate', equals: 'AB-123' },
          { path: 'vehicles.0.cost', equals: 8.0 },
          { path: 'vehicles.0.isVip', equals: false },
          { path: 'vehicles.1.plate', equals: 'VIP-7' },
          { path: 'vehicles.1.isVip', equals: true },
          { path: 'vehicles.1.cost', equals: 6.4 },
          { path: 'grandTotal', equals: 14.4 },
          { path: 'grandTotal', gt: 0 },
          { path: 'grandTotal', lt: 50 }
        ]
      }
    }
  },
  {
    id: 'coffee',
    name: 'Coffee Shop Order Management (loyalty pricing)',
    targetLang: 'javascript',
    code: `// IPL Project v1.3.0 — Coffee Shop
add entity Drink {
  name: text,
  basePrice: number,
  size: options("small", "medium", "large")
}

add entity LoyaltyCard {
  ownerName: text,
  points: number
}

add entity Order {
  drinkName: text,
  size: options("small", "medium", "large"),
  hasLoyaltyCard: boolean,
  basePrice: number
}

listen event on "order:created" {
  read order from counter {
    where: order.drinkName != ""
  }

  compute sizeMultiplier from order {
    formula: if(order.size == "small", 1.0, if(order.size == "medium", 1.2, 1.5))
  }

  compute price from order {
    formula: round(order.basePrice * sizeMultiplier * 100) / 100
  }

  if order.hasLoyaltyCard == true {
    compute finalPrice from order {
      formula: round((price * 0.9) * 100) / 100
    }
    send receipt to screen {
      format: "json",
      drinkName: order.drinkName,
      size: order.size,
      price: price,
      finalPrice: finalPrice,
      loyaltyDiscount: "10%"
    }
  } else {
    send receipt to screen {
      format: "json",
      drinkName: order.drinkName,
      size: order.size,
      price: price,
      finalPrice: price,
      loyaltyDiscount: "none"
    }
  }

  return success
}`,
    verify: {
      command: 'node src/index.js',
      // Behavioral proof: the generated app must reproduce the coffee shop
      // pricing contract — size multipliers (1.0/1.2/1.5) and the 10% loyalty
      // discount — same oracle as the coffee-node golden.
      assert: {
        stdoutRegex: '"drinkName"',
        jsonInOutput: [
          { path: 'orders.length', equals: 2 },
          { path: 'orders.0.drinkName', equals: 'Latte' },
          { path: 'orders.0.size', equals: 'medium' },
          { path: 'orders.0.price', equals: 4.2 },
          { path: 'orders.0.finalPrice', equals: 3.78 },
          { path: 'orders.0.loyaltyDiscount', equals: true },
          { path: 'orders.1.drinkName', equals: 'Espresso' },
          { path: 'orders.1.size', equals: 'small' },
          { path: 'orders.1.price', equals: 2.0 },
          { path: 'orders.1.finalPrice', equals: 2.0 },
          { path: 'orders.1.loyaltyDiscount', equals: false },
          { path: 'grandTotal', equals: 5.78 },
          { path: 'grandTotal', gt: 0 },
          { path: 'grandTotal', lt: 10 }
        ]
      }
    }
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
  /** Consolidation agent summary (only when --consolidate). */
  consolidation?: { passesUsed: number; changed: boolean; confirmed: number; report: string };
  /** P2 token-economy telemetry: estimated input/output per bucket for the run. */
  usage?: {
    specTokens: number;
    generation: TokenBucket;
    consolidation: TokenBucket;
    repair: TokenBucket;
    repairPasses: number;
    clarificationRoundtrips: number;
  };
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

/**
 * Mock-mode JSON oracles — the golden truth the generated app must reproduce.
 * When a spec asserts `jsonInOutput`, the mock emits this exact document so the
 * offline pipeline smoke test exercises the same structured assertions the real
 * generated apps are measured against (an oracle, not a hack).
 */
const MOCK_JSON_ORACLES: Record<string, unknown> = {
  parking: {
    currency: 'EUR',
    grandTotal: 14.4,
    vehicles: [
      { plate: 'AB-123', cost: 8.0, durationHours: 2.0, isVip: false },
      { plate: 'VIP-7', cost: 6.4, durationHours: 2.0, isVip: true }
    ]
  },
  coffee: {
    grandTotal: 5.78,
    orders: [
      { drinkName: 'Latte', size: 'medium', price: 4.2, finalPrice: 3.78, loyaltyDiscount: true },
      { drinkName: 'Espresso', size: 'small', price: 2.0, finalPrice: 2.0, loyaltyDiscount: false }
    ]
  }
};

/** Renders a canned artifact (mock mode) that should PASS the spec's checks. */
function buildMockArtifact(spec: BenchSpec): string {
  const marker = spec.verify.marker ?? 'IPL Studio';
  // Emit the behavioral needles too, so the mock (an oracle) satisfies the same
  // runtime assertions the real generated apps are measured against.
  const needles = (spec.verify.assert?.stdoutContains ?? []).map(n => n.replace(/"/g, '\\"'));
  const jsonOracle = spec.verify.assert?.jsonInOutput?.length ? MOCK_JSON_ORACLES[spec.id] : undefined;
  // `print(json.dumps(json.loads("..."), indent=2))` keeps the stdoutRegex
  // (e.g. `"currency": "EUR"`) satisfied by formatting keys/values with spaces.
  const jsonBody = jsonOracle !== undefined
    ? `\nprint(json.dumps(json.loads("${JSON.stringify(jsonOracle).replace(/"/g, '\\"')}"), indent=2))`
    : '';
  if (spec.verify.command?.startsWith('python')) {
    return [
      '<file path="main.py">',
      ...(jsonBody ? ['import json'] : []),
      `print("${marker}")`,
      ...needles.map(n => `print("${n}")`),
      'print("IPL Studio 2-Pass generator: mock artifact")',
      ...(jsonBody ? [jsonBody] : [])
    ].join('\n');
  }
  if (spec.verify.command?.startsWith('node')) {
    const nodeJson = jsonOracle !== undefined ? `const data = ${JSON.stringify(jsonOracle)};\nconsole.log(JSON.stringify(data, null, 2));` : '';
    return [
      '<file path="index.js">',
      `console.log("${marker}");`,
      ...needles.map(n => `console.log("${n}");`),
      ...(nodeJson ? [nodeJson] : []),
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

async function generateReal(spec: BenchSpec, config: LLMConfig, args: CliArgs, usage: RunTokenUsage): Promise<GenerationOutput> {
  const pass1Prompt = buildPass1Prompt(spec.code, spec.targetLang);

  const t1 = Date.now();
  const p1Text = await withTimeout(
    callLLM(pass1Prompt, config, () => {}, undefined, { temperature: 0.4, usage: { usage, bucket: 'generation' } }),
    args.timeoutPerPassMs,
    'Pass 1'
  );
  const pass1: PassTiming = { ms: Date.now() - t1, chars: p1Text.length, approxTokens: approxTokens(p1Text.length) };

  const topology = extractTopologyJson(p1Text) ?? '';

  const t2 = Date.now();
  const xml = await withTimeout(
    callLLM(buildPass2Prompt(spec.code, spec.targetLang, topology), config, () => {}, undefined, { temperature: 0.15, seed: 42, usage: { usage, bucket: 'generation' } }),
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

function writeArtifact(runDir: string, xml: string): { files: string[]; totalBytes: number; parsed: ProjectArtifactFile[] } {
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
  return { files, totalBytes, parsed };
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
 * `bin` on POSIX), otherwise a direct exe path replaces the command. With no
 * explicit path, the first actually-present interpreter is probed
 * (`python` -> `python3` -> `py`), mirroring the golden runner so Python specs
 * are testable on machines that only ship `py`.
 */
function resolvePythonCommand(command: string, pythonPath?: string): string {
  if (!/^python(3|3\.\d+)?\b/.test(command)) return command;
  if (pythonPath) {
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
  const candidates = ['python', 'python3', 'py'];
  for (const c of candidates) {
    const probe = spawnSync(c, ['--version'], { encoding: 'utf8', windowsHide: true });
    if (probe.status === 0) {
      return command.replace(/^python(3|3\.\d+)?/, c);
    }
  }
  return command;
}

async function verify(spec: BenchSpec, runDir: string, args: CliArgs): Promise<{ status: RunStatus; detail: string; output?: string }> {
  // Execution isolation: the generated project is executed from a COPY placed
  // OUTSIDE the repo tree (os.tmpdir by default, or --sandbox). Otherwise the
  // code would inherit the repo's own context — the root package.json's
  // `"type": "module"` turning CommonJS `require` into a ReferenceError, or the
  // repo's node_modules leaking undeclared deps. This is generic (any language),
  // never tuned to a specific spec. Artifacts under output/benchmark are left
  // untouched; only execution happens in the sandbox.
  const sandboxDir = args.sandboxDir ?? pathResolve(tmpdir(), 'ipl-benchmark');
  const execDir = copyRunToSandbox(runDir, sandboxDir);
  let cleaned = false;
  const cleanup = () => {
    if (!cleaned && execDir !== runDir) {
      rmSync(execDir, { recursive: true, force: true });
      cleaned = true;
    }
  };
  try {
    return await verifyIn(runDir, execDir, spec, args);
  } finally {
    cleanup();
  }
}

/**
 * Copies a run directory into an isolated sandbox (a sibling temp folder).
 * Returns the sandbox path; if the run dir already lives outside the repo (no
 * `package.json` marker walking up to the repo root), it is reused as-is.
 */
function copyRunToSandbox(runDir: string, sandboxRoot: string): string {
  // Heuristic to avoid re-copying when the run dir is already isolated: only
  // isolate when the sandbox root differs from the run dir's own location.
  const runRoot = pathResolve(runDir, '..', '..', '..');
  const sandboxAbs = pathResolve(sandboxRoot);
  if (runRoot === sandboxAbs) return runDir;
  const id = pathResolve(runDir).replace(/[^a-zA-Z0-9]/g, '_');
  const target = pathResolve(sandboxRoot, `run-${id}`);
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  const files = readdirSync(runDir, { recursive: true }) as string[];
  for (const f of files) {
    const src = pathResolve(runDir, f);
    const dst = pathResolve(target, f);
    const stat = statSync(src, { throwIfNoEntry: false });
    if (!stat) continue;
    if (stat.isDirectory()) { mkdirSync(dst, { recursive: true }); continue; }
    mkdirSync(pathResolve(dst, '..'), { recursive: true });
    copyFileSync(src, dst);
  }
  return target;
}

/** The actual verification logic, decoupled from where the files were copied. */
async function verifyIn(runDir: string, execDir: string, spec: BenchSpec, args: CliArgs): Promise<{ status: RunStatus; detail: string; output?: string }> {
  const allFiles = readdirSync(execDir, { recursive: true }) as string[];
  const allContent = allFiles
    .filter(f => !f.endsWith('.txt'))
    .map(f => {
      try { return readFileSync(pathResolve(execDir, f), 'utf8'); } catch { return ''; }
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
      const check = spawnSync('node', ['--check', pathResolve(execDir, f)], { encoding: 'utf8', windowsHide: true });
      if (check.status !== 0) {
        return { status: 'FAIL', detail: `node --check failed on ${f}: ${(check.stderr || '').trim().slice(0, 200)}` };
      }
    }

    const run = runCommand(execDir, spec.verify.command, args.timeoutRunMs, args.pythonPath);
    if (run.timedOut) return { status: 'WARN', detail: `command timed out after ${args.timeoutRunMs} ms (long-running server?)` };
    if (run.exitCode === null) return { status: 'WARN', detail: 'toolchain not available (command could not be spawned)' };
    if (run.exitCode === 127 || run.exitCode === 9009) {
      return { status: 'WARN', detail: `toolchain not available (${spec.verify.command} not found on this machine)` };
    }

    let commandOutput = run.output;
    let commandExit = run.exitCode;
    if (run.exitCode !== 0) {
      if (/is not recognized as an internal|n'est pas reconnu|command not found|not recognized|ENOENT/i.test(run.output)) {
        return { status: 'WARN', detail: `toolchain not available (${spec.verify.command} not found on this machine)` };
      }
      // The entry file may live in a subdirectory (e.g. src/main.py or
      // src/index.js). Retry with the discovered path(s) before failing —
      // "cannot find module" may just mean the entry is not at the run root.
      const retried = retryWithDiscoveredEntry(spec.verify.command, allFiles);
      if (retried) {
        let retryOk = false;
        let lastRetryOutput = '';
        for (const attempt of retried) {
          const retry = runCommand(execDir, attempt.command, args.timeoutRunMs, args.pythonPath);
          lastRetryOutput = retry.output;
          if (retry.exitCode === 0) {
            commandOutput = retry.output;
            commandExit = retry.exitCode;
            retryOk = true;
            break;
          }
        }
        if (!retryOk) {
          if (/cannot find module|No module named|ModuleNotFound/i.test(`${run.output} ${lastRetryOutput}`)) {
            const deps = diagnoseMissingDeps(`${run.output}\n${lastRetryOutput}`, allFiles, execDir);
            const extra = deps ? ` deps: ${deps}` : '';
            return { status: 'WARN', detail: `entry missing (${spec.verify.command}) — retried ${retried.map(a => a.command).join(' | ')}: ${lastRetryOutput.slice(0, 160)}; generated app may be browser-based or need missing deps.${extra}` };
          }
          return {
            status: 'FAIL',
            detail: `${spec.verify.command} failed (${run.output.slice(0, 120)}) — retried ${retried.map(a => a.command).join(' | ')}: ${lastRetryOutput.slice(0, 160) || 'non-zero exit'}`,
            output: `${run.output}\n--- retried ---\n${lastRetryOutput}`
          };
        }
      } else {
        if (/cannot find module|No module named|ModuleNotFound/i.test(run.output)) {
          const deps = diagnoseMissingDeps(run.output, allFiles, execDir);
          const extra = deps ? ` deps: ${deps}` : '';
          return { status: 'WARN', detail: `entry missing (${spec.verify.command}) — generated app may be browser-based.${extra}` };
        }
        return { status: 'FAIL', detail: `exit code ${run.exitCode}: ${run.output.slice(0, 200)}`, output: run.output };
      }
    }

    // Behavioral assertions on the successful run's actual output (not just the
    // presence of a marker): exit code, regex, stdin-fed lines, JSON paths.
    if (spec.verify.assert) {
      const { failures } = evaluateBehavior(commandOutput, '', commandExit, spec.verify.assert);
      if (failures.length > 0) {
        return { status: 'FAIL', detail: `behavior failed: ${failures.join('; ')}`, output: commandOutput };
      }
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
 *
 * For Python entry files that live inside a package (a directory with an
 * `__init__.py`), also emit a `python -m <pkg.module>` variant: `python
 * src/main.py` puts `src/` on sys.path, which breaks `from src.* import ...`
 * imports, whereas `python -m src.main` keeps the run root on sys.path.
 */
function retryWithDiscoveredEntry(command: string, allFiles: string[]): { command: string; entry: string }[] | null {
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

  const retries: { command: string; entry: string }[] = [];
  const root = (f: string) => f.replace(/[\\/]/g, '/');
  for (const c of candidates) {
    const entry = root(c);
    const direct = `${m[1]}${entry}${m[3]}`;
    retries.push({ command: direct, entry });
    if (ext === '.py') {
      const parts = entry.split('/');
      const fileName = parts.pop();
      const pkgDir = parts.join('/');
      if (pkgDir && fileName && !fileName.endsWith('.pyc')) {
        const pkgRoot = parts.slice(0, -1);
        const pkgModule = [...parts, fileName.replace(/\.py$/, '')].join('.');
        const isPackage = (dir: string) => allFiles.some(f => root(f) === `${dir}/__init__.py`);
        // Only the `-m` form is useful when the file lives inside a package.
        if (isPackage(pkgDir) || pkgRoot.some(dir => isPackage(dir))) {
          retries.push({ command: `${m[1]}-m ${pkgModule}${m[3]}`, entry });
        }
      }
    }
  }
  return retries;
}

// ---------------------------------------------------------------------------
// Missing-dependency diagnosis (report-only, never installs anything)
// ---------------------------------------------------------------------------

/**
 * Language manifests that declare runtime dependencies, keyed by manifest file
 * name (basename). The harness only READS these to tell the user which of the
 * missing modules are already declared (and therefore installable) versus
 * undeclared. It never installs anything on its own.
 */
const DEP_MANIFESTS: { pattern: RegExp; parse: (content: string) => string[] }[] = [
  {
    // Python: requirements.txt — one package per line, optional version spec.
    pattern: /(^|[\\/])requirements\.txt$/i,
    parse: (c) => c.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => l.split(/[<>=~!;[]/)[0].trim().toLowerCase()).filter(Boolean)
  },
  {
    // Node: package.json — dependencies/devDependencies/optionalDependencies.
    pattern: /(^|[\\/])package\.json$/i,
    parse: (c) => {
      try {
        const pkg = JSON.parse(c);
        return Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}), ...(pkg.optionalDependencies || {}), ...(pkg.peerDependencies || {}) }).map(d => d.toLowerCase());
      } catch { return []; }
    }
  },
  {
    // Rust: Cargo.toml — package names under [dependencies].
    pattern: /(^|[\\/])Cargo\.toml$/i,
    parse: (c) => {
      const names: string[] = [];
      const inDeps = c.split(/\r?\n/).some(l => /^\[dependencies\]/i.test(l.trim()));
      for (const line of c.split(/\r?\n/)) {
        if (/^\[/i.test(line.trim())) continue;
        const m = line.match(/^\s*([a-zA-Z0-9_-]+)\s*=/);
        if (m && (inDeps || /^\[dev-dependencies\]/i.test(line) === false)) names.push(m[1].toLowerCase());
      }
      return names;
    }
  },
  {
    // Go: go.mod — `require module` / `require (\n module v1.2.3`.
    pattern: /(^|[\\/])go\.mod$/i,
    parse: (c) => c.match(/require\s+([\w./-]+)/g)?.map(m => m.replace(/^require\s+/, '').toLowerCase()) ?? []
  }
];

/**
 * Reads declared dependencies from any manifest files present in the run dir.
 * Returns the full declaration blob (path + names) for the report, never
 * modifying anything.
 */
export function readDeclaredDeps(allFiles: string[], runDir: string): { manifest: string; declared: string[] }[] {
  const results: { manifest: string; declared: string[] }[] = [];
  for (const f of allFiles) {
    const rel = f.replace(/[\\/]/g, '/');
    const def = DEP_MANIFESTS.find(d => d.pattern.test(rel));
    if (!def) continue;
    let content = '';
    try { content = readFileSync(pathResolve(runDir, f), 'utf8'); } catch { continue; }
    results.push({ manifest: rel, declared: def.parse(content) });
  }
  return results;
}

/**
 * Extracts the names of missing modules/deps from a failed run's output. Each
 * entry is the module the runtime said it could not find (Python ModuleNotFound,
 * Node cannot find module, Cargo missing crate...). Returns an empty array when
 * the output carries no such signal.
 */
export function extractMissingModules(output: string): string[] {
  const found = new Set<string>();
  const lower = output;
  // Python
  for (const m of lower.matchAll(/No module named ['"]([^'"]+)['"]/gi)) found.add(m[1].toLowerCase());
  // Node
  for (const m of lower.matchAll(/Cannot find module ['"]([^'"]+)['"]/gi)) found.add(m[1].toLowerCase());
  // Rust — E0432 unresolved import (`serde::Serialize`, `crate::foo`, ...)
  for (const m of lower.matchAll(/unresolved import\s+[^\n]*?`?([a-zA-Z0-9_]+)::/gi)) found.add(m[1].toLowerCase());
  // Rust — cannot find crate
  for (const m of lower.matchAll(/cannot find crate [`'"]?([a-zA-Z0-9_]+)[`'"]?/gi)) found.add(m[1].toLowerCase());
  // Go — no required module provides package
  for (const m of lower.matchAll(/no required module provides package[:\s]+([a-zA-Z0-9_./-]+)/gi)) {
    const pkg = m[1].split('/').pop()?.toLowerCase();
    if (pkg) found.add(pkg);
  }
  return [...found];
}

/**
 * Builds a human-readable report of missing modules vs declared dependencies.
 * This is DIAGNOSIS ONLY — the harness never installs anything. The report is
 * meant for a human to review, as requested ("installer sans human in the loop
 * non"). Returns null when the output contains no missing-module signal.
 */
function diagnoseMissingDeps(output: string, allFiles: string[], runDir: string): string | null {
  const missing = extractMissingModules(output);
  if (missing.length === 0) return null;
  const manifests = readDeclaredDeps(allFiles, runDir);
  const declared = new Set(manifests.flatMap(m => m.declared));

  const declaredMissing = missing.filter(m => declared.has(m));
  const undeclaredMissing = missing.filter(m => !declared.has(m));

  const lines: string[] = [];
  if (manifests.length > 0) {
    lines.push(`declared in ${manifests.map(m => m.manifest).join(', ')}: ${declaredMissing.length > 0 ? declaredMissing.join(', ') : '(none of the missing ones)'}`);
  } else {
    lines.push('no dependency manifest found (requirements.txt / package.json / Cargo.toml / go.mod)');
  }
  if (undeclaredMissing.length > 0) lines.push(`missing but UNDECLARED (need manual review + declaration): ${undeclaredMissing.join(', ')}`);
  lines.push('NO AUTO-INSTALL: review these dependencies and install/verify them manually.');
  return lines.join(' · ');
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
  firstTry: { status: RunStatus; detail: string; output?: string },
  missingRefs?: MissingModuleRef[],
  reviewIssues?: ReviewIssue[],
  usage?: RunTokenUsage
): Promise<{ v: { status: RunStatus; detail: string; output?: string }; repairsToSuccess: number; repairDetails: string[]; firstTryStatus: RunStatus }> {
  const repairDetails: string[] = [];
  let v = firstTry;

  if (missingRefs && missingRefs.length > 0) {
    repairDetails.push(`static check: ${missingRefs.length} import(s) reference files that are not generated — ${missingRefs.map(m => m.resolved).join(', ')}`);
  }
  const reviewHints = reviewIssues?.filter(i => i.severity === 'error' || i.severity === 'warning') ?? [];

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
      if (usage) usage.repairPasses += 1;

      // The fix directive must carry the behavioral contract too: a run that
      // executes cleanly but outputs the wrong JSON is still a FAIL, and the
      // model cannot repair it blind. Serialize the assert contract so the
      // repair knows the target values (currency, vehicle plates, prices...).
      const contract = spec.verify.assert
        ? `\n\nEXPECTED RUNTIME BEHAVIOR (verify against actual program output):\n${JSON.stringify(spec.verify.assert, null, 2)}`
        : '';
      const staticHint = missingRefs && missingRefs.length > 0
        ? `\n\nSTATIC IMPORT CHECK FAILURES (imports that reference files never generated — GENERATE THE MISSING FILES):\n${missingRefs.map(m => `- ${m.specifier} imported in ${m.importer} resolves to missing ${m.resolved}`).join('\n')}`
        : '';
      const reviewHint = reviewHints.length > 0
        ? `\n\nCODE REVIEW FINDINGS (independent reviewer — fix these too):\n${reviewHints.map(r => `- [${r.severity}] ${r.file}: ${r.message}${r.suggestion ? ` (suggested: ${r.suggestion})` : ''}`).join('\n')}`
        : '';
      const prompt = `THE CODE FAILED THE VERIFICATION. ANALYZE THE FAILURE, FIX THE FILES, AND MAKE THE PROGRAM PRODUCE THE EXPECTED RUNTIME BEHAVIOR.\n\nFailure detail:\n${v.detail}\n\nActual program output:\n${(v.output ?? '').slice(0, 3000)}${contract}${staticHint}${reviewHint}`;
      try {
        const fixed = await withTimeout(
          refineIPLArtifact(existingXml, prompt, spec.targetLang, config, () => {}, () => {}, usage ? { usage, bucket: 'repair' } : undefined),
          args.timeoutPerPassMs,
          `repair pass ${pass}`
        );

        // The model cannot fix confidently without a precision. In the harness
        // there is no user to answer — a clarification request is a failed
        // repair pass (the model discusses instead of fixing), not a terminal
        // WARN that awaits human input. Record it and consume the pass.
        const clarification = extractClarificationRequest(fixed);
        if (clarification) {
          if (usage) usage.clarificationRoundtrips += 1;
          repairDetails.push(`pass ${pass} [llm]: NEED_CLARIFICATION — ${clarification}`);
          continue;
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

/**
 * The LLM review pass ("the reviewer who is not an IPL specialist"): after the
 * artifact is written, a fresh LLM reads the ENTIRE codebase and flags defects
 * regex cannot see — undefined symbols, mismatched signatures, fields read but
 * never produced, swallowed errors. Returns a compact summary string (or '' if
 * the pass is disabled / clean), consumed as a hint by the repair loop.
 */
async function runReviewPass(
  files: ProjectArtifactFile[],
  args: CliArgs,
  config: LLMConfig
): Promise<{ issues: ReviewIssue[]; ms: number }> {
  const start = Date.now();
  const prompt = buildReviewPrompt(files);
  let raw = '';
  try {
    raw = await withTimeout(callLLM(prompt, config, () => {}, undefined, { temperature: 0.1 }), args.timeoutPerPassMs, 'review pass');
  } catch (err: any) {
    log(args, `review pass failed: ${err.message}`, 'warn');
    return { issues: [], ms: Date.now() - start };
  }
  const issues = parseReviewOutput(raw);
  return { issues, ms: Date.now() - start };
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

function endpointForMode(config: LLMConfig, mode: LLMConfig['mode']): string {
  if (mode === 'external') return config.externalEndpoint;
  if (mode === 'lmstudio') return config.lmStudioEndpoint || config.localEndpoint;
  return config.localEndpoint;
}

function buildReport(args: CliArgs, config: LLMConfig, results: RunResult[]): string {
  const lines: string[] = [];
  lines.push('# 📊 IPL Studio — Automated Benchmark Report');
  lines.push('');
  lines.push(`- **Date**: ${new Date().toISOString()}`);
  lines.push(`- **Engine**: 2-Pass LLM Generator (Pass 1 topology + Pass 2 XML)`);
  lines.push(`- **Mode**: ${args.mode}${args.mode === 'mock' ? ' (offline pipeline smoke test)' : ''}`);
  if (args.mode !== 'mock') lines.push(`- **Model**: ${config.model} · **Endpoint**: ${endpointForMode(config, args.mode)}`);
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
    if (r.consolidation) {
      lines.push(`- **Consolidation**: ${r.consolidation.confirmed} confirmed issue(s) · ${r.consolidation.passesUsed} auto-fix pass(es) · ${r.consolidation.changed ? 'files modified' : 'no change'}`);
      lines.push('');
      lines.push('```text');
      lines.push(r.consolidation.report);
      lines.push('```');
    }
    if (r.repairDetails.length > 0) {
      lines.push(`- **Repairs applied**:`);
      for (const d of r.repairDetails) lines.push(`  - ${d}`);
    }
    if (args.mode !== 'mock') {
      lines.push(`- **Pass 1**: ${r.pass1.ms} ms · ≈ ${r.pass1.approxTokens} tokens`);
      lines.push(`- **Pass 2**: ${r.pass2.ms} ms · ≈ ${r.pass2.approxTokens} tokens`);
    }
    if (r.usage) {
      const u = r.usage;
      lines.push(`- **Tokens (est.)**: spec ${u.specTokens} → génération ${u.generation.inputTokens + u.generation.outputTokens} (${u.generation.inputTokens} in / ${u.generation.outputTokens} out) + consolidation ${u.consolidation.inputTokens + u.consolidation.outputTokens} + réparation ${u.repair.inputTokens + u.repair.outputTokens} · réparation ${u.repairPasses} pass(es) · ${u.clarificationRoundtrips} clarification(s)`);
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
  if (args.mode !== 'mock') console.log(`Model: ${config.model} · Endpoint: ${endpointForMode(config, args.mode)}`);
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
      const usage = createRunTokenUsage(spec.code.length);
      let gen: GenerationOutput;
      let genError = '';
      try {
        gen = args.mode === 'mock' ? await generateMock(spec) : await generateReal(spec, config, args, usage);
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

      // Consolidation agent (delivery gate): deterministic gates + systematic
      // LLM review + bounded auto-fix loop, running BEFORE the artifact is
      // written/verified — the same position it holds in the app flow
      // (generateIPL → runConsolidation → writeArtifactToDisk). Opt-in via
      // --consolidate because each consolidation pass costs LLM tokens.
      let consolidation: RunResult['consolidation'];
      let genXml = gen.xml;
      if (args.consolidate && args.mode !== 'mock') {
        const t0 = Date.now();
        const cons = await consolidateArtifact(gen.xml, spec.targetLang, config, {
          timeoutPerPassMs: args.timeoutPerPassMs,
          onLog: (msg, type) => log(args, `consolidation: ${msg}`, type),
          usage: { usage, bucket: 'consolidation' }
        });
        consolidation = {
          passesUsed: cons.passesUsed,
          changed: cons.changed,
          confirmed: cons.confirmedIssues.length,
          report: cons.report
        };
        log(
          args,
          `consolidation: ${cons.confirmedIssues.length} confirmed, ${cons.passesUsed} pass(es), ${cons.changed ? 'files modified' : 'no change'} (${Date.now() - t0} ms)`,
          cons.confirmedIssues.length > 0 ? 'warn' : 'success'
        );
        if (cons.changed) genXml = filesToXml(cons.files);
      }

      const written = writeArtifact(runDir, genXml);
      const firstTry = await verify(spec, runDir, args);

      // Static "holes in the racket" check — a proactive pass that READS the
      // generated code and flags imports that reference files never generated
      // (the recurring `require('./entities')` -> missing entities.js bug).
      // It runs before behavioral verify so a one-file gap is caught early, and
      // feeds the same self-healing repair loop when repairs are enabled.
      const missingRefs = findMissingModuleRefs(written.parsed);

      // Optional LLM review pass: a skeptical non-IPL code reviewer reads the
      // whole tree and flags defects regex cannot see. Costs one extra LLM call
      // per run, so it is opt-in via --review.
      let reviewIssues: ReviewIssue[] = [];
      if (args.reviewPass && args.mode !== 'mock') {
        const review = await runReviewPass(written.parsed, args, config);
        reviewIssues = review.issues;
        if (reviewIssues.length > 0) {
          log(args, `review pass: ${reviewIssues.length} issue(s) (${review.ms} ms)`, 'warn');
        } else {
          log(args, `review pass: clean (${review.ms} ms)`, 'info');
        }
      }

      // Self-healing: try to repair failing runs (deterministic + LLM) up to --repair-passes.
      let v = firstTry;
      let repairsToSuccess = 0;
      let repairDetails: string[] = [];
      if (firstTry.status === 'FAIL' && args.repairPasses > 0 && args.mode !== 'mock') {
        const repaired = await repairAndVerify(spec, runDir, args, config, firstTry, missingRefs, reviewIssues, usage);
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
        failureOutput: v.output,
        consolidation,
        usage: {
          specTokens: usage.specTokens,
          generation: { ...usage.generation },
          consolidation: { ...usage.consolidation },
          repair: { ...usage.repair },
          repairPasses: usage.repairPasses,
          clarificationRoundtrips: usage.clarificationRoundtrips
        }
      };
      results.push(result);
      const repairNote = repairDetails.length > 0 ? ` · repaired (${repairsToSuccess} pass${repairsToSuccess === 1 ? '' : 'es'})` : '';
      const consNote = consolidation ? ` · consolidated (${consolidation.confirmed} confirmed/${consolidation.passesUsed} pass${consolidation.passesUsed === 1 ? '' : 'es'})` : '';
      log(args, `${v.status} — ${v.detail}${repairNote}${consNote} (${result.totalMs} ms, ${written.files.length} files)`, v.status === 'PASS' ? 'success' : v.status === 'WARN' ? 'warn' : 'error');
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
    endpoint: endpointForMode(config, args.mode),
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
