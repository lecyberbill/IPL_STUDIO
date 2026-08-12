/**
 * IPL v1.0 Parser — typed AST + soft diagnostics.
 *
 * Design principle ("rails, not walls"):
 *   - The parser NEVER blocks anything. Diagnostics are advisory only and use
 *     the severities `info` or `warning` (never `error`).
 *   - Free-form, natural-language intent statements are legal IPL: anything
 *     that is not a recognized verb is parsed as a `generic` statement instead
 *     of being rejected.
 *   - Most diagnostics carry an optional `fix` (label + replacement text) that
 *     editors can surface as quick fixes.
 *
 * The block view (`parseIPLToTree`) and the store's `validateIPLCode` are both
 * reimplemented on top of this same tokenizer + parser so that every consumer
 * shares one source of truth.
 */
import { IPL_VERBS } from './iplCore.ts';

export type IPLSeverity = 'info' | 'warning';

export interface IPLQuickFix {
  label: string;
  newText: string;
  /** When false, the fix is actionable in the editor but NOT auto-applied by
   *  the deterministic pre-generation repair (lossy/guessed edits). */
  auto?: boolean;
}

export interface IPLDiagnostic {
  line: number;
  column: number;
  endColumn: number;
  severity: IPLSeverity;
  message: string;
  fix?: IPLQuickFix;
}

/** Backwards-compatible shape for the store's `syntaxErrors` field. */
export interface SyntaxErrorItem {
  line: number;
  column: number;
  message: string;
  severity?: IPLSeverity;
  endColumn?: number;
  fix?: IPLQuickFix;
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

type IPTokenType =
  | 'ident'
  | 'string'
  | 'number'
  | 'op'
  | 'newline'
  | 'eof'
  | 'lbrace'
  | 'rbrace'
  | 'lparen'
  | 'rparen'
  | 'lbracket'
  | 'rbracket'
  | 'comma'
  | 'colon'
  | 'dot'
  | 'semi'
  | 'punct';

interface IPToken {
  type: IPTokenType;
  value: string;
  line: number;
  column: number;
  endColumn: number;
}

const PUNCT_MAP: Record<string, IPTokenType> = {
  '{': 'lbrace',
  '}': 'rbrace',
  '(': 'lparen',
  ')': 'rparen',
  '[': 'lbracket',
  ']': 'rbracket',
  ',': 'comma',
  ':': 'colon',
  '.': 'dot',
  ';': 'semi'
};

const TWO_CHAR_OPS = ['==', '!=', '>=', '<=', '&&', '||'];
const ONE_CHAR_OPS = ['=', '<', '>', '+', '-', '*', '/', '!'];

function tokenize(source: string): { tokens: IPToken[]; diagnostics: IPLDiagnostic[] } {
  const tokens: IPToken[] = [];
  const diagnostics: IPLDiagnostic[] = [];
  const len = source.length;
  let i = 0;
  let line = 1;
  let col = 1;

  const push = (type: IPTokenType, value: string, startLine: number, startCol: number) => {
    tokens.push({ type, value, line: startLine, column: startCol, endColumn: startCol + value.length });
  };

  while (i < len) {
    const ch = source[i];

    if (ch === ' ' || ch === '\t' || ch === '\r') {
      i++;
      col++;
      continue;
    }

    if (ch === '\n') {
      tokens.push({ type: 'newline', value: '\n', line, column: col, endColumn: col + 1 });
      i++;
      line++;
      col = 1;
      continue;
    }

    // Line comment
    if (ch === '/' && source[i + 1] === '/') {
      while (i < len && source[i] !== '\n') {
        i++;
        col++;
      }
      continue;
    }

    // Block comment
    if (ch === '/' && source[i + 1] === '*') {
      const startLine = line;
      const startCol = col;
      i += 2;
      col += 2;
      while (i < len && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') {
          line++;
          col = 1;
        } else {
          col++;
        }
        i++;
      }
      if (i < len) {
        i += 2;
        col += 2;
      } else {
        diagnostics.push({
          line: startLine,
          column: startCol,
          endColumn: startCol + 2,
          severity: 'warning',
          message: 'Unterminated block comment. Add a closing "*/".'
        });
      }
      continue;
    }

    // String literal
    if (ch === '"' || ch === "'") {
      const quote = ch;
      const startLine = line;
      const startCol = col;
      const startI = i;
      i++;
      col++;
      let closed = false;
      while (i < len) {
        const c = source[i];
        if (c === '\\') {
          i += 2;
          col += 2;
          continue;
        }
        if (c === quote) {
          i++;
          col++;
          closed = true;
          break;
        }
        if (c === '\n') {
          line++;
          col = 1;
        } else {
          col++;
        }
        i++;
      }
      const raw = source.slice(startI, i);
      push('string', raw, startLine, startCol);
      if (!closed) {
        diagnostics.push({
          line: startLine,
          column: startCol,
          endColumn: startCol + raw.length,
          severity: 'warning',
          message: 'Unterminated string literal. Add a closing quote.',
          fix: { label: 'Close the string', newText: `${raw}"` }
        });
      }
      continue;
    }

    // Hex number
    if (ch === '0' && (source[i + 1] === 'x' || source[i + 1] === 'X')) {
      const startLine = line;
      const startCol = col;
      const startI = i;
      i += 2;
      col += 2;
      while (i < len && /[0-9a-fA-F]/.test(source[i])) {
        i++;
        col++;
      }
      push('number', source.slice(startI, i), startLine, startCol);
      continue;
    }

    // Decimal number
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(source[i + 1] ?? ''))) {
      const startLine = line;
      const startCol = col;
      const startI = i;
      while (i < len && /[0-9]/.test(source[i])) {
        i++;
        col++;
      }
      if (source[i] === '.') {
        i++;
        col++;
        while (i < len && /[0-9]/.test(source[i])) {
          i++;
          col++;
        }
      }
      if (source[i] === 'e' || source[i] === 'E') {
        i++;
        col++;
        if (source[i] === '+' || source[i] === '-') {
          i++;
          col++;
        }
        while (i < len && /[0-9]/.test(source[i])) {
          i++;
          col++;
        }
      }
      push('number', source.slice(startI, i), startLine, startCol);
      continue;
    }

    // Identifier / keyword
    if (/[A-Za-z_$]/.test(ch)) {
      const startLine = line;
      const startCol = col;
      const startI = i;
      while (i < len && /[\w$]/.test(source[i])) {
        i++;
        col++;
      }
      push('ident', source.slice(startI, i), startLine, startCol);
      continue;
    }

    // Multi-char operators
    const two = source.slice(i, i + 2);
    if (TWO_CHAR_OPS.includes(two)) {
      push('op', two, line, col);
      i += 2;
      col += 2;
      continue;
    }

    // Single-char operators
    if (ONE_CHAR_OPS.includes(ch)) {
      push('op', ch, line, col);
      i++;
      col++;
      continue;
    }

    // Punctuation
    if (PUNCT_MAP[ch]) {
      push(PUNCT_MAP[ch], ch, line, col);
      i++;
      col++;
      continue;
    }

    // Any other character: tolerate it as punctuation
    push('punct', ch, line, col);
    i++;
    col++;
  }

  tokens.push({ type: 'eof', value: '<eof>', line, column: col, endColumn: col });
  return { tokens, diagnostics };
}

// ---------------------------------------------------------------------------
// AST
// ---------------------------------------------------------------------------

export type IPLExpr =
  | {
      kind: 'literal';
      value: string | number | boolean;
      raw: string;
      line: number;
      column: number;
      endColumn: number;
    }
  | { kind: 'identifier'; name: string; raw: string; line: number; column: number; endColumn: number }
  | { kind: 'member'; object: IPLExpr; property: string; raw: string; line: number; column: number; endColumn: number }
  | {
      kind: 'binary';
      op: string;
      left: IPLExpr;
      right: IPLExpr;
      raw: string;
      line: number;
      column: number;
      endColumn: number;
    }
  | { kind: 'unary'; op: string; operand: IPLExpr; raw: string; line: number; column: number; endColumn: number }
  | { kind: 'call'; callee: string; args: IPLExpr[]; raw: string; line: number; column: number; endColumn: number }
  | { kind: 'array'; items: IPLExpr[]; raw: string; line: number; column: number; endColumn: number };

export interface IPLProperty {
  key: string;
  value: IPLExpr | null;
  line: number;
  column: number;
  raw: string;
}

export type IPLStatementKind =
  | 'add'
  | 'seed'
  | 'read'
  | 'set'
  | 'remove'
  | 'search'
  | 'send'
  | 'listen'
  | 'compute'
  | 'if'
  | 'for'
  | 'try'
  | 'return'
  | 'generic';

export interface IPLStatement {
  kind: IPLStatementKind;
  verb: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  raw: string;
  header: string;
  name?: string;
  entityKind?: 'entity' | 'module' | 'view';
  /** For `seed <Entity> <instance> { ... }`: the entity being instanced. */
  seedEntity?: string;
  target?: IPLExpr;
  source?: IPLExpr;
  payload?: IPLExpr;
  recipient?: IPLExpr;
  condition?: IPLExpr;
  item?: IPLExpr;
  collection?: IPLExpr;
  value?: IPLExpr;
  eventName?: string;
  catchVar?: string;
  props: IPLProperty[];
  body: IPLStatement[];
  elseBody?: IPLStatement[];
  catchBody?: IPLStatement[];
  hasBlock: boolean;
}

export interface IPLProgram {
  statements: IPLStatement[];
  raw: string;
}

export interface IPLParseResult {
  ast: IPLProgram;
  diagnostics: IPLDiagnostic[];
}

/** Block-tree node shared with the visual editor. */
export interface IPLBlockNode {
  id: string;
  verbName?: string;
  category: 'data' | 'action' | 'control' | 'flow' | 'expression';
  headerText: string;
  children: IPLBlockNode[];
  /** Phase 6 — semantic state of the node's target symbol, when determinable. */
  semanticState?: 'declared' | 'produced' | 'unknown';
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

const VERB_SET: Record<string, true> = {};
for (const v of IPL_VERBS) {
  VERB_SET[v.name] = true;
}

const BINARY_PRECEDENCE: Record<string, number> = {
  '||': 1,
  '&&': 2,
  '==': 3,
  '!=': 3,
  '<': 4,
  '>': 4,
  '<=': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6
};

function unquote(raw: string): string {
  if (raw.length < 2) return raw;
  return raw.slice(1, -1).replace(/\\(["'\\])/g, '$1');
}

function stripOuterParens(tokens: IPToken[]): IPToken[] {
  let result = tokens;
  while (result.length >= 2 && result[0].type === 'lparen' && result[result.length - 1].type === 'rparen') {
    result = result.slice(1, -1);
  }
  return result;
}

function computeLineStarts(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

class IPLParserImpl {
  private source: string;
  private tokens: IPToken[];
  private idx = 0;
  private last: IPToken | null = null;
  diagnostics: IPLDiagnostic[];
  private lineStarts: number[];

  constructor(source: string, tokens: IPToken[], diagnostics: IPLDiagnostic[]) {
    this.source = source;
    this.tokens = tokens;
    this.diagnostics = diagnostics;
    this.lineStarts = computeLineStarts(source);
  }

  // ---- token stream helpers ----------------------------------------------

  private peek(offset = 0): IPToken {
    return this.tokens[Math.min(this.idx + offset, this.tokens.length - 1)];
  }

  private atEof(): boolean {
    return this.peek().type === 'eof';
  }

  private consume(): IPToken {
    const t = this.peek();
    if (t.type !== 'eof') {
      this.idx++;
      this.last = t;
    }
    return t;
  }

  private lastConsumed(): IPToken {
    return this.last ?? this.peek();
  }

  private skipNewlines(): void {
    while (this.peek().type === 'newline') {
      this.idx++;
    }
  }

  // ---- position / text helpers -------------------------------------------

  private offset(line: number, column: number): number {
    return (this.lineStarts[line - 1] ?? 0) + (column - 1);
  }

  private tokensToText(tokens: IPToken[]): string {
    if (!tokens.length) return '';
    const first = tokens[0];
    const last = tokens[tokens.length - 1];
    return this.source
      .slice(this.offset(first.line, first.column), this.offset(last.line, last.endColumn))
      .trim();
  }

  private diag(
    severity: IPLSeverity,
    message: string,
    line: number,
    column: number,
    endColumn: number,
    fix?: IPLQuickFix
  ): void {
    this.diagnostics.push({ line, column, endColumn, severity, message, fix });
  }

  private unclosedBlockDiag(): IPLDiagnostic {
    const lastLineStart = this.lineStarts[this.lineStarts.length - 1];
    const line = this.lineStarts.length;
    const column = this.source.length - lastLineStart + 1;
    return {
      line,
      column,
      endColumn: column + 1,
      severity: 'warning',
      message: 'Unclosed block "{". Add a closing "}" at the end of the file.',
      fix: { label: 'Insert closing brace', newText: '}' }
    };
  }

  private findKeyword(tokens: IPToken[], keyword: string): number {
    return tokens.findIndex(t => t.type === 'ident' && t.value === keyword);
  }

  // ---- entry point --------------------------------------------------------

  parse(): IPLProgram {
    const statements: IPLStatement[] = [];
    while (true) {
      this.skipNewlines();
      if (this.atEof()) break;
      const t = this.peek();
      if (t.type === 'rbrace') {
        this.consume();
        this.diag('warning', 'Unmatched closing brace "}".', t.line, t.column, t.endColumn, {
          label: 'Remove this brace',
          newText: ''
        });
        continue;
      }
      const stmt = this.parseStatement();
      if (stmt) {
        statements.push(stmt);
      } else {
        this.consume();
      }
    }
    return { statements, raw: this.source };
  }

  private parseStatement(): IPLStatement | null {
    const t = this.peek();
    if (t.type === 'eof') return null;
    if (t.type === 'newline') {
      this.skipNewlines();
      return this.parseStatement();
    }
    if (t.type === 'rbrace') return null;

    if (t.type === 'lbrace') {
      this.consume();
      this.skipNewlines();
      const inner = this.parseStatementsBlock();
      const stmt = this.makeStmt('generic', 'generic', t, []);
      stmt.hasBlock = true;
      stmt.body = inner;
      this.finishStmt(stmt, this.lastConsumed());
      return stmt;
    }

    if (t.type === 'ident') {
      const verb = t.value;
      switch (verb) {
        case 'add':
          return this.parseAdd();
        case 'seed':
          return this.parseSeed();
        case 'read':
          return this.parseTargeted('read', 'read', 'from');
        case 'set':
          return this.parseSet();
        case 'remove':
          return this.parseTargeted('remove', 'remove', 'from');
        case 'search':
          return this.parseTargeted('search', 'search', 'in');
        case 'send':
          return this.parseTargeted('send', 'send', 'to');
        case 'listen':
          return this.parseListen();
        case 'compute':
          return this.parseCompute();
        case 'if':
          return this.parseIf();
        case 'for':
          return this.parseFor();
        case 'try':
          return this.parseTry();
        case 'return':
          return this.parseReturn();
        case 'else':
        case 'catch': {
          this.consume();
          this.diag('warning', `Stray "${verb}" without a matching container.`, t.line, t.column, t.endColumn, {
            label: `Remove "${verb}"`,
            newText: ''
          });
          return null;
        }
        default:
          return this.parseGeneric();
      }
    }

    return this.parseGeneric();
  }

  // ---- statement builders -------------------------------------------------

  private makeStmt(kind: IPLStatementKind, verb: string, startTok: IPToken, headerToks: IPToken[]): IPLStatement {
    const lastHeader = headerToks.length ? headerToks[headerToks.length - 1] : startTok;
    return {
      kind,
      verb,
      line: startTok.line,
      column: startTok.column,
      endLine: lastHeader.line,
      endColumn: lastHeader.endColumn,
      header: this.tokensToText(headerToks),
      raw: '',
      props: [],
      body: [],
      hasBlock: false
    };
  }

  private finishStmt(stmt: IPLStatement, endTok: IPToken): void {
    stmt.endLine = endTok.line;
    stmt.endColumn = endTok.endColumn;
    stmt.raw = this.source
      .slice(this.offset(stmt.line, stmt.column), this.offset(endTok.line, endTok.endColumn))
      .trim();
  }

  private consumeHeaderTokens(): IPToken[] {
    const toks: IPToken[] = [];
    while (true) {
      const t = this.peek();
      if (t.type === 'eof' || t.type === 'newline' || t.type === 'lbrace' || t.type === 'rbrace') break;
      toks.push(this.consume());
    }
    return toks;
  }

  // ---- block parsing ------------------------------------------------------

  private parsePropsOrBlock(stmt: IPLStatement): void {
    this.skipNewlines();
    if (this.peek().type !== 'lbrace') return;
    this.consume();
    stmt.hasBlock = true;
    this.skipNewlines();
    if (this.peek().type === 'rbrace') {
      this.consume();
      return;
    }
    if (this.looksLikeStatementBlock()) {
      stmt.body = this.parseStatementsBlock();
    } else {
      stmt.props = this.parsePropsUntilRbrace();
    }
  }

  private looksLikeStatementBlock(): boolean {
    const t = this.peek();
    if (t.type !== 'ident') return false;
    return !!VERB_SET[t.value] || t.value === 'else' || t.value === 'catch';
  }

  private parseStatementsBlock(): IPLStatement[] {
    const stmts: IPLStatement[] = [];
    while (true) {
      this.skipNewlines();
      const t = this.peek();
      if (t.type === 'rbrace') {
        this.consume();
        break;
      }
      if (t.type === 'eof') {
        this.diagnostics.push(this.unclosedBlockDiag());
        break;
      }
      if (t.type === 'lbrace') {
        this.consume();
        this.skipNewlines();
        stmts.push(...this.parseStatementsBlock());
        continue;
      }
      const s = this.parseStatement();
      if (s) {
        stmts.push(s);
      } else {
        this.consume();
      }
    }
    return stmts;
  }

  private parsePropsUntilRbrace(): IPLProperty[] {
    const props: IPLProperty[] = [];
    while (true) {
      this.skipNewlines();
      const t = this.peek();
      if (t.type === 'rbrace') {
        this.consume();
        break;
      }
      if (t.type === 'eof') {
        this.diagnostics.push(this.unclosedBlockDiag());
        break;
      }
      if (t.type === 'comma' || t.type === 'newline') {
        this.consume();
        continue;
      }

      if (t.type === 'ident' && this.peek(1).type === 'colon') {
        const keyTok = this.consume();
        this.consume(); // ':'
        const valueToks: IPToken[] = [];
        let depth = 0;
        while (true) {
          const v = this.peek();
          if (v.type === 'eof') break;
          if (depth === 0 && (v.type === 'newline' || v.type === 'comma' || v.type === 'rbrace')) break;
          if (v.type === 'lparen' || v.type === 'lbracket' || v.type === 'lbrace') depth++;
          if (v.type === 'rparen' || v.type === 'rbracket' || v.type === 'rbrace') {
            depth--;
            if (depth < 0) break;
          }
          valueToks.push(this.consume());
        }
        const valueExpr = valueToks.length ? (this.parseExprFromTokens(valueToks) ?? null) : null;
        props.push({
          key: keyTok.value,
          value: valueExpr,
          line: keyTok.line,
          column: keyTok.column,
          raw: valueToks.length ? this.tokensToText([keyTok, ...valueToks]) : keyTok.value
        });
      } else {
        // Free-form intent line inside a block
        const toks: IPToken[] = [];
        while (true) {
          const v = this.peek();
          if (v.type === 'eof') break;
          if (v.type === 'newline' || v.type === 'comma' || v.type === 'rbrace') break;
          toks.push(this.consume());
        }
        if (toks.length) {
          props.push({ key: '', value: null, line: t.line, column: t.column, raw: this.tokensToText(toks) });
        }
      }
    }
    return props;
  }

  // ---- expression parsing -------------------------------------------------

  private parseExprFromTokens(tokens: IPToken[]): IPLExpr | undefined {
    if (!tokens.length) return undefined;
    let pos = 0;

    const peek = (offset = 0): IPToken => tokens[Math.min(pos + offset, tokens.length - 1)];
    const atEnd = (): boolean => pos >= tokens.length;

    const parsePrimary = (): IPLExpr | null => {
      const t = peek();
      if (t.type === 'number') {
        pos++;
        return { kind: 'literal', value: Number(t.value), raw: t.value, line: t.line, column: t.column, endColumn: t.endColumn };
      }
      if (t.type === 'string') {
        pos++;
        return { kind: 'literal', value: unquote(t.value), raw: t.value, line: t.line, column: t.column, endColumn: t.endColumn };
      }
      if (t.type === 'ident') {
        pos++;
        if (peek().type === 'lparen') {
          pos++;
          const args: IPLExpr[] = [];
          while (!atEnd() && peek().type !== 'rparen') {
            const arg = parseBinary(1);
            if (!arg) {
              pos++;
              break;
            }
            args.push(arg);
            if (peek().type === 'comma') pos++;
            else break;
          }
          if (peek().type === 'rparen') pos++;
          const last = args.length ? args[args.length - 1] : t;
          return { kind: 'call', callee: t.value, args, raw: '', line: t.line, column: t.column, endColumn: last.endColumn };
        }
        let obj: IPLExpr = { kind: 'identifier', name: t.value, raw: t.value, line: t.line, column: t.column, endColumn: t.endColumn };
        while (peek().type === 'dot') {
          pos++;
          const prop = peek();
          if (prop.type !== 'ident') break;
          pos++;
          obj = { kind: 'member', object: obj, property: prop.value, raw: '', line: t.line, column: t.column, endColumn: prop.endColumn };
        }
        return obj;
      }
      if (t.type === 'op' && (t.value === '!' || t.value === '-')) {
        pos++;
        const operand = parseBinary(1);
        if (!operand) return null;
        return { kind: 'unary', op: t.value, operand, raw: '', line: t.line, column: t.column, endColumn: operand.endColumn };
      }
      if (t.type === 'lparen') {
        pos++;
        const inner = parseBinary(1);
        if (peek().type === 'rparen') pos++;
        return inner;
      }
      if (t.type === 'lbracket') {
        pos++;
        const items: IPLExpr[] = [];
        while (!atEnd() && peek().type !== 'rbracket') {
          const item = parseBinary(1);
          if (!item) {
            pos++;
            break;
          }
          items.push(item);
          if (peek().type === 'comma') pos++;
          else break;
        }
        if (peek().type === 'rbracket') pos++;
        const last = items.length ? items[items.length - 1] : t;
        return { kind: 'array', items, raw: '', line: t.line, column: t.column, endColumn: last.endColumn };
      }
      return null;
    };

    const parseBinary = (minPrec: number): IPLExpr | null => {
      const parseHigher = (): IPLExpr | null => {
        if (minPrec >= 6) return parsePrimary();
        return parseBinary(minPrec + 1);
      };
      let left = parseHigher();
      while (left) {
        const t = peek();
        const prec = t.type === 'op' ? BINARY_PRECEDENCE[t.value] : undefined;
        if (prec === undefined || prec < minPrec) break;
        pos++;
        const right = parseHigher();
        if (!right) break;
        left = { kind: 'binary', op: t.value, left, right, raw: '', line: left.line, column: left.column, endColumn: right.endColumn };
      }
      return left;
    };

    const result = parseBinary(1);
    if (result) {
      result.raw = this.tokensToText(tokens);
    }
    return result ?? undefined;
  }

  // ---- per-verb statements ------------------------------------------------

  private parseAdd(): IPLStatement {
    const start = this.consume();
    const header = this.consumeHeaderTokens();
    const stmt = this.makeStmt('add', 'add', start, header);

    let i = 0;
    const kindTok = header[i];
    if (kindTok?.type === 'ident' && (kindTok.value === 'entity' || kindTok.value === 'module' || kindTok.value === 'view')) {
      stmt.entityKind = kindTok.value;
      i++;
    }
    if (header[i]?.type === 'ident') {
      stmt.name = header[i].value;
      i++;
    }
    if (i < header.length) {
      const extra = header.slice(i);
      this.diag('info', `Unexpected words after "add": "${this.tokensToText(extra)}".`, extra[0].line, extra[0].column, extra[extra.length - 1].endColumn);
    }

    this.parsePropsOrBlock(stmt);
    this.finishStmt(stmt, this.lastConsumed());
    return stmt;
  }

  /**
   * `seed <EntityName> <instanceName> { field: value, ... }` — a concrete data
   * instance (catalog / fixture). The entity name is the declared entity, the
   * instance name becomes `stmt.name`, the fields are `stmt.props`.
   */
  private parseSeed(): IPLStatement {
    const start = this.consume();
    const header = this.consumeHeaderTokens();
    const stmt = this.makeStmt('seed', 'seed', start, header);

    const entityTok = header[0];
    const nameTok = header[1];
    if (entityTok?.type === 'ident') {
      stmt.seedEntity = entityTok.value;
    } else {
      this.diag('info', '"seed" expects: seed <EntityName> <instanceName> { field: value, ... }.', start.line, start.column, start.column + 4);
    }
    if (nameTok?.type === 'ident') {
      stmt.name = nameTok.value;
    } else {
      this.diag('info', '"seed" is missing the instance name (e.g. seed Drink Espresso { basePrice: 1.50 }).', start.line, start.column, start.column + 4);
    }
    if (header.length > 2) {
      const extra = header.slice(2);
      this.diag('info', `Unexpected words in "seed": "${this.tokensToText(extra)}".`, extra[0].line, extra[0].column, extra[extra.length - 1].endColumn);
    }

    this.parsePropsOrBlock(stmt);
    this.finishStmt(stmt, this.lastConsumed());
    return stmt;
  }

  private parseTargeted(kind: 'read' | 'remove' | 'search' | 'send', verb: string, keyword: string): IPLStatement {
    const start = this.consume();
    const header = this.consumeHeaderTokens();
    const stmt = this.makeStmt(kind, verb, start, header);

    const idx = this.findKeyword(header, keyword);
    const targetToks = idx >= 0 ? header.slice(0, idx) : header;
    const otherToks = idx >= 0 ? header.slice(idx + 1) : [];

    stmt.target = this.parseExprFromTokens(targetToks);
    if (idx >= 0) {
      if (otherToks.length) {
        if (kind === 'send') stmt.recipient = this.parseExprFromTokens(otherToks);
        else stmt.source = this.parseExprFromTokens(otherToks);
      } else {
        this.diag('info', `"${verb}" has "${keyword}" but nothing after it.`, header[idx].line, header[idx].column, header[idx].endColumn);
      }
    }

    this.parsePropsOrBlock(stmt);
    this.finishStmt(stmt, this.lastConsumed());
    return stmt;
  }

  private parseSet(): IPLStatement {
    const start = this.consume();
    const header = this.consumeHeaderTokens();
    const stmt = this.makeStmt('set', 'set', start, header);

    const eq = header.findIndex(t => t.type === 'op' && t.value === '=');
    if (eq >= 0) {
      stmt.target = this.parseExprFromTokens(header.slice(0, eq));
      stmt.value = this.parseExprFromTokens(header.slice(eq + 1));
    } else {
      const insertAt = this.lastConsumed();
      stmt.target = this.parseExprFromTokens(header);
      this.diag(
        'info',
        `"set" is missing "=" for the value assignment. Insert " = " before the next token.`,
        insertAt.line,
        insertAt.endColumn,
        insertAt.endColumn,
        { label: 'Insert " = "', newText: ' = ', auto: true }
      );
    }

    this.parsePropsOrBlock(stmt);
    this.finishStmt(stmt, this.lastConsumed());
    return stmt;
  }

  private parseCompute(): IPLStatement {
    const start = this.consume();
    const header = this.consumeHeaderTokens();
    const stmt = this.makeStmt('compute', 'compute', start, header);

    const fromIdx = this.findKeyword(header, 'from');
    const nameToks = fromIdx >= 0 ? header.slice(0, fromIdx) : header;
    const sourceToks = fromIdx >= 0 ? header.slice(fromIdx + 1) : [];
    stmt.target = this.parseExprFromTokens(nameToks);
    if (fromIdx >= 0 && sourceToks.length) stmt.source = this.parseExprFromTokens(sourceToks);

    this.parsePropsOrBlock(stmt);
    this.finishStmt(stmt, this.lastConsumed());
    return stmt;
  }

  private parseListen(): IPLStatement {
    const start = this.consume();
    const header = this.consumeHeaderTokens();
    const stmt = this.makeStmt('listen', 'listen', start, header);

    let i = 0;
    if (header[i]?.type === 'ident' && header[i].value === 'event') i++;
    if (header[i]?.type === 'ident' && header[i].value === 'on') i++;
    if (header[i] && (header[i].type === 'string' || header[i].type === 'ident')) {
      stmt.eventName = header[i].type === 'string' ? unquote(header[i].value) : header[i].value;
      i++;
    }
    if (i < header.length) {
      const extra = header.slice(i);
      this.diag('info', `Unexpected words in "listen" header: "${this.tokensToText(extra)}".`, extra[0].line, extra[0].column, extra[extra.length - 1].endColumn);
    } else if (i < 3) {
      this.diag('info', `"listen" expects: listen event on "eventName".`, start.line, start.column, start.column + 6);
    }

    this.parsePropsOrBlock(stmt);
    this.finishStmt(stmt, this.lastConsumed());
    return stmt;
  }

  private parseIf(): IPLStatement {
    const start = this.consume();
    const header = this.consumeHeaderTokens();
    const stmt = this.makeStmt('if', 'if', start, header);

    stmt.condition = this.parseExprFromTokens(stripOuterParens(header));
    if (!stmt.condition) {
      this.diag('info', `The "if" block has no condition expression.`, start.line, start.column, start.column + 2);
    }

    this.skipNewlines();
    if (this.peek().type === 'lbrace') {
      this.consume();
      stmt.body = this.parseStatementsBlock();
    }

    this.skipNewlines();
    if (this.peek().type === 'ident' && this.peek().value === 'else') {
      this.consume();
      this.skipNewlines();
      if (this.peek().type === 'lbrace') {
        this.consume();
        stmt.elseBody = this.parseStatementsBlock();
      } else {
        const t = this.peek();
        this.diag('warning', `"else" is not followed by a block "{".`, t.line, t.column, t.endColumn);
      }
    }

    this.finishStmt(stmt, this.lastConsumed());
    return stmt;
  }

  private parseFor(): IPLStatement {
    const start = this.consume();
    const header = this.consumeHeaderTokens();
    const stmt = this.makeStmt('for', 'for', start, header);

    const inIdx = this.findKeyword(header, 'in');
    const itemToks = inIdx >= 0 ? header.slice(0, inIdx) : header;
    const collToks = inIdx >= 0 ? header.slice(inIdx + 1) : [];
    stmt.item = this.parseExprFromTokens(itemToks);
    if (inIdx >= 0 && collToks.length) {
      stmt.collection = this.parseExprFromTokens(collToks);
    } else {
      this.diag('info', `"for" expects: for <item> in <collection>.`, start.line, start.column, start.column + 3);
    }

    this.skipNewlines();
    if (this.peek().type === 'lbrace') {
      this.consume();
      stmt.body = this.parseStatementsBlock();
    }

    this.finishStmt(stmt, this.lastConsumed());
    return stmt;
  }

  private parseTry(): IPLStatement {
    const start = this.consume();
    const header = this.consumeHeaderTokens();
    const stmt = this.makeStmt('try', 'try', start, header);

    if (header.length) {
      this.diag('info', `Unexpected words after "try": "${this.tokensToText(header)}".`, header[0].line, header[0].column, header[header.length - 1].endColumn);
    }

    this.skipNewlines();
    if (this.peek().type === 'lbrace') {
      this.consume();
      stmt.body = this.parseStatementsBlock();
    }

    this.skipNewlines();
    if (this.peek().type === 'ident' && this.peek().value === 'catch') {
      this.consume();
      if (this.peek().type === 'lparen') {
        this.consume();
        if (this.peek().type === 'ident') {
          stmt.catchVar = this.consume().value;
        }
        if (this.peek().type === 'rparen') this.consume();
      } else if (this.peek().type === 'ident') {
        stmt.catchVar = this.consume().value;
      }
      this.skipNewlines();
      if (this.peek().type === 'lbrace') {
        this.consume();
        stmt.catchBody = this.parseStatementsBlock();
      } else {
        const t = this.peek();
        this.diag('warning', `"catch" is not followed by a block "{".`, t.line, t.column, t.endColumn);
      }
    }

    this.finishStmt(stmt, this.lastConsumed());
    return stmt;
  }

  private parseReturn(): IPLStatement {
    const start = this.consume();
    const header = this.consumeHeaderTokens();
    const stmt = this.makeStmt('return', 'return', start, header);

    if (header.length) {
      stmt.value = this.parseExprFromTokens(header);
    }

    // Object literal: return { key: value, ... }
    this.skipNewlines();
    if (this.peek().type === 'lbrace') {
      this.consume();
      stmt.hasBlock = true;
      stmt.props = this.parsePropsUntilRbrace();
    }

    this.finishStmt(stmt, this.lastConsumed());
    return stmt;
  }

  private parseGeneric(): IPLStatement {
    const start = this.peek();
    const headerToks: IPToken[] = [];
    let depth = 0;
    let hasBlock = false;

    while (true) {
      const t = this.peek();
      if (t.type === 'eof') break;
      if (depth === 0 && t.type === 'newline') break;
      if (depth === 0 && t.type === 'rbrace') break;
      this.consume();
      if (t.type === 'lbrace') {
        depth++;
        if (depth === 1) hasBlock = true;
      } else if (t.type === 'rbrace') {
        depth--;
        if (depth < 0) {
          depth = 0;
          break;
        }
      } else if (depth === 0) {
        headerToks.push(t);
      }
    }

    const stmt = this.makeStmt('generic', 'generic', start, headerToks);
    stmt.hasBlock = hasBlock;
    this.finishStmt(stmt, this.lastConsumed());
    return stmt;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function parseIPL(source: string): IPLParseResult {
  const { tokens, diagnostics } = tokenize(source);
  const parser = new IPLParserImpl(source, tokens, diagnostics);
  const ast = parser.parse();
  return { ast, diagnostics: parser.diagnostics };
}

export function validateIPLCode(code: string): SyntaxErrorItem[] {
  const { diagnostics } = parseIPL(code);
  return diagnostics.map(d => ({
    line: d.line,
    column: d.column,
    message: d.message,
    severity: d.severity,
    endColumn: d.endColumn,
    fix: d.fix
  }));
}

/**
 * Tokenizer-aware conversion of IPL source to the visual block tree.
 * Preserves the exact node semantics of the historical line-based parser while
 * being robust to braces inside strings, comments, and one-line blocks.
 */
export function parseIPLToTree(source: string): IPLBlockNode[] {
  const { tokens } = tokenize(source);
  const lineStarts = computeLineStarts(source);

  const lineTokens = new Map<number, IPToken[]>();
  for (const t of tokens) {
    if (t.type === 'newline' || t.type === 'eof') continue;
    const arr = lineTokens.get(t.line) ?? [];
    arr.push(t);
    lineTokens.set(t.line, arr);
  }
  const lineNumbers = [...lineTokens.keys()].sort((a, b) => a - b);

  const root: IPLBlockNode[] = [];
  const stack: IPLBlockNode[] = [];
  let idCounter = 0;

  for (const ln of lineNumbers) {
    const toks = lineTokens.get(ln) ?? [];
    const last = toks[toks.length - 1];

    if (toks.length === 1 && last.type === 'rbrace') {
      if (stack.length > 0) stack.pop();
      continue;
    }

    const lineStart = lineStarts[ln - 1] ?? 0;
    const nextLineStart = lineStarts[ln] ?? source.length;
    const trimmed = source.slice(lineStart, nextLineStart).replace(/\r?\n$/, '').trim();
    if (!trimmed || trimmed.startsWith('//')) continue;

    const firstWord = trimmed.split(/[\s(]+/)[0];
    const foundVerb = IPL_VERBS.find(v => v.name === firstWord);
    const isContainerHeader = last.type === 'lbrace';
    const headerText = isContainerHeader ? trimmed.replace(/\{$/, '').trim() : trimmed;

    const isContinuation = /^\}\s*(else|catch)\b/.test(headerText);

    const newNode: IPLBlockNode = {
      id: `node-${Date.now()}-${idCounter++}`,
      verbName: foundVerb?.name,
      category: foundVerb ? foundVerb.category : 'expression',
      headerText,
      children: []
    };

    // A `} else` / `} catch e` line closes the nearest owning `if` / `try`
    // container (popping it off the stack), attaches itself to that owner as a
    // sibling block, and opens a new container for its own body. This keeps the
    // stack depth faithful to the source, so code that follows the
    // if/try/catch chain (e.g. a top-level `search`) does not leak inside it.
    if (isContinuation) {
      const ownerIsIf = /^\}\s*else\b/.test(headerText);
      let owner: IPLBlockNode | undefined;
      while (stack.length > 0) {
        const top = stack[stack.length - 1];
        const topIsOwner = ownerIsIf
          ? top.verbName === 'if' || /^\}\s*(else|if)/.test(top.headerText)
          : top.verbName === 'try' || /^\}\s*catch/.test(top.headerText);
        if (topIsOwner) {
          owner = stack.pop();
          break;
        }
        stack.pop();
      }

      if (owner) {
        owner.children.push(newNode);
      } else if (stack.length === 0) {
        root.push(newNode);
      } else {
        stack[stack.length - 1].children.push(newNode);
      }

      stack.push(newNode);
      continue;
    }

    if (stack.length === 0) {
      root.push(newNode);
    } else {
      stack[stack.length - 1].children.push(newNode);
    }

    if (isContainerHeader) {
      stack.push(newNode);
    }
  }

  return root;
}
