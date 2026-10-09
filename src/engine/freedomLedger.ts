/**
 * The degrees-of-freedom ledger, expressed as automaton transitions (Phase 14).
 *
 * Read `docs/degrees-of-freedom.md` for the prose. The thesis is the AFN→DFA
 * determinisation result applied to generation: the model is a nondeterministic
 * intent→code automaton, and the contract layer is the subset construction that
 * absorbs that freedom into observable, deterministic accept/reject decisions.
 *
 * Concretely, each step of the pipeline is a transition labelled by WHO decides:
 *   - `model`    — free, nondeterministic (the LLM may pick any continuation),
 *   - `contract` — deterministic (a gate / oracle / delivery rule decides).
 *
 * The invariant we assert is the point of the whole product: **no accepting run
 * (a delivered artifact) can avoid a `contract` transition.** Freedom is never
 * shipped unobserved.
 */

export type LedgerActor = 'model' | 'contract';

export interface LedgerTransition {
  from: string;
  to: string;
  by: LedgerActor;
  /** What the actor decides on this edge. */
  label: string;
}

/** States of the generate→verify→repair→deliver pipeline. */
export const LEDGER_STATES = [
  'request',
  'intent',
  'topology',
  'code',
  'gated',
  'verified',
  'repaired',
  'delivered'
] as const;

export const LEDGER_START = 'request';
export const LEDGER_ACCEPT = 'delivered';

export const FREEDOM_LEDGER: LedgerTransition[] = [
  { from: 'request', to: 'intent', by: 'model', label: 'interpret the ask (any framing)' },
  { from: 'intent', to: 'topology', by: 'model', label: 'choose structure/modules' },
  { from: 'topology', to: 'code', by: 'model', label: 'choose the implementation' },
  { from: 'code', to: 'gated', by: 'contract', label: 'deterministic gates (imports, JSON, form, leaks…)' },
  { from: 'gated', to: 'repaired', by: 'contract', label: 'classify the failures to repair' },
  { from: 'repaired', to: 'code', by: 'model', label: 'redraft under the contract' },
  { from: 'gated', to: 'verified', by: 'contract', label: 'behavioral oracle + semantic receipt' },
  { from: 'verified', to: 'delivered', by: 'contract', label: 'delivery rule (which files ship)' }
];

/** Outgoing transitions of a state. */
export function outgoing(state: string, transitions = FREEDOM_LEDGER): LedgerTransition[] {
  return transitions.filter(t => t.from === state);
}

/**
 * True iff every run from `start` to `accept` traverses at least one `contract`
 * transition — i.e. the contract determinises every path to delivery. A `model`
 * edge straight into `accept` (or an unguarded path) makes this false.
 */
export function isDeterminized(
  transitions: LedgerTransition[] = FREEDOM_LEDGER,
  start: string = LEDGER_START,
  accept: string = LEDGER_ACCEPT
): boolean {
  // DFS with three marks: does an accepted path exist that used no contract edge?
  const seen = new Set<string>();
  const stack: Array<{ state: string; usedContract: boolean }> = [{ state: start, usedContract: false }];
  while (stack.length > 0) {
    const { state, usedContract } = stack.pop() as { state: string; usedContract: boolean };
    if (state === accept && !usedContract) return false;
    const key = `${state}|${usedContract}`;
    if (seen.has(key)) continue;
    seen.add(key);
    for (const t of outgoing(state, transitions)) {
      stack.push({ state: t.to, usedContract: usedContract || t.by === 'contract' });
    }
  }
  return true;
}

/** How many transitions each actor controls — the ledger's headline balance. */
export function actorCounts(transitions: LedgerTransition[] = FREEDOM_LEDGER): Record<LedgerActor, number> {
  return transitions.reduce<Record<LedgerActor, number>>(
    (acc, t) => ((acc[t.by] += 1), acc),
    { model: 0, contract: 0 }
  );
}
