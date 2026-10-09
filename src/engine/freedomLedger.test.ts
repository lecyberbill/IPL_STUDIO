import { describe, it, expect } from 'vitest';
import { FREEDOM_LEDGER, LEDGER_START, LEDGER_ACCEPT, isDeterminized, actorCounts, outgoing } from './freedomLedger';

describe('freedomLedger — degrees of freedom as automaton transitions', () => {
  it('is determinised: no delivered artifact can avoid a contract transition', () => {
    expect(isDeterminized()).toBe(true);
  });

  it('a free (model) shortcut straight to delivery breaks determinisation', () => {
    const leaky = [...FREEDOM_LEDGER, { from: 'code', to: LEDGER_ACCEPT, by: 'model' as const, label: 'ship raw' }];
    expect(isDeterminized(leaky)).toBe(false);
  });

  it('the ledger is balanced: model freedom is matched by contract checks', () => {
    expect(actorCounts()).toEqual({ model: 4, contract: 4 });
  });

  it('every accept-incoming transition is a contract transition', () => {
    const intoAccept = FREEDOM_LEDGER.filter(t => t.to === LEDGER_ACCEPT);
    expect(intoAccept.length).toBeGreaterThan(0);
    expect(intoAccept.every(t => t.by === 'contract')).toBe(true);
  });

  it('the start state has outgoing freedom', () => {
    expect(outgoing(LEDGER_START).length).toBeGreaterThan(0);
    expect(outgoing(LEDGER_START).every(t => t.by === 'model')).toBe(true);
  });
});
