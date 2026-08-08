import { describe, expect, it } from 'vitest';
import { parseIPL, parseIPLToTree, validateIPLCode as validateSyntax } from './iplParser.ts';

describe('tokenizer & comments', () => {
  it('ignores line and block comments', () => {
    const src = `// line comment
/* block
   comment */
add entity User { name: text }`;
    const { ast, diagnostics } = parseIPL(src);
    expect(diagnostics).toEqual([]);
    expect(ast.statements).toHaveLength(1);
    expect(ast.statements[0].kind).toBe('add');
  });

  it('warns on unterminated block comment', () => {
    const { diagnostics } = parseIPL('/* never closed');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('warning');
    expect(diagnostics[0].message).toContain('Unterminated block comment');
  });

  it('warns on unterminated string', () => {
    const { diagnostics } = parseIPL('add entity User { name: "oops }');
    expect(diagnostics.some(d => d.message.includes('Unterminated string'))).toBe(true);
  });
});

describe('add statement', () => {
  it('parses an entity with typed fields', () => {
    const { ast, diagnostics } = parseIPL(
      `add entity Order {\n  id: id,\n  totalAmount: number,\n  status: options("pending", "shipped")\n}`
    );
    expect(diagnostics).toEqual([]);
    const s = ast.statements[0];
    expect(s.kind).toBe('add');
    expect(s.entityKind).toBe('entity');
    expect(s.name).toBe('Order');
    expect(s.props.map(p => p.key)).toEqual(['id', 'totalAmount', 'status']);
  });

  it('parses `add view` with the correct name', () => {
    const { ast, diagnostics } = parseIPL('add view Dashboard { title: "X" }');
    expect(diagnostics).toEqual([]);
    const s = ast.statements[0];
    expect(s.entityKind).toBe('view');
    expect(s.name).toBe('Dashboard');
  });

  it('warns on unexpected words after add', () => {
    const { diagnostics } = parseIPL('add entity User extra words');
    expect(diagnostics.some(d => d.severity === 'info' && d.message.includes('Unexpected words after "add"'))).toBe(true);
  });
});

describe('targeted statements', () => {
  it('parses read target from source', () => {
    const { ast, diagnostics } = parseIPL('read orderData from event { where: amount > 0 }');
    expect(diagnostics).toEqual([]);
    const s = ast.statements[0];
    expect(s.kind).toBe('read');
    expect(s.target).toMatchObject({ kind: 'identifier', name: 'orderData' });
    expect(s.source).toMatchObject({ kind: 'identifier', name: 'event' });
  });

  it('parses send target to recipient', () => {
    const { ast, diagnostics } = parseIPL('send alert to card { severity: "HIGH" }');
    expect(diagnostics).toEqual([]);
    const s = ast.statements[0];
    expect(s.kind).toBe('send');
    expect(s.target).toMatchObject({ kind: 'identifier', name: 'alert' });
    expect(s.recipient).toMatchObject({ kind: 'identifier', name: 'card' });
  });

  it('parses search target in source', () => {
    const { ast } = parseIPL('search products in catalog { matching: term }');
    const s = ast.statements[0];
    expect(s.kind).toBe('search');
    expect(s.source).toMatchObject({ kind: 'identifier', name: 'catalog' });
  });
});

describe('set statement', () => {
  it('parses a member assignment', () => {
    const { ast, diagnostics } = parseIPL('set orderData.status = "processing"');
    expect(diagnostics).toEqual([]);
    const s = ast.statements[0];
    expect(s.kind).toBe('set');
    expect(s.target).toMatchObject({
      kind: 'member',
      object: { kind: 'identifier', name: 'orderData' },
      property: 'status'
    });
    expect(s.value).toMatchObject({ kind: 'literal', value: 'processing' });
  });

  it('warns when "=" is missing', () => {
    const { diagnostics } = parseIPL('set foo');
    expect(diagnostics.some(d => d.message.includes('missing "="'))).toBe(true);
  });
});

describe('control flow statements', () => {
  it('parses listen event on name', () => {
    const { ast, diagnostics } = parseIPL('listen event on "checkout:completed" {\n  set ok = true\n}');
    expect(diagnostics).toEqual([]);
    const s = ast.statements[0];
    expect(s.kind).toBe('listen');
    expect(s.eventName).toBe('checkout:completed');
    expect(s.hasBlock).toBe(true);
    expect(s.body).toHaveLength(1);
  });

  it('parses if/else branches', () => {
    const { ast } = parseIPL('if (a == 1) {\n  set x = 1\n} else {\n  set x = 2\n}');
    const s = ast.statements[0];
    expect(s.kind).toBe('if');
    expect(s.body).toHaveLength(1);
    expect(s.elseBody).toHaveLength(1);
  });

  it('parses for item in collection', () => {
    const { ast } = parseIPL('for item in inventory {\n  send log to x\n}');
    const s = ast.statements[0];
    expect(s.kind).toBe('for');
    expect(s.item).toMatchObject({ kind: 'identifier', name: 'item' });
    expect(s.collection).toMatchObject({ kind: 'identifier', name: 'inventory' });
  });

  it('parses try/catch with a catch variable', () => {
    const { ast } = parseIPL('try {\n  read a from b\n} catch (err) {\n  set status = "failed"\n}');
    const s = ast.statements[0];
    expect(s.kind).toBe('try');
    expect(s.catchVar).toBe('err');
    expect(s.catchBody).toHaveLength(1);
  });

  it('parses return payload props', () => {
    const { ast } = parseIPL('return { status: "SUCCESS", data: result }');
    const s = ast.statements[0];
    expect(s.kind).toBe('return');
    expect(s.props.map(p => p.key)).toEqual(['status', 'data']);
  });
});

describe('generic statements', () => {
  it('treats unrecognized lines as generic statements', () => {
    const { ast, diagnostics } = parseIPL('The user wants a login page');
    expect(ast.statements).toHaveLength(1);
    expect(ast.statements[0].kind).toBe('generic');
    expect(diagnostics).toEqual([]);
  });
});

describe('diagnostics', () => {
  it('flags a stray else', () => {
    const { diagnostics } = parseIPL('else { set x = 1 }');
    expect(diagnostics.some(d => d.severity === 'warning' && d.message.includes('Stray "else"'))).toBe(true);
  });

  it('flags an unclosed block', () => {
    const { diagnostics } = parseIPL('add entity User {');
    expect(diagnostics.some(d => d.message.includes('Unclosed block'))).toBe(true);
  });

  it('flags unexpected words in listen', () => {
    const { diagnostics } = parseIPL('listen weird stuff');
    expect(diagnostics.some(d => d.message.includes('Unexpected words in "listen"'))).toBe(true);
  });
});

describe('validateIPLCode (syntax only)', () => {
  it('returns SyntaxErrorItem shape with advisory severity', () => {
    const errs = validateSyntax('add entity User {');
    expect(errs.length).toBeGreaterThan(0);
    for (const e of errs) {
      expect(['info', 'warning']).toContain(e.severity);
      expect(typeof e.line).toBe('number');
      expect(typeof e.message).toBe('string');
    }
  });
});

describe('parseIPLToTree', () => {
  it('builds a nested block tree', () => {
    const tree = parseIPLToTree(`add entity User {
  name: text
}

listen event on "go" {
  read x from y
}`);
    expect(tree).toHaveLength(2);
    expect(tree[0].verbName).toBe('add');
    expect(tree[0].category).toBe('data');
    expect(tree[1].verbName).toBe('listen');
    expect(tree[1].category).toBe('action');
    expect(tree[1].children).toHaveLength(1);
  });
});
