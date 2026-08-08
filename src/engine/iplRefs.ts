/**
 * IPL v1.0 semantic reference index (Phase 6 — Semantic UX).
 *
 * Builds a deterministic symbol table for go-to-definition over the three
 * reference kinds the language produces:
 *   - declared:  `add entity|module|view <name>`
 *   - produced:  `read|remove|search|send|compute <name>`, `for <item> in ...`
 *   - event:     `listen event on "<name>"`
 *
 * Resolution is deliberately word-scoped so field/property references
 * (`totalAmount`, `status`, ...) never resolve — no false positives.
 */
import type { IPLBlockNode } from './iplParser.ts';

export type IPLSymbolKind = 'declared' | 'produced' | 'event';

export interface IPLRefLocation {
  kind: IPLSymbolKind;
  name: string;
  line: number;
  column: number;
  endColumn: number;
  verb: string;
}

export interface IPLRefIndex {
  byName: Map<string, IPLRefLocation[]>;
}

const NAME_SRC = '[A-Za-z_][A-Za-z0-9_]*';

const DECLARED_RE = new RegExp(`^\\s*add\\s+(?:(entity|module|view)\\s+)?(${NAME_SRC})`);
const PRODUCED_TARGET_RE = new RegExp(`^\\s*(read|remove|search|send|compute)\\s+(${NAME_SRC})`);
const FOR_ITEM_RE = new RegExp(`^\\s*for\\s+(${NAME_SRC})\\s+in\\b`);
const EVENT_RE = /^\s*listen\s+event\s+on\s+["']([^"']+)["']/;

/** Extracts the referenced symbol name from a statement header, or null. */
export function extractStatementName(headerText: string): string | null {
  const trimmed = headerText.trim().replace(/\{\s*$/, '').trim();

  const declared = DECLARED_RE.exec(trimmed);
  if (declared) return declared[2] ?? declared[1];

  const produced = PRODUCED_TARGET_RE.exec(trimmed);
  if (produced) return produced[2];

  const forItem = FOR_ITEM_RE.exec(trimmed);
  if (forItem) return forItem[1];

  const event = EVENT_RE.exec(trimmed);
  if (event) return event[1];

  const setTarget = /^set\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(trimmed);
  if (setTarget) return setTarget[1];

  return null;
}

/** Records one location into the index (kept sorted: declared, produced, event). */
function record(index: IPLRefIndex, loc: IPLRefLocation): void {
  const list = index.byName.get(loc.name) ?? [];
  list.push(loc);
  index.byName.set(loc.name, list);
}

/**
 * Scans IPL source and builds the reference index. Property fields and
 * non-statement lines never enter the index.
 */
export function buildIPLRefIndex(code: string): IPLRefIndex {
  const index: IPLRefIndex = { byName: new Map() };
  const lines = code.split('\n');

  for (let l = 0; l < lines.length; l++) {
    const line = lines[l];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) continue;

    const nameOffsetInMatch = (m: RegExpExecArray, name: string): number =>
      m.index + m[0].lastIndexOf(name) + 1;

    const declared = DECLARED_RE.exec(line);
    if (declared) {
      const name = declared[2] ?? declared[1];
      record(index, {
        kind: 'declared',
        name,
        line: l + 1,
        column: nameOffsetInMatch(declared, name),
        endColumn: nameOffsetInMatch(declared, name) + name.length,
        verb: 'add'
      });
      continue;
    }

    const produced = PRODUCED_TARGET_RE.exec(line);
    if (produced) {
      const name = produced[2];
      record(index, {
        kind: 'produced',
        name,
        line: l + 1,
        column: nameOffsetInMatch(produced, name),
        endColumn: nameOffsetInMatch(produced, name) + name.length,
        verb: produced[1]
      });
      continue;
    }

    const forItem = FOR_ITEM_RE.exec(line);
    if (forItem) {
      const name = forItem[1];
      record(index, {
        kind: 'produced',
        name,
        line: l + 1,
        column: nameOffsetInMatch(forItem, name),
        endColumn: nameOffsetInMatch(forItem, name) + name.length,
        verb: 'for'
      });
      continue;
    }

    const event = EVENT_RE.exec(line);
    if (event) {
      const name = event[1];
      record(index, {
        kind: 'event',
        name,
        line: l + 1,
        column: nameOffsetInMatch(event, name),
        endColumn: nameOffsetInMatch(event, name) + name.length,
        verb: 'listen'
      });
    }
  }

  return index;
}

/**
 * Extracts the identifier (or quoted string content) under a 1-based
 * (line, column) position — quoted event names like `"checkout:completed"`
 * resolve as a whole, plain words resolve as identifiers.
 */
export function extractReferenceAt(code: string, line: number, column: number): string | null {
  const lines = code.split('\n');
  if (line < 1 || line > lines.length) return null;
  const text = lines[line - 1];
  const col = Math.max(0, Math.min(text.length, column - 1));

  // Inside a quoted string? Return the whole content.
  for (let open = 0; open < text.length; open++) {
    const q = text[open];
    if (q !== '"' && q !== "'") continue;
    const close = text.indexOf(q, open + 1);
    if (close === -1) continue;
    if (open <= col && col < close) return text.slice(open + 1, close);
  }

  if (!/[A-Za-z_]/.test(text[col] ?? '')) return null;
  let start = col;
  while (start > 0 && /[A-Za-z0-9_]/.test(text[start - 1])) start--;
  let end = col;
  while (end < text.length && /[A-Za-z0-9_]/.test(text[end])) end++;
  return text.slice(start, end) || null;
}

/** Preferred-kind ordering for definition lookup (declared wins over produced/event). */
const KIND_PRIORITY: Record<IPLSymbolKind, number> = { declared: 0, produced: 1, event: 2 };

/**
 * Phase 6 go-to-definition: resolves the symbol under (line, column) to its
 * defining location, or null when the reference is a field/unknown word.
 */
export function resolveIPLDefinition(code: string, line: number, column: number): IPLRefLocation | null {
  const name = extractReferenceAt(code, line, column);
  if (!name) return null;
  const index = buildIPLRefIndex(code);
  const locs = index.byName.get(name);
  if (!locs || locs.length === 0) return null;
  return locs.slice().sort((a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind])[0];
}

/**
 * Phase 6 block-tree annotation: attaches a semantic state to every node that
 * references a symbol — `declared`, `produced`, or `unknown` when the verb
 * expects a symbol that the index cannot find. Returns a new tree.
 */
export function annotateBlockNodes(nodes: IPLBlockNode[], code: string): IPLBlockNode[] {
  const index = buildIPLRefIndex(code);

  const visit = (node: IPLBlockNode): IPLBlockNode => {
    const cloned: IPLBlockNode = { ...node, children: node.children.map(visit) };
    const name = extractStatementName(node.headerText);
    if (!name) return cloned;

    const locs = index.byName.get(name);
    if (locs && locs.some(l => l.kind === 'declared')) cloned.semanticState = 'declared';
    else if (locs && locs.some(l => l.kind === 'produced' || l.kind === 'event')) cloned.semanticState = 'produced';
    else if (node.verbName && EXPECTS_SYMBOL.has(node.verbName)) cloned.semanticState = 'unknown';

    return cloned;
  };

  return nodes.map(visit);
}

const EXPECTS_SYMBOL = new Set([
  'add', 'read', 'remove', 'search', 'send', 'compute', 'set', 'listen', 'for'
]);
