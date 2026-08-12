/**
 * IPL v1.0 Semantic analyzer — soft advisory cross-reference checks on top of
 * the typed AST produced by iplParser.ts (Milestone 3).
 *
 * Same "rails, not walls" principle as the parser: every diagnostic is
 * `info` or `warning` and NEVER blocks generation. These checks only surface
 * likely issues; the LLM remains the final interpreter of ambiguity.
 *
 * Checks (all advisory):
 *   - warning: duplicate top-level declaration of the same name.
 *   - info:    unknown intent type in `add entity` / `add module` fields.
 *   - info:    external data access (`read`/`search`/`send`/`remove`/`compute`)
 *              inside a `listen` body that is not wrapped in try/catch.
 *   - info:    `set <name>.field = ...` where `<name>` is neither declared nor
 *              produced anywhere in the spec.
 */
import { parseIPL } from './iplParser.ts';
import { IPL_INTENT_TYPES } from './iplCore.ts';
import type { IPLExpr, IPLProgram, IPLStatement, SyntaxErrorItem } from './iplParser.ts';

const INTENT_TYPE_NAMES = new Set(IPL_INTENT_TYPES.map(t => t.name.replace(/\(.*\)$/, '')));

const IO_VERBS = new Set(['read', 'search', 'send', 'remove', 'compute']);

function isIdentifier(expr: IPLExpr | null | undefined): expr is Extract<IPLExpr, { kind: 'identifier' }> {
  return !!expr && expr.kind === 'identifier';
}

/** Resolves `user.profile.name` down to the root object name (`user`). */
function rootObjectName(expr: IPLExpr | null | undefined): string | null {
  if (!expr) return null;
  let cur: IPLExpr = expr;
  while (cur.kind === 'member') cur = cur.object;
  return cur.kind === 'identifier' ? cur.name : null;
}

function walkStatements(stmts: IPLStatement[], visit: (stmt: IPLStatement, depth: number) => void, depth = 0): void {
  for (const s of stmts) {
    visit(s, depth);
    walkStatements(s.body, visit, depth + 1);
    walkStatements(s.elseBody ?? [], visit, depth + 1);
    walkStatements(s.catchBody ?? [], visit, depth + 1);
  }
}

/** Verifies `add entity` / `add module` fields use only the 7 intent types. */
function checkIntentTypes(stmt: IPLStatement, out: SyntaxErrorItem[]): void {
  for (const prop of stmt.props) {
    if (isIdentifier(prop.value) && !INTENT_TYPE_NAMES.has(prop.value.name)) {
      out.push({
        line: prop.value.line,
        column: prop.value.column,
        message: `Unknown intent type "${prop.value.name}" for field "${prop.key}". Expected one of: text, number, boolean, id, date, options, list.`,
        severity: 'info',
        endColumn: prop.value.endColumn,
        fix: {
          label: `Replace "${prop.value.name}" with "text"`,
          newText: 'text',
          auto: false
        }
      });
    }
  }
}

/** Flags external data access inside a `listen` body that lacks try/catch. */
function checkListenIO(listen: IPLStatement, out: SyntaxErrorItem[]): void {
  const eventName = listen.eventName ? `"${listen.eventName}"` : '(unnamed)';
  const visit = (stmts: IPLStatement[], insideTry: boolean): void => {
    for (const s of stmts) {
      const protectedNow = insideTry || s.kind === 'try';
      if (!protectedNow && IO_VERBS.has(s.kind)) {
        out.push({
          line: s.line,
          column: s.column,
          message: `Data access ("${s.verb}") inside listen ${eventName} is not wrapped in try/catch. Wrap external reads/sends/computes to handle failures gracefully.`,
          severity: 'info'
        });
      }
      visit(s.body, protectedNow);
      visit(s.elseBody ?? [], protectedNow);
      visit(s.catchBody ?? [], protectedNow);
    }
  };
  visit(listen.body, false);
}

export function analyzeIPLProgram(program: IPLProgram): SyntaxErrorItem[] {
  const out: SyntaxErrorItem[] = [];
  const declared = new Map<string, { line: number; column: number; kind: string }>();
  const knownNames = new Set<string>();
  /** Declared entity/module field names, for `seed` cross-checks. */
  const entityFields = new Map<string, Set<string>>();

  // Pass 1 — top-level declarations and duplicate detection.
  for (const s of program.statements) {
    if (s.kind !== 'add' || !s.name) continue;
    if (declared.has(s.name)) {
      out.push({
        line: s.line,
        column: s.column,
        message: `Duplicate declaration of "${s.name}". Rename one of them; generated code collides on this name.`,
        severity: 'warning'
      });
    }
    declared.set(s.name, { line: s.line, column: s.column, kind: s.entityKind ?? 'view' });
    knownNames.add(s.name);
    const keys = new Set(s.props.map(p => p.key).filter(Boolean));
    if (keys.size > 0) entityFields.set(s.name, keys);
  }

  // Pass 1b — names produced anywhere in the spec (whole-program data flow).
  walkStatements(program.statements, (s) => {
    if (s.kind === 'read' || s.kind === 'compute' || s.kind === 'search') {
      if (isIdentifier(s.target)) knownNames.add(s.target.name);
    } else if (s.kind === 'for' && isIdentifier(s.item)) {
      knownNames.add(s.item.name);
    }
  });

  // Pass 2 — advisory cross-reference checks.
  walkStatements(program.statements, (s) => {
    if (s.kind === 'add' && (s.entityKind === 'entity' || s.entityKind === 'module')) {
      checkIntentTypes(s, out);
    }
    if (s.kind === 'seed') {
      const ent = s.seedEntity;
      const fields = ent ? entityFields.get(ent) : undefined;
      if (ent && !entityFields.has(ent)) {
        out.push({
          line: s.line,
          column: s.column,
          message: `"seed ${ent} ${s.name ?? '...'}" references an unknown entity. Declare it first with: add entity ${ent} { field: type, ... }.`,
          severity: 'info'
        });
      } else if (ent && fields) {
        for (const p of s.props) {
          if (p.key && !fields.has(p.key)) {
            out.push({
              line: p.line,
              column: p.column,
              message: `Field "${p.key}" is not declared on entity "${ent}". Declared fields: ${[...fields].join(', ') || '(none)'}.`,
              severity: 'info'
            });
          }
        }
      }
    }
    if (s.kind === 'set') {
      const base = rootObjectName(s.target);
      if (base && !knownNames.has(base)) {
        out.push({
          line: s.line,
          column: s.column,
          message: `Setting a field on "${base}", which is never declared or produced anywhere in this spec.`,
          severity: 'info'
        });
      }
    }
  });

  for (const s of program.statements) {
    if (s.kind === 'listen') checkListenIO(s, out);
  }

  return out;
}

/** Parses the source and returns only the semantic (advisory) diagnostics. */
export function analyzeIPLSemantics(code: string): SyntaxErrorItem[] {
  const { ast } = parseIPL(code);
  return analyzeIPLProgram(ast);
}
