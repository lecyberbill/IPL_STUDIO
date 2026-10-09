import { describe, it, expect } from 'vitest';
import { runAutomaton } from './automaton';
import type { Automaton } from './automaton';

/** A tiny order lifecycle: created --pay--> paid --ship--> shipped (accept). */
const ORDER: Automaton = {
  initial: 'created',
  accept: ['shipped'],
  transitions: [
    { from: 'created', on: 'pay', to: 'paid' },
    { from: 'paid', on: 'ship', to: 'shipped' },
    { from: 'created', on: 'cancel', to: 'cancelled' },
    { from: 'paid', on: 'cancel', to: 'refunded' }
  ]
};

describe('runAutomaton (deterministic)', () => {
  it('accepts a conforming trace', () => {
    const r = runAutomaton(['pay', 'ship'], ORDER);
    expect(r.accepted).toBe(true);
    expect(r.reached).toEqual(['shipped']);
  });

  it('rejects a dead-end transition', () => {
    const r = runAutomaton(['ship'], ORDER); // ship not allowed from created
    expect(r.accepted).toBe(false);
    expect(r.error).toContain('no transition on "ship"');
  });

  it('rejects a trace that ends in a non-accepting state', () => {
    const r = runAutomaton(['pay'], ORDER);
    expect(r.accepted).toBe(false);
    expect(r.error).toContain('no accepting state reached');
  });

  it('accepts the empty trace only if the initial state is accepting', () => {
    expect(runAutomaton([], ORDER).accepted).toBe(false);
    expect(runAutomaton([], { ...ORDER, accept: ['created'] }).accepted).toBe(true);
  });
});

describe('runAutomaton (non-deterministic — AFN)', () => {
  // From `s0`, `a` can lead to `s1` OR `s2`; only `s2 --b--> s3` accepts.
  const NFA: Automaton = {
    initial: 's0',
    accept: ['s3'],
    transitions: [
      { from: 's0', on: 'a', to: ['s1', 's2'] },
      { from: 's1', on: 'b', to: 'bad' },
      { from: 's2', on: 'b', to: 's3' }
    ]
  };

  it('carries the set of states and accepts when any branch accepts', () => {
    const r = runAutomaton(['a', 'b'], NFA);
    expect(r.reached.sort()).toEqual(['bad', 's3']);
    expect(r.accepted).toBe(true);
  });

  it('accepts even when one branch dead-ends first', () => {
    // s1 has no `a` transition; s2 does not either → this should dead-end.
    expect(runAutomaton(['a', 'a'], NFA).accepted).toBe(false);
  });
});
