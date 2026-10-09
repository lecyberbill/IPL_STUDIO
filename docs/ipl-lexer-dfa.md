# The IPL lexer as a DFA

Phase 14 asks that the canonical IPL tokenizer be *documented as a deterministic
finite automaton*. The scanner in `src/engine/iplParser.ts` is the executable
source of truth; `src/engine/lexerDfa.ts` re-expresses the **same token language**
as an explicit DFA, and `src/engine/lexerDfa.test.ts` proves token-for-token
agreement over the corpus and a set of lexical edge cases.

> `Q` (states) and `δ` (transition function) are below. `Σ` is the character
> alphabet, partitioned into the classes the transitions read. `q0 = START`.
> Accepting states emit their token and return to `START`; comments emit nothing.

## Alphabet — character classes (`classify`)

| Class | Characters |
| :--- | :--- |
| `NL` | `\n` |
| `WS` | space, `\t`, `\r` |
| `DIGIT` | `0-9` |
| `E` | `e`, `E` |
| `IDSTART` | `[A-Za-z_$]` |
| `DOT` | `.` |
| `DQ` / `SQ` | `"` / `'` |
| `SLASH` / `STAR` | `/` / `*` |
| `SIGN` | `+`, `-` |
| `CMP` | `=`, `!`, `>`, `<` |
| `AMP` / `BAR` | `&` / `|` |
| `PUNCT` | `{ } ( ) [ ] , ; :` |
| `OTHER` | anything else |

## States `Q`

`START`, `IDENT`, `NUM_LEAD0`, `NUM_INT`, `NUM_FRAC`, `NUM_EXP`,
`NUM_EXP_SIGN`, `NUM_EXP_DIGITS`, `HEX`, `DOT_OR_FRAC`, `STR_DQ`,
`STR_DQ_ESC`, `STR_DQ_CLOSE`, `STR_SQ`, `STR_SQ_ESC`, `STR_SQ_CLOSE`,
`SLASH`, `LINE_COMMENT`, `BLOCK_COMMENT`, `BLOCK_STAR`, `BLOCK_COMMENT_END`,
`OP_EQ`, `OP_EQ2`, `OP_BANG`, `OP_BANG2`, `OP_GT`, `OP_GT2`, `OP_LT`,
`OP_LT2`, `OP_AMP`, `OP_AMP2`, `OP_BAR`, `OP_BAR2`.

## Transition function `δ` (the essential rows)

From `START` (one character is consumed; comment/whitespace rows consume and stay
in their accumulator):

| On | → | Emits |
| :--- | :--- | :--- |
| `WS` | `START` | — (skipped) |
| `NL` | `START` | `newline` |
| `IDSTART` \| `E` | `IDENT` | |
| `DIGIT 0` | `NUM_LEAD0` | |
| `DIGIT 1-9` | `NUM_INT` | |
| `DOT` | `DOT_OR_FRAC` | |
| `DQ` / `SQ` | `STR_DQ` / `STR_SQ` | |
| `SLASH` | `SLASH` | |
| `STAR` / `SIGN` | `START` | `op` (`*`, `+`, `-`) |
| `CMP` | `OP_EQ` / `OP_BANG` / `OP_GT` / `OP_LT` | |
| `AMP` / `BAR` | `OP_AMP` / `OP_BAR` | |
| `PUNCT` | `START` | mapped punct (`lbrace`…`semi`) |
| `OTHER` | `START` | `punct` |

Accumulator states (stay while the class matches; otherwise finalise):

| State | Consumes | Finalises to |
| :--- | :--- | :--- |
| `IDENT` | `IDSTART` \| `E` \| `DIGIT` | `ident` |
| `NUM_LEAD0` | `x`/`X`→`HEX`; `DIGIT`→`NUM_INT`; `DOT`→`NUM_FRAC`; `E`→`NUM_EXP` | `number` |
| `NUM_INT` | `DIGIT`→`NUM_INT`; `DOT`→`NUM_FRAC`; `E`→`NUM_EXP` | `number` |
| `NUM_FRAC` | `DIGIT`→`NUM_FRAC`; `E`→`NUM_EXP` | `number` |
| `NUM_EXP` | `SIGN`→`NUM_EXP_SIGN`; `DIGIT`→`NUM_EXP_DIGITS` | `number` |
| `NUM_EXP_SIGN` / `NUM_EXP_DIGITS` | `DIGIT` | `number` |
| `HEX` | `[0-9a-fA-F]` | `number` |
| `DOT_OR_FRAC` | `DIGIT`→`NUM_FRAC` | `dot` (`.` punct) |
| `STR_DQ` | `"`→`STR_DQ_CLOSE`; `\`→`STR_DQ_ESC`; else `STR_DQ` | `string` |
| `STR_DQ_ESC` | any (the escaped char) | back to `STR_DQ` |
| `STR_SQ`, `STR_SQ_ESC` | (mirror of `STR_DQ`) | `string` |
| `SLASH` | `/`→`LINE_COMMENT`; `*`→`BLOCK_COMMENT` | `op` `/` |
| `LINE_COMMENT` | anything except `NL` | — (skipped; `NL` ends it) |
| `BLOCK_COMMENT` | `*`→`BLOCK_STAR` | continues |
| `BLOCK_STAR` | `/`→`BLOCK_COMMENT_END`; `*`→`BLOCK_STAR`; else `BLOCK_COMMENT` | — (skipped) |
| `OP_EQ`/`OP_BANG`/`OP_GT`/`OP_LT` | `=`→`…2` | `op` (`=`… / `==`…) |
| `OP_AMP`/`OP_BAR` | `&`/`|`→`…2` | `punct` `&`/`|` … `op` `&&`/`||` |

A terminal state (`…2`, `…_CLOSE`, `BLOCK_COMMENT_END`) has no outgoing edge: it
emits and returns to `START`. At end of input the current state is finalised and
an `eof` token is emitted.

## Why it matters

This is the "determinisation" claim in miniature and on real code: the token
language is regular, so a finite table captures it exactly. The conformance test
makes that table *falsifiable* — if the canonical scanner drifts, the DFA test
fails. Positions (`line`/`column`) and the two soft diagnostics (unterminated
string / block comment) are deliberately outside the DFA; they stay the
scanner's job.
