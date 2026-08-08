import { describe, expect, it } from 'vitest';
import {
  buildIPLRefIndex,
  resolveIPLDefinition,
  extractReferenceAt,
  extractStatementName,
  annotateBlockNodes
} from './iplRefs.ts';
import { parseIPLToTree } from './iplParser.ts';

const CANONICAL = `// IPL Project v1.0 - Typed E-Commerce Order Spec (Human Intent Types)
add entity Order {
  id: id,
  customerName: text,
  totalAmount: number,
  isPaid: boolean,
  createdAt: date,
  status: options("pending", "processing", "shipped", "delivered")
}

listen event on "checkout:completed" {
  read orderData from event {
    where: totalAmount > 0
  }

  if (orderData.isPaid == true) {
    set orderData.status = "processing"
    send confirmationEmail to orderData.customerName {
      subject: "Order Confirmation",
      orderId: orderData.id
    }
  } else {
    set orderData.status = "pending"
  }
}`;

describe('buildIPLRefIndex (3 reference kinds)', () => {
  const index = buildIPLRefIndex(CANONICAL);

  it('indexes the declared entity (add)', () => {
    expect(index.byName.get('Order')).toEqual([
      expect.objectContaining({ kind: 'declared', line: 2, verb: 'add' })
    ]);
  });

  it('indexes produced symbols (read / send)', () => {
    expect(index.byName.get('orderData')).toEqual([
      expect.objectContaining({ kind: 'produced', line: 12, verb: 'read' })
    ]);
    expect(index.byName.get('confirmationEmail')).toEqual([
      expect.objectContaining({ kind: 'produced', line: 18, verb: 'send' })
    ]);
  });

  it('indexes events (listen)', () => {
    expect(index.byName.get('checkout:completed')).toEqual([
      expect.objectContaining({ kind: 'event', line: 11, verb: 'listen' })
    ]);
  });

  it('never indexes property fields or option values', () => {
    for (const field of ['totalAmount', 'customerName', 'isPaid', 'status', 'createdAt', 'id', 'orderId', 'subject', 'pending', 'processing']) {
      expect(index.byName.has(field)).toBe(false);
    }
  });
});

describe('resolveIPLDefinition', () => {
  it('jumps from set orderData.status to the read producer', () => {
    // "set orderData.status" — orderData starts at column 9 on line 17.
    const loc = resolveIPLDefinition(CANONICAL, 17, 9);
    expect(loc).not.toBeNull();
    expect(loc!.kind).toBe('produced');
    expect(loc!.line).toBe(12);
    expect(loc!.name).toBe('orderData');
  });

  it('jumps from a produced reference in a send to its own producer', () => {
    // "send confirmationEmail to ..." — confirmationEmail starts at column 10 on line 18.
    const loc = resolveIPLDefinition(CANONICAL, 18, 10);
    expect(loc).not.toBeNull();
    expect(loc!.kind).toBe('produced');
    expect(loc!.line).toBe(18);
  });

  it('resolves the declared entity name', () => {
    // "add entity Order" — Order starts at column 12 on line 2.
    const loc = resolveIPLDefinition(CANONICAL, 2, 12);
    expect(loc).not.toBeNull();
    expect(loc!.kind).toBe('declared');
    expect(loc!.line).toBe(2);
  });

  it('resolves a quoted event name across a colon', () => {
    // Inside "checkout:completed" (content starts at column 18 on line 11).
    const loc = resolveIPLDefinition(CANONICAL, 11, 20);
    expect(loc).not.toBeNull();
    expect(loc!.kind).toBe('event');
    expect(loc!.name).toBe('checkout:completed');
    expect(loc!.line).toBe(11);
  });

  it('returns null for field references (no false positives)', () => {
    expect(resolveIPLDefinition(CANONICAL, 13, 12)).toBeNull(); // totalAmount
    expect(resolveIPLDefinition(CANONICAL, 17, 19)).toBeNull(); // status (field)
    expect(resolveIPLDefinition(CANONICAL, 16, 17)).toBeNull(); // isPaid (field)
    expect(resolveIPLDefinition(CANONICAL, 3, 7)).toBeNull();    // id (property)
  });

  it('returns null for keywords, operators and out-of-range positions', () => {
    expect(resolveIPLDefinition(CANONICAL, 16, 3)).toBeNull();  // "if"
    expect(resolveIPLDefinition(CANONICAL, 17, 26)).toBeNull(); // "=" operator
    expect(resolveIPLDefinition(CANONICAL, 999, 1)).toBeNull();
  });
});

describe('extractReferenceAt', () => {
  it('extracts plain identifiers', () => {
    expect(extractReferenceAt('  set orderData.status = 1', 1, 7)).toBe('orderData');
  });

  it('extracts the whole quoted event name', () => {
    expect(extractReferenceAt('listen event on "checkout:completed" {', 1, 20)).toBe('checkout:completed');
  });

  it('returns null at whitespace / symbols', () => {
    expect(extractReferenceAt('  set orderData.status = 1', 1, 6)).toBeNull();  // space
    expect(extractReferenceAt('  set orderData.status = 1', 1, 24)).toBeNull(); // "="
  });
});

describe('extractStatementName', () => {
  it('extracts the target name for every statement shape', () => {
    expect(extractStatementName('add entity Order')).toBe('Order');
    expect(extractStatementName('add module Inventory')).toBe('Inventory');
    expect(extractStatementName('add Order')).toBe('Order');
    expect(extractStatementName('read orderData from event')).toBe('orderData');
    expect(extractStatementName('send confirmationEmail to orderData.customerName')).toBe('confirmationEmail');
    expect(extractStatementName('set orderData.status = "processing"')).toBe('orderData');
    expect(extractStatementName('listen event on "checkout:completed"')).toBe('checkout:completed');
    expect(extractStatementName('for item in orders')).toBe('item');
  });
});

describe('annotateBlockNodes', () => {
  it('marks declared / produced / unknown semantic states', () => {
    const source = `add entity Order {\n  name: text\n}\n\nlisten event on "placed" {\n  read orderData from event\n  set orderData.status = "ok"\n  set ghost.state = "x"\n}\n`;
    const annotated = annotateBlockNodes(parseIPLToTree(source), source);

    const find = (nodes: typeof annotated, verb: string, header?: string): typeof annotated[0] | undefined => {
      for (const n of nodes) {
        if (n.verbName === verb && (header === undefined || n.headerText.includes(header))) return n;
        const found = find(n.children, verb, header);
        if (found) return found;
      }
      return undefined;
    };

    const addNode = find(annotated, 'add');
    expect(addNode?.semanticState).toBe('declared');

    const readNode = find(annotated, 'read');
    expect(readNode?.semanticState).toBe('produced');

    const listenNode = find(annotated, 'listen');
    expect(listenNode?.semanticState).toBe('produced');

    const setOrder = find(annotated, 'set', 'orderData');
    expect(setOrder?.semanticState).toBe('produced');

    const setGhost = find(annotated, 'set', 'ghost');
    expect(setGhost?.semanticState).toBe('unknown');
  });

  it('leaves non-symbol nodes without a semantic state', () => {
    const annotated = annotateBlockNodes(parseIPLToTree(CANONICAL), CANONICAL);
    const findIf = (nodes: typeof annotated): typeof annotated[0] | undefined => {
      for (const n of nodes) {
        if (n.verbName === 'if') return n;
        const found = findIf(n.children);
        if (found) return found;
      }
      return undefined;
    };
    expect(findIf(annotated)?.semanticState).toBeUndefined();
  });
});
