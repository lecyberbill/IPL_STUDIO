/**
 * Semantic-preservation receipt — "did the IPL spec's *contract* survive into
 * the generated source, independent of whether the app runs?".
 *
 * The final PASS/FAIL verdict aggregates many unrelated things (identifiers,
 * types, formulas, output keys, topology, runtime). This module splits the
 * contract into four measurable dimensions and reports, for each, how much of
 * what the spec declared actually appears in the shipped source files.
 *
 * It is deliberately pure and heuristic (whole-word + numeric-literal
 * coverage), so it can run offline, in CI, and on every iteration. It is a
 * *receipt*, not a gate: it tells us which layer still held a degree of
 * freedom, it does not block a run.
 *
 * Contract dimensions:
 *   1. identity      — entity + field names declared in the spec.
 *   2. types         — the 7 intent types used in the spec's `add` blocks.
 *   3. formulas      — identifiers + numeric literals inside `compute { formula }`.
 *   4. outputKeys    — keys emitted by `send { ... }` (format:json and friends).
 */

import { parseIPL } from './iplParser.ts';
import type { IPLExpr, IPLStatement } from './iplParser.ts';
import { IPL_INTENT_TYPES } from './iplCore.ts';
import type { BehaviorAssert } from './behaviorAssert.ts';

const INTENT_TYPE_NAMES = new Set(IPL_INTENT_TYPES.map(t => t.name.replace(/\(.*\)$/, '')));

/**
 * The type keyword the spec declares is almost never emitted verbatim (a spec
 * `number` becomes `float`/`int`, `boolean` becomes `True`/`False`, `options`
 * becomes an `enum`). To measure "types survived", map each intent type to the
 * set of synonyms a generated source is likely to contain.
 */
const TYPE_SYNONYMS: Record<string, string[]> = {
  text: ['text', 'str', 'string', 'char', 'strin'],
  number: ['number', 'int', 'integer', 'float', 'double', 'numeric', 'Number', 'Float'],
  boolean: ['bool', 'boolean', 'True', 'False', 'true', 'false'],
  id: ['id', 'key', 'uuid', 'ID', 'Id'],
  date: ['date', 'datetime', 'Date', 'DateTime', 'time'],
  options: ['options', 'enum', 'choices', 'Enum'],
  list: ['list', 'array', 'tuple', 'Array', 'List']
};

export interface SemanticContract {
  entityNames: string[];
  fieldNames: string[];
  types: string[];
  optionValues: string[];
  /** String literals declared by `seed <Entity> <name> { field: value }` (the fixture data). */
  seedValues: string[];
  formulaIdentifiers: string[];
  formulaNumbers: number[];
  outputKeys: string[];
  /** Control-flow kinds present in the spec: if / for / try / return / else / catch. */
  controlFlow: string[];
}

/** Language synonyms for the spec's control-flow intents, to measure they survived. */
const CONTROL_FLOW_SYNONYMS: Record<string, string[]> = {
  if: ['if'],
  else: ['else'],
  for: ['for', 'foreach', 'each'],
  try: ['try', 'except', 'catch'],
  catch: ['except', 'catch'],
  return: ['return']
};

export interface Coverage {
  preserved: number;
  total: number;
}

export interface SemanticReceipt {
  identity: Coverage;
  types: Coverage;
  formulas: Coverage;
  outputKeys: Coverage;
  /** Control-flow preservation (if/for/try/return/else/catch survived into source). */
  controlFlow: Coverage;
  /** Weighted 0..1 composite (identity .3, types .2, formulas .3, keys .2). */
  score: number;
}

// ---------------------------------------------------------------------------
// Contract extraction (spec side)
// ---------------------------------------------------------------------------

/** Recursively collects identifiers and numeric literals from a formula expr. */
function collectExprSymbols(expr: IPLExpr | null | undefined, ids: Set<string>, nums: Set<string>): void {
  if (!expr) return;
  switch (expr.kind) {
    case 'identifier':
      if (expr.name) ids.add(expr.name);
      break;
    case 'member':
      collectExprSymbols(expr.object, ids, nums);
      if (expr.property) ids.add(expr.property);
      break;
    case 'binary':
      collectExprSymbols(expr.left, ids, nums);
      collectExprSymbols(expr.right, ids, nums);
      break;
    case 'unary':
      collectExprSymbols(expr.operand, ids, nums);
      break;
    case 'call':
      if (expr.callee && !INTENT_TYPE_NAMES.has(expr.callee)) ids.add(expr.callee);
      for (const a of expr.args) collectExprSymbols(a, ids, nums);
      break;
    case 'array':
      for (const a of expr.items) collectExprSymbols(a, ids, nums);
      break;
    case 'literal':
      if (typeof expr.value === 'number') {
        nums.add(String(expr.value));
      } else if (typeof expr.value === 'string') {
        // String literals in a formula (e.g. options labels) are not arithmetic
        // symbols; ignore to keep the receipt focused on value identity.
      }
      break;
  }
}

function addStatementToContract(stmt: IPLStatement, c: SemanticContract, ids: Set<string>, nums: Set<string>): void {
  // `add entity X { field: type, ... }`
  if (stmt.kind === 'add') {
    if (stmt.name) c.entityNames.push(stmt.name);
    for (const prop of stmt.props) {
      if (prop.key) c.fieldNames.push(prop.key);
      const v = prop.value;
      if (v?.kind === 'identifier' && INTENT_TYPE_NAMES.has(v.name)) {
        c.types.push(v.name);
      } else if (v?.kind === 'call' && INTENT_TYPE_NAMES.has(v.callee)) {
        c.types.push(v.callee);
        if (v.callee === 'options') {
          for (const arg of v.args) {
            if (arg.kind === 'literal' && typeof arg.value === 'string') c.optionValues.push(arg.value);
          }
        }
      }
    }
    return;
  }

  // `seed Entity instance { field: value, ... }` — the seeded field keys +
  // literal values participate in identity/type preservation, and the string
  // literals are the fixture DATA the behavioral oracle must match.
  if (stmt.kind === 'seed') {
    if (stmt.seedEntity) c.entityNames.push(stmt.seedEntity);
    for (const prop of stmt.props) {
      if (prop.key) c.fieldNames.push(prop.key);
      if (prop.value?.kind === 'literal') {
        if (typeof prop.value.value === 'number') nums.add(String(prop.value.value));
        else if (typeof prop.value.value === 'string') c.seedValues.push(prop.value.value);
      }
    }
    return;
  }

  // `compute <name> from <src> { formula: <expr> }`
  if (stmt.kind === 'compute') {
    if (stmt.name) ids.add(stmt.name);
    for (const prop of stmt.props) {
      if (prop.key === 'formula') collectExprSymbols(prop.value, ids, nums);
    }
    return;
  }

  // `send <recipient> ... { format: "json", key: value, ... }` — output keys.
  if (stmt.kind === 'send') {
    for (const prop of stmt.props) {
      if (prop.key && prop.key.toLowerCase() !== 'format') c.outputKeys.push(prop.key);
    }
    return;
  }

  // Control-flow intents: the branch structure the spec declares.
  if (stmt.kind === 'if' || stmt.kind === 'for' || stmt.kind === 'try' || stmt.kind === 'return') {
    if (!c.controlFlow.includes(stmt.kind)) c.controlFlow.push(stmt.kind);
  }
  if (stmt.elseBody && stmt.elseBody.length > 0 && !c.controlFlow.includes('else')) c.controlFlow.push('else');
  if (stmt.catchBody && stmt.catchBody.length > 0 && !c.controlFlow.includes('catch')) c.controlFlow.push('catch');
}

export function extractIPLSemanticContract(code: string): SemanticContract {
  const c: SemanticContract = {
    entityNames: [],
    fieldNames: [],
    types: [],
    optionValues: [],
    seedValues: [],
    formulaIdentifiers: [],
    formulaNumbers: [],
    outputKeys: [],
    controlFlow: []
  };
  const ids = new Set<string>();
  const nums = new Set<string>();

  const visit = (stmts: IPLStatement[]): void => {
    for (const s of stmts) {
      addStatementToContract(s, c, ids, nums);
      visit(s.body);
      visit(s.elseBody ?? []);
      visit(s.catchBody ?? []);
    }
  };

  const { ast } = parseIPL(code);
  visit(ast.statements);

  // Formula identifiers/numbers. A symbol may also be a declared field name
  // (e.g. `hourlyRate` appears both as an entity field AND inside a formula) —
  // for the formula receipt it is still a symbol the generated math must keep.
  for (const id of ids) c.formulaIdentifiers.push(id);
  for (const n of nums) c.formulaNumbers.push(Number(n));

  // De-duplicate the coarse lists, preserving order.
  const uniq = (arr: string[]) => [...new Set(arr)];
  return {
    entityNames: uniq(c.entityNames),
    fieldNames: uniq(c.fieldNames),
    types: uniq(c.types),
    optionValues: uniq(c.optionValues),
    seedValues: uniq(c.seedValues),
    formulaIdentifiers: c.formulaIdentifiers,
    formulaNumbers: c.formulaNumbers,
    outputKeys: uniq(c.outputKeys),
    controlFlow: c.controlFlow
  };
}

// ---------------------------------------------------------------------------
// Measurement (generated-code side)
// ---------------------------------------------------------------------------

/** Whole-word identifiers in a source string (camelCase, snake_case, $, _). */
function wholeWords(content: string): Set<string> {
  const out = new Set<string>();
  const re = /[A-Za-z_$][A-Za-z0-9_$]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) out.add(m[0]);
  return out;
}

/** Numeric literals (int / float) in a source string. */
function numberLiterals(content: string): Set<string> {
  const out = new Set<string>();
  const re = /\b\d+(?:\.\d+)?\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) out.add(m[0]);
  return out;
}

/** Files that count as "generated source" — excludes the spec itself + docs. */
function isGeneratedSource(relativePath: string): boolean {
  return !/\.(ipl|md|txt)$/i.test(relativePath) && /\.(js|ts|py|rs|go|c|cpp|h|html|css|json)$/i.test(relativePath);
}

export interface SemanticFileDelta {
  id: string;
  type: string;
  expected: string;
  found: boolean;
}

/**
 * Measures how much of an IPL semantic contract survives in the generated
 * source tree. Returns per-dimension coverage plus the specific missing tokens
 * (the "receipt" detail), independent of any runtime result.
 */
export function measureSemanticPreservation(
  contract: SemanticContract,
  files: ReadonlyArray<{ relativePath: string; content: string }>
): SemanticReceipt & { missing: SemanticFileDelta[] } {
  const src = files.filter(f => isGeneratedSource(f.relativePath)).map(f => f.content);
  const words = new Set<string>();
  const nums = new Set<string>();
  for (const content of src) {
    for (const w of wholeWords(content)) words.add(w);
    for (const n of numberLiterals(content)) nums.add(n);
  }

  const missing: SemanticFileDelta[] = [];
  const count = (items: string[], lookup: (it: string) => boolean, kind: string): number => {
    let preserved = 0;
    for (const it of items) {
      if (lookup(it)) preserved++;
      else missing.push({ id: it, type: kind, expected: it, found: false });
    }
    return preserved;
  };

  // Identity = entity names + field names + option values (the data contract).
  const identityList = [...contract.entityNames, ...contract.fieldNames, ...contract.optionValues];
  const identity = {
    preserved: count(identityList, it => words.has(it), 'identity'),
    total: identityList.length
  };

  const typeMatch = (it: string): boolean => {
    const syn = TYPE_SYNONYMS[it];
    return !!syn && syn.some(s => words.has(s));
  };
  const types = {
    preserved: count(contract.types, typeMatch, 'type'),
    total: contract.types.length
  };

  const formulaList = [...contract.formulaIdentifiers.map(String), ...contract.formulaNumbers.map(String)];
  const formulas = {
    preserved: count(
      formulaList,
      it => (Number.isNaN(Number(it)) ? words.has(it) : nums.has(it)),
      'formula'
    ),
    total: formulaList.length
  };
  const outputKeys = {
    preserved: count(contract.outputKeys, it => words.has(it), 'outputKey'),
    total: contract.outputKeys.length
  };
  const controlFlow = {
    preserved: count(contract.controlFlow, it => (CONTROL_FLOW_SYNONYMS[it] ?? [it]).some(s => words.has(s)), 'controlFlow'),
    total: contract.controlFlow.length
  };

  const wScore =
    (identity.total === 0 ? 1 : identity.preserved / identity.total) * 0.3 +
    (types.total === 0 ? 1 : types.preserved / types.total) * 0.2 +
    (formulas.total === 0 ? 1 : formulas.preserved / formulas.total) * 0.3 +
    (outputKeys.total === 0 ? 1 : outputKeys.preserved / outputKeys.total) * 0.2;

  return { identity, types, formulas, outputKeys, controlFlow, score: Math.round(wScore * 1000) / 1000, missing };
}

// ---------------------------------------------------------------------------
// Conformance gate (advisory → blocking, opt-in) + contextual contract
// ---------------------------------------------------------------------------

export interface ContractFinding {
  file: string;
  reason: string;
  suggestion: string;
}

/** True when a declared contract dimension is ENTIRELY lost (stricter than score). */
export function isRequiredContractLost(r: Pick<SemanticReceipt, 'identity' | 'types' | 'formulas' | 'outputKeys'>): boolean {
  const lost = (c: Coverage) => c.total > 0 && c.preserved === 0;
  return lost(r.formulas) || lost(r.outputKeys) || lost(r.types);
}

/**
 * 0-token contract-conformance gate. When a spec is marked `strictContract`,
 * this turns *measured* drift into an actionable finding (an entire declared
 * dimension lost, or the composite score below `threshold`) — WITHOUT ever
 * blocking generation (the default remains advisory: "rails, not walls").
 */
export function findContractFindings(
  files: ReadonlyArray<{ relativePath: string; content: string }>,
  specCode: string | undefined,
  threshold = 0.5
): ContractFinding[] {
  if (!specCode) return [];
  const contract = extractIPLSemanticContract(specCode);
  const r = measureSemanticPreservation(contract, files);
  if (isRequiredContractLost(r) || r.score < threshold) {
    const top = r.missing.slice(0, 6).map(m => m.id).join(', ');
    return [{
      file: '(project)',
      reason: `semantic contract drift (score ${r.score}): ${r.missing.length} symbol(s) not preserved in the shipped source`,
      suggestion: `preserve the spec's contract — missing: ${top || '(all declared symbols)'}. Regenerate or patch the files, or drop strictContract if this intent is intentionally loose.`
    }];
  }
  return [];
}

/**
 * Contextual contract for prompts (the "oracle" tooling and the repair path use
 * the SAME object as the spec): a compact human/machine-readable summary of the
 * identity/types/formulas/output-keys the app must surface. Injected into the
 * repair + generation context so generator / repair / oracle agree.
 */
export function deriveContractContext(contract: SemanticContract): string {
  const parts: string[] = [];
  if (contract.entityNames.length) parts.push(`entities: ${contract.entityNames.join(', ')}`);
  if (contract.fieldNames.length) parts.push(`fields: ${contract.fieldNames.join(', ')}`);
  if (contract.types.length) parts.push(`types: ${contract.types.join(', ')}`);
  if (contract.optionValues.length) parts.push(`enum values: ${contract.optionValues.join(', ')}`);
  if (contract.formulaIdentifiers.length) parts.push(`formula symbols: ${contract.formulaIdentifiers.join(', ')}`);
  if (contract.formulaNumbers.length) parts.push(`formula constants: ${contract.formulaNumbers.join(', ')}`);
  if (contract.outputKeys.length) parts.push(`output keys: ${contract.outputKeys.join(', ')}`);
  if (contract.seedValues.length) parts.push(`fixture data: ${contract.seedValues.join(', ')}`);
  if (contract.controlFlow.length) parts.push(`control flow: ${contract.controlFlow.join(', ')}`);
  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Oracle / spec parity guard ("generator and oracle share the same fixtures")
// ---------------------------------------------------------------------------

export interface OracleParity {
  ok: boolean;
  issues: string[];
}

/**
 * Checks that the behavioral oracle's string-valued fixtures are declared by the
 * spec — every `jsonInOutput.equals <string>` must be an option value or a
 * `seed` literal of the spec. This is the "generator and oracle share the same
 * fixtures" guard: an oracle that expects a value the spec never declares (e.g.
 * currency "GBP" when the spec allows EUR/USD) has drifted from the spec, and a
 * hand-written oracle can quietly carry data the command-first spec omits.
 * Indicator only — it does not block (the spec is allowed to be minimal and put
 * fixtures in the oracle; the guard makes that visible instead of invisible).
 */
export function checkOracleParity(specCode: string, assert: BehaviorAssert | undefined): OracleParity {
  const issues: string[] = [];
  const asserts = assert?.jsonInOutput ?? [];
  if (asserts.length === 0) return { ok: true, issues };
  const c = extractIPLSemanticContract(specCode);
  const declared = new Set([...c.optionValues, ...c.seedValues]);
  for (const j of asserts) {
    if (typeof j.equals === 'string' && !declared.has(j.equals)) {
      issues.push(`oracle "${j.path}" expects "${j.equals}" but the spec declares no such option/seed value`);
    }
  }
  return { ok: issues.length === 0, issues };
}

/**
 * Output keys declared by `send { format: "json", <key>: ..., ... }` clauses in
 * the spec. These are the keys the generated app MUST surface in its JSON output.
 * (A `format` prop other than "json", e.g. an email or log, is skipped.)
 */
export function deriveOutputJsonKeys(specCode: string): string[] {
  const keys: string[] = [];
  const { ast } = parseIPL(specCode);
  const visit = (stmts: IPLStatement[]): void => {
    for (const s of stmts) {
      if (s.kind === 'send') {
        const fmt = s.props.find(p => p.key === 'format');
        const isJson = fmt?.value?.kind === 'literal' && String(fmt.value.value).toLowerCase() === 'json';
        if (isJson) {
          for (const p of s.props) {
            if (p.key && p.key !== 'format' && !keys.includes(p.key)) keys.push(p.key);
          }
        }
      }
      visit(s.body);
      visit(s.elseBody ?? []);
      visit(s.catchBody ?? []);
    }
  };
  visit(ast.statements);
  return keys;
}

/**
 * Derives a default behavioral oracle from the spec (advisory by default — it
 * is a structural floor, not the exact-value oracle a hand-written `continue`
 * would give). Returns null when the spec declares no JSON output, so a spec
 * without a structured output falls back to the crash-only smoke.
 *
 * The assertion checks that each declared output key appears as a property name
 * in the app's JSON output (the container/array index is unknown to the spec,
 * so presence is what we can guarantee). Exact values stay hand-written (the
 * benchmark) or float-approx where computed.
 */
export function deriveBehaviorAssertFromSpec(specCode: string): BehaviorAssert | null {
  const keys = deriveOutputJsonKeys(specCode);
  if (keys.length === 0) return null;
  return { stdoutContains: keys.map(k => `"${k}"`) };
}
