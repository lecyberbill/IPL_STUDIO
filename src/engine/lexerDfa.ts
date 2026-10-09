/**
 * IPL lexer as an explicit DFA (Phase 14).
 *
 * The canonical tokenizer lives in `iplParser.ts` (a hand-written scanner). This
 * module re-expresses the *same* token language as a deterministic finite
 * automaton: a finite set of states, a character-class alphabet, and a
 * transition function. `runLexerDfa` drives that table.
 *
 * It is not a second source of truth at runtime — `iplParser.ts` stays
 * canonical. Its purpose is to make the claim "the IPL tokenizer is a DFA"
 * machine-checkable: `lexerDfa.test.ts` asserts token-for-token agreement with
 * the canonical scanner over a corpus. Positions and the two soft diagnostics
 * (unterminated string / block comment) are intentionally out of scope here;
 * they are the canonical scanner's concern.
 *
 * The full state/transition table is documented in `docs/ipl-lexer-dfa.md`.
 */
import type { IPTokenType } from './iplParser.ts';

export type LexDfaState =
  | 'START'
  | 'IDENT'
  | 'NUM_LEAD0'
  | 'NUM_INT'
  | 'NUM_FRAC'
  | 'NUM_EXP'
  | 'NUM_EXP_SIGN'
  | 'NUM_EXP_DIGITS'
  | 'HEX'
  | 'DOT_OR_FRAC'
  | 'STR_DQ'
  | 'STR_DQ_ESC'
  | 'STR_DQ_CLOSE'
  | 'STR_SQ'
  | 'STR_SQ_ESC'
  | 'STR_SQ_CLOSE'
  | 'SLASH'
  | 'LINE_COMMENT'
  | 'BLOCK_COMMENT'
  | 'BLOCK_STAR'
  | 'BLOCK_COMMENT_END'
  | 'OP_EQ'
  | 'OP_EQ2'
  | 'OP_BANG'
  | 'OP_BANG2'
  | 'OP_GT'
  | 'OP_GT2'
  | 'OP_LT'
  | 'OP_LT2'
  | 'OP_AMP'
  | 'OP_AMP2'
  | 'OP_BAR'
  | 'OP_BAR2';

export type LexCharClass =
  | 'NL' | 'WS' | 'DIGIT' | 'E' | 'IDSTART' | 'DOT'
  | 'DQ' | 'SQ' | 'SLASH' | 'STAR' | 'SIGN' | 'CMP'
  | 'AMP' | 'BAR' | 'PUNCT' | 'OTHER';

const PUNCT_MAP: Record<string, IPTokenType> = {
  '{': 'lbrace', '}': 'rbrace', '(': 'lparen', ')': 'rparen',
  '[': 'lbracket', ']': 'rbracket', ',': 'comma', ':': 'colon',
  '.': 'dot', ';': 'semi'
};

const PUNCT_CHARS = '{}()[],;:';

export function classify(ch: string): LexCharClass {
  if (ch === '\n') return 'NL';
  if (ch === ' ' || ch === '\t' || ch === '\r') return 'WS';
  if (ch >= '0' && ch <= '9') return 'DIGIT';
  if (ch === 'e' || ch === 'E') return 'E';
  if (/[A-Za-z_$]/.test(ch)) return 'IDSTART';
  if (ch === '.') return 'DOT';
  if (ch === '"') return 'DQ';
  if (ch === "'") return 'SQ';
  if (ch === '/') return 'SLASH';
  if (ch === '*') return 'STAR';
  if (ch === '+' || ch === '-') return 'SIGN';
  if (ch === '=' || ch === '!' || ch === '>' || ch === '<') return 'CMP';
  if (ch === '&') return 'AMP';
  if (ch === '|') return 'BAR';
  if (PUNCT_CHARS.includes(ch)) return 'PUNCT';
  return 'OTHER';
}

const isHex = (ch: string): boolean => /[0-9a-fA-F]/.test(ch);

/**
 * The DFA transition function: from a state and the next character, the next
 * state — or `null` when no transition exists, which tells the driver to
 * finalise the current state's token and reprocess the character from `START`.
 */
export function nextState(state: LexDfaState, ch: string): LexDfaState | null {
  const cls = classify(ch);
  switch (state) {
    case 'IDENT':
      return cls === 'IDSTART' || cls === 'E' || cls === 'DIGIT' ? 'IDENT' : null;
    case 'NUM_LEAD0':
      if (ch === 'x' || ch === 'X') return 'HEX';
      if (cls === 'DIGIT') return 'NUM_INT';
      if (cls === 'DOT') return 'NUM_FRAC';
      if (cls === 'E') return 'NUM_EXP';
      return null;
    case 'NUM_INT':
      if (cls === 'DIGIT') return 'NUM_INT';
      if (cls === 'DOT') return 'NUM_FRAC';
      if (cls === 'E') return 'NUM_EXP';
      return null;
    case 'NUM_FRAC':
      if (cls === 'DIGIT') return 'NUM_FRAC';
      if (cls === 'E') return 'NUM_EXP';
      return null;
    case 'NUM_EXP':
      if (cls === 'SIGN') return 'NUM_EXP_SIGN';
      if (cls === 'DIGIT') return 'NUM_EXP_DIGITS';
      return null;
    case 'NUM_EXP_SIGN':
      return cls === 'DIGIT' ? 'NUM_EXP_DIGITS' : null;
    case 'NUM_EXP_DIGITS':
      return cls === 'DIGIT' ? 'NUM_EXP_DIGITS' : null;
    case 'HEX':
      return isHex(ch) ? 'HEX' : null;
    case 'DOT_OR_FRAC':
      return cls === 'DIGIT' ? 'NUM_FRAC' : null;
    case 'STR_DQ':
      if (ch === '"') return 'STR_DQ_CLOSE';
      if (ch === '\\') return 'STR_DQ_ESC';
      return 'STR_DQ';
    case 'STR_DQ_ESC':
      return 'STR_DQ';
    case 'STR_SQ':
      if (ch === "'") return 'STR_SQ_CLOSE';
      if (ch === '\\') return 'STR_SQ_ESC';
      return 'STR_SQ';
    case 'STR_SQ_ESC':
      return 'STR_SQ';
    case 'SLASH':
      if (ch === '/') return 'LINE_COMMENT';
      if (ch === '*') return 'BLOCK_COMMENT';
      return null;
    case 'LINE_COMMENT':
      return ch === '\n' ? null : 'LINE_COMMENT';
    case 'BLOCK_COMMENT':
      return ch === '*' ? 'BLOCK_STAR' : 'BLOCK_COMMENT';
    case 'BLOCK_STAR':
      if (ch === '/') return 'BLOCK_COMMENT_END';
      return ch === '*' ? 'BLOCK_STAR' : 'BLOCK_COMMENT';
    case 'OP_EQ':
      return ch === '=' ? 'OP_EQ2' : null;
    case 'OP_BANG':
      return ch === '=' ? 'OP_BANG2' : null;
    case 'OP_GT':
      return ch === '=' ? 'OP_GT2' : null;
    case 'OP_LT':
      return ch === '=' ? 'OP_LT2' : null;
    case 'OP_AMP':
      return ch === '&' ? 'OP_AMP2' : null;
    case 'OP_BAR':
      return ch === '|' ? 'OP_BAR2' : null;
    default:
      return null;
  }
}

export interface DfaToken {
  type: IPTokenType;
  value: string;
}

/** Terminal states: when reached they emit their token and return to `START`. */
function finalize(state: LexDfaState, value: string, emit: (t: DfaToken) => void): void {
  switch (state) {
    case 'IDENT': emit({ type: 'ident', value }); break;
    case 'NUM_LEAD0':
    case 'NUM_INT':
    case 'NUM_FRAC':
    case 'NUM_EXP':
    case 'NUM_EXP_SIGN':
    case 'NUM_EXP_DIGITS':
    case 'HEX': emit({ type: 'number', value }); break;
    case 'DOT_OR_FRAC': emit({ type: 'dot', value }); break;
    case 'STR_DQ':
    case 'STR_DQ_ESC':
    case 'STR_DQ_CLOSE':
    case 'STR_SQ':
    case 'STR_SQ_ESC':
    case 'STR_SQ_CLOSE': emit({ type: 'string', value }); break;
    case 'SLASH': emit({ type: 'op', value }); break;
    case 'OP_EQ': case 'OP_EQ2':
    case 'OP_BANG': case 'OP_BANG2':
    case 'OP_GT': case 'OP_GT2':
    case 'OP_LT': case 'OP_LT2':
    case 'OP_AMP2': case 'OP_BAR2': emit({ type: 'op', value }); break;
    case 'OP_AMP': case 'OP_BAR': emit({ type: 'punct', value }); break;
    default: break; // START, comments, BLOCK_COMMENT_END: emit nothing
  }
}

/** Runs the IPL lexer DFA over `input`, yielding the token stream (no positions). */
export function runLexerDfa(input: string): DfaToken[] {
  const out: DfaToken[] = [];
  const emit = (t: DfaToken): void => { out.push(t); };
  let state: LexDfaState = 'START';
  let start = 0;
  let i = 0;

  while (i < input.length) {
    const ch = input[i];
    if (state === 'START') {
      const cls = classify(ch);
      if (cls === 'WS') { i++; start = i; continue; }
      if (cls === 'NL') { emit({ type: 'newline', value: '\n' }); i++; start = i; continue; }
      if (cls === 'PUNCT') { emit({ type: PUNCT_MAP[ch] ?? 'punct', value: ch }); i++; start = i; continue; }
      if (cls === 'STAR') { emit({ type: 'op', value: '*' }); i++; start = i; continue; }
      if (cls === 'SIGN') { emit({ type: 'op', value: ch }); i++; start = i; continue; }
      if (cls === 'OTHER') { emit({ type: 'punct', value: ch }); i++; start = i; continue; }
      start = i;
      if (cls === 'IDSTART' || cls === 'E') state = 'IDENT';
      else if (cls === 'DIGIT') state = ch === '0' ? 'NUM_LEAD0' : 'NUM_INT';
      else if (cls === 'DOT') state = 'DOT_OR_FRAC';
      else if (cls === 'DQ') state = 'STR_DQ';
      else if (cls === 'SQ') state = 'STR_SQ';
      else if (cls === 'SLASH') state = 'SLASH';
      else if (cls === 'CMP') state = ch === '=' ? 'OP_EQ' : ch === '!' ? 'OP_BANG' : ch === '>' ? 'OP_GT' : 'OP_LT';
      else if (cls === 'AMP') state = 'OP_AMP';
      else if (cls === 'BAR') state = 'OP_BAR';
      i++;
      continue;
    }
    const nxt = nextState(state, ch);
    if (nxt === null) {
      finalize(state, input.slice(start, i), emit);
      state = 'START';
      continue; // reprocess `ch` from START
    }
    state = nxt;
    i++;
  }
  finalize(state, input.slice(start, i), emit);
  emit({ type: 'eof', value: '<eof>' });
  return out;
}
