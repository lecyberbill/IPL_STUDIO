/**
 * Finite-automaton trace oracle (AFN — automate fini non-déterministe).
 *
 * The behavioral oracle checks *values*; this checks a *trace* (a sequence of
 * event symbols) against a finite automaton. It supports non-determinism: a
 * transition may target several states, and the simulator carries the SET of
 * reachable states (the subset construction executed at runtime). Accepted iff,
 * after consuming the whole trace, at least one reachable state is accepting.
 *
 * Pure and 0-token — the same "déterminiser le contrat qui entoure le modèle"
 * idea: the LLM's non-determinism stays; the automaton makes conformance
 * explicit and checkable.
 */

export interface AutomatonTransition {
  from: string;
  /** The input symbol that fires the transition. */
  on: string;
  /** One target state, or several (non-deterministic). */
  to: string | string[];
}

export interface Automaton {
  initial: string;
  accept: string[];
  transitions: AutomatonTransition[];
}

export interface AutomatonResult {
  accepted: boolean;
  /** The set of states reachable after the whole trace. */
  reached: string[];
  /** Present when rejected. */
  error?: string;
}

/** Simulates the (possibly non-deterministic) automaton over a symbol trace. */
export function runAutomaton(trace: string[], m: Automaton): AutomatonResult {
  let states = new Set<string>([m.initial]);
  for (let i = 0; i < trace.length; i++) {
    const symbol = trace[i];
    const next = new Set<string>();
    for (const t of m.transitions) {
      if (!states.has(t.from) || t.on !== symbol) continue;
      for (const to of Array.isArray(t.to) ? t.to : [t.to]) next.add(to);
    }
    if (next.size === 0) {
      return {
        accepted: false,
        reached: [...states],
        error: `no transition on "${symbol}" from {${[...states].join(', ')}} (trace step ${i + 1})`
      };
    }
    states = next;
  }
  const reached = [...states];
  const accepted = reached.some(s => m.accept.includes(s));
  return accepted
    ? { accepted, reached }
    : { accepted, reached, error: `trace ended in {${reached.join(', ')}} — no accepting state reached (expected one of {${m.accept.join(', ')}})` };
}
