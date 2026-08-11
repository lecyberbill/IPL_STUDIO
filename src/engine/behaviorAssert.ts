/**
 * Behavioral assertions — the "does the generated app actually do what the
 * spec said?" proof, on top of the raw exit-code / marker checks.
 *
 * A declarative BehaviorAssert can verify:
 *  - exit code
 *  - stdout contains / regex
 *  - stdin lines fed to the process (consumed by the host runner, not here)
 *  - structured JSON in the output, via JSON-path assertions (equals, matches,
 *    gt/lt, array length)
 *
 * The evaluator is pure (stdout/stderr/exitCode in, failures out) so it can be
 * shared by the golden execution tests and the benchmark harness without
 * depending on any process-spawning machinery.
 */

export interface JsonAssert {
  path: string;
  equals?: unknown;
  matches?: string;
  gt?: number;
  lt?: number;
  arrayLength?: number;
}

export interface BehaviorAssert {
  exitCode?: number;
  stdoutContains?: string[];
  stdoutRegex?: string;
  stdinLines?: string[];
  jsonInOutput?: JsonAssert[];
}

export interface BehaviorResult {
  pass: boolean;
  failures: string[];
}

/** Case/type-aware equality: numeric literals compare numerically, objects deeply. */
function looseEquals(actual: unknown, expected: unknown): boolean {
  if (typeof actual === 'number' && typeof expected === 'number') return actual === expected;
  if (typeof actual === 'object' && actual !== null && typeof expected === 'object' && expected !== null) {
    return JSON.stringify(actual) === JSON.stringify(expected);
  }
  return actual === expected;
}

/** Resolves `items.0.name`, `items.length`, etc. Returns undefined on missing keys. */
export function getJsonPath(root: unknown, path: string): unknown {
  let cur = root;
  for (const key of path.split('.')) {
    if (cur === null || cur === undefined) return undefined;
    if (key === 'length') {
      cur = Array.isArray(cur) || typeof cur === 'string' ? (cur as { length: number }).length : undefined;
      continue;
    }
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/**
 * Extracts a JSON document from program output: parses the whole output first,
 * then scans every `{...}` block (in size order) and returns the largest one
 * that actually parses. This is robust to logs that themselves contain JSON
 * (e.g. `Order details: {"a":1}` printed before the real payload) — the naive
 * "first { to last }" slice breaks on the first embedded object and produces a
 * false "not valid JSON" even when the payload is fine.
 */
export function extractJson(output: string): unknown | null {
  const t = output.trim();
  if (!t) return null;
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      return JSON.parse(t);
    } catch {
      // fall through to block extraction
    }
  }
  // Collect every `{...}` block by brace matching, longest first.
  const blocks: string[] = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i] !== '{') continue;
    let depth = 0;
    for (let j = i; j < t.length; j++) {
      const c = t[j];
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          blocks.push(t.slice(i, j + 1));
          break;
        }
      }
    }
  }
  blocks.sort((a, b) => b.length - a.length);
  for (const block of blocks) {
    try {
      return JSON.parse(block);
    } catch {
      // try the next block
    }
  }
  return null;
}

export function evaluateBehavior(
  stdout: string,
  stderr: string,
  exitCode: number | null,
  assert: BehaviorAssert
): BehaviorResult {
  const output = `${stdout}\n${stderr}`.trim();
  const failures: string[] = [];

  if (assert.exitCode !== undefined && exitCode !== assert.exitCode) {
    failures.push(`exit code ${exitCode} !== expected ${assert.exitCode}`);
  }

  for (const needle of assert.stdoutContains ?? []) {
    if (!output.includes(needle)) {
      failures.push(`stdout did not contain "${needle}"`);
    }
  }

  if (assert.stdoutRegex) {
    try {
      if (!new RegExp(assert.stdoutRegex).test(output)) {
        failures.push(`stdout did not match regex /${assert.stdoutRegex}/`);
      }
    } catch (e) {
      failures.push(`invalid stdoutRegex: ${(e as Error).message}`);
    }
  }

  if (assert.jsonInOutput && assert.jsonInOutput.length > 0) {
    const json = extractJson(output);
    if (json === null) {
      failures.push('output is not valid JSON');
    } else {
      for (const j of assert.jsonInOutput) {
        const actual = getJsonPath(json, j.path);
        if (actual === undefined) {
          failures.push(`json path "${j.path}" not found`);
          continue;
        }
        const shown = JSON.stringify(actual);
        if (j.equals !== undefined && !looseEquals(actual, j.equals)) {
          failures.push(`json path "${j.path}" expected ${JSON.stringify(j.equals)}, got ${shown}`);
        }
        if (j.matches !== undefined) {
          try {
            if (!new RegExp(j.matches).test(String(actual))) {
              failures.push(`json path "${j.path}" did not match /${j.matches}/ (got ${shown})`);
            }
          } catch (e) {
            failures.push(`invalid matches regex: ${(e as Error).message}`);
          }
        }
        if (j.gt !== undefined && !(typeof actual === 'number' && actual > j.gt)) {
          failures.push(`json path "${j.path}" expected > ${j.gt}, got ${shown}`);
        }
        if (j.lt !== undefined && !(typeof actual === 'number' && actual < j.lt)) {
          failures.push(`json path "${j.path}" expected < ${j.lt}, got ${shown}`);
        }
        if (j.arrayLength !== undefined && !(Array.isArray(actual) && actual.length === j.arrayLength)) {
          failures.push(`json path "${j.path}" expected array length ${j.arrayLength}, got ${Array.isArray(actual) ? actual.length : shown}`);
        }
        if (
          j.equals === undefined &&
          j.matches === undefined &&
          j.gt === undefined &&
          j.lt === undefined &&
          j.arrayLength === undefined
        ) {
          failures.push(`json path "${j.path}" has no assertion comparator`);
        }
      }
    }
  }

  return { pass: failures.length === 0, failures };
}
