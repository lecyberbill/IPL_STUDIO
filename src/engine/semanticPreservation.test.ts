import { describe, it, expect } from 'vitest';
import { extractIPLSemanticContract, measureSemanticPreservation, findContractFindings, deriveContractContext, isRequiredContractLost, deriveOutputJsonKeys, deriveBehaviorAssertFromSpec, checkOracleParity, renderNLBrief } from './semanticPreservation';

const SPEC = `
add entity Vehicle {
  plate: text,
  isVip: boolean,
  entryMinute: number,
  exitMinute: number
}

add entity ParkingGarage {
  hourlyRate: number,
  vipDiscountRate: number,
  currency: options("EUR", "USD")
}

listen event on "vehicle:exit" {
  read vehicle from gate {
    where: exitMinute > entryMinute
  }
  compute durationHours from vehicle {
    formula: (exitMinute - entryMinute) / 60
  }
  if vehicle.isVip == true {
    compute cost from vehicle {
      formula: round((durationHours * hourlyRate) * (1 - vipDiscountRate) * 100) / 100
    }
  } else {
    compute cost from vehicle {
      formula: round((durationHours * hourlyRate) * 100) / 100
    }
  }
  send receipt to screen {
    format: "json",
    plate: vehicle.plate,
    cost: cost,
    durationHours: durationHours,
    isVip: vehicle.isVip
  }
  return success
}
`;

describe('extractIPLSemanticContract', () => {
  it('extracts entities, fields, types, option values, formulas and output keys', () => {
    const c = extractIPLSemanticContract(SPEC);
    expect(c.entityNames).toContain('Vehicle');
    expect(c.entityNames).toContain('ParkingGarage');
    expect(c.fieldNames).toContain('plate');
    expect(c.fieldNames).toContain('hourlyRate');
    expect(c.types).toContain('text');
    expect(c.types).toContain('boolean');
    expect(c.types).toContain('number');
    expect(c.optionValues).toEqual(['EUR', 'USD']);
    expect(c.outputKeys).toContain('plate');
    expect(c.outputKeys).toContain('cost');
    expect(c.outputKeys).toContain('durationHours');
    expect(c.outputKeys).toContain('isVip');
    // grandTotal is a benchmark verification convenience, not an explicit
    // `send { ... }` key in this spec — it must NOT be reported as a contract key.
    expect(c.outputKeys).not.toContain('grandTotal');
  });

  it('deduplicates repeated field names and option values', () => {
    const c = extractIPLSemanticContract(SPEC);
    expect(new Set(c.optionValues).size).toBe(c.optionValues.length);
  });
});

describe('measureSemanticPreservation', () => {
  const contract = extractIPLSemanticContract(SPEC);

  it('reports full preservation when the source reproduces the contract', () => {
    const files = [
      { relativePath: 'src/main.py', content: `
class Vehicle:
    plate: str
    isVip: bool
    entryMinute: int
    exitMinute: int

class ParkingGarage:
    hourlyRate: float
    vipDiscountRate: float
    currency: str  # EUR / USD

vehicle = Vehicle()
vehicle.plate = "AB-123"
vehicle.isVip = False

entryMinute = 0
exitMinute = 120
hourlyRate = 4.0
vipDiscountRate = 0.1

durationHours = (exitMinute - entryMinute) / 60
cost = round((durationHours * hourlyRate) * (1 - vipDiscountRate) * 100) / 100

currency = "EUR"
grandTotal = 14.4
print({ "plate": vehicle.plate, "cost": cost, "durationHours": durationHours, "isVip": vehicle.isVip })
` }
    ];
    const r = measureSemanticPreservation(contract, files);
    expect(r.identity.preserved).toBe(r.identity.total);
    expect(r.types.preserved).toBeGreaterThan(0);
    expect(r.missing.filter(m => m.type === 'outputKey').length).toBe(0);
    expect(r.formulas.preserved).toBe(r.formulas.total);
    expect(r.score).toBeGreaterThan(0.9);
  });

  it('reports partial preservation and the specific drift when a name is renamed', () => {
    const files = [
      // `vehicles` (plural lowercase) instead of `Vehicle`, no `ParkingGarage`,
      // and no `entryMinute`/`exitMinute`/`hourlyRate` — the LLM renamed them.
      { relativePath: 'src/main.py', content: `
vehicles = [
  { "plate": "AB-123", "cost": 8.0, "isVip": False }
]
currency = "EUR"
` }
    ];
    const r = measureSemanticPreservation(contract, files);
    expect(r.identity.preserved).toBeLessThan(r.identity.total);
    expect(r.score).toBeLessThan(1);
    const missingIds = r.missing.filter(m => m.type === 'identity').map(m => m.id);
    expect(missingIds).toContain('ParkingGarage');
    expect(missingIds).toContain('entryMinute');
  });

  it('reports missing identifiers when the source is empty', () => {
    const files = [{ relativePath: 'src/main.py', content: 'print("hello")' }];
    const r = measureSemanticPreservation(contract, files);
    expect(r.identity.preserved).toBe(0);
    expect(r.score).toBeLessThan(1);
    expect(r.missing.length).toBeGreaterThan(0);
  });

  it('ignores the spec file and README when scanning', () => {
    const r = measureSemanticPreservation(contract, [
      { relativePath: 'source/main.ipl', content: SPEC },
      { relativePath: 'README.md', content: 'Vehicle ParkingGarage durationHours plate' },
      { relativePath: 'src/other.js', content: '' }
    ]);
    // Nothing real generated → nothing preserved, even though main.ipl has it all.
    expect(r.identity.preserved).toBe(0);
  });
});

describe('strict-contract conformance gate (advisory vs blocking)', () => {
  it('returns no findings when the source preserves the contract', () => {
    const files = [{ relativePath: 'src/main.py', content: `
class Vehicle: plate: str; isVip: bool; entryMinute: int; exitMinute: int
class ParkingGarage: hourlyRate: float; vipDiscountRate: float; currency: str
entryMinute=0; exitMinute=120; hourlyRate=4.0; vipDiscountRate=0.1
durationHours=(exitMinute-entryMinute)/60
cost=round((durationHours*hourlyRate)*(1-vipDiscountRate)*100)/100
currency="EUR"; grandTotal=14.4
print({"plate":"AB-123","cost":cost,"durationHours":durationHours,"isVip":False})
` }];
    expect(findContractFindings(files, SPEC)).toEqual([]);
  });

  it('flags a contract that lost a required dimension (formulas/output keys)', () => {
    const files = [{ relativePath: 'src/main.py', content: 'print("hello")' }];
    const findings = findContractFindings(files, SPEC);
    expect(findings).toHaveLength(1);
    expect(findings[0].reason).toContain('semantic contract drift');
  });

  it('returns nothing without a specCode (advisory default)', () => {
    expect(findContractFindings([{ relativePath: 'a.py', content: '' }], undefined)).toEqual([]);
  });

  it('isRequiredContractLost is true only when a full dimension is gone', () => {
    const ok = { identity: { preserved: 5, total: 5 }, types: { preserved: 3, total: 3 }, formulas: { preserved: 2, total: 2 }, outputKeys: { preserved: 2, total: 2 } };
    const lost = { identity: { preserved: 5, total: 5 }, types: { preserved: 0, total: 3 }, formulas: { preserved: 2, total: 2 }, outputKeys: { preserved: 2, total: 2 } };
    expect(isRequiredContractLost(ok)).toBe(false);
    expect(isRequiredContractLost(lost)).toBe(true);
  });
});

describe('deriveContractContext (contextual oracle/prompt contract)', () => {
  it('summarizes the declared identity/types/formulas/output keys', () => {
    const c = extractIPLSemanticContract(SPEC);
    const ctx = deriveContractContext(c);
    expect(ctx).toContain('entities: Vehicle, ParkingGarage');
    expect(ctx).toContain('output keys: plate, cost, durationHours, isVip');
    expect(ctx).toContain('formula constants:');
  });

  it('is empty for a spec with no declared contract', () => {
    expect(deriveContractContext(extractIPLSemanticContract('// nothing' ))).toBe('');
  });
});

describe('deriveBehaviorAssertFromSpec (spec-derived default oracle)', () => {
  it('extracts output keys only from format:json send clauses', () => {
    const spec = `
listen event on "x" {
  send receipt to screen { format: "json", plate: v.plate, cost: c, isVip: v.isVip }
  send confirmationEmail to user { subject: "hi", orderId: id, format: "email" }
}`;
    expect(deriveOutputJsonKeys(spec)).toEqual(['plate', 'cost', 'isVip']);
  });

  it('derives a stdoutContains oracle for the declared keys', () => {
    const spec = `
listen event on "x" {
  send receipt to screen { format: "json", plate: v.plate, cost: c }
}`;
    const assert = deriveBehaviorAssertFromSpec(spec);
    expect(assert).toEqual({ stdoutContains: ['"plate"', '"cost"'] });
  });

  it('returns null when the spec declares no JSON output (falls back to crash-only smoke)', () => {
    expect(deriveBehaviorAssertFromSpec('add message { text: "hi" }\nreturn success')).toBeNull();
  });
});

describe('checkOracleParity (generator and oracle share the same fixtures)', () => {
  const SPEC = `
add entity Vehicle { plate: text, isVip: boolean }
add entity Garage { currency: options("EUR", "USD") }
seed Vehicle car1 { plate: "AB-123", isVip: false }
listen event on "x" { send receipt to screen { format: "json", plate: vehicle.plate, isVip: vehicle.isVip } }
`;
  it('passes when the oracle fixtures are declared options/seed values', () => {
    const r = checkOracleParity(SPEC, { jsonInOutput: [
      { path: 'vehicles.0.plate', equals: 'AB-123' },
      { path: 'currency', equals: 'EUR' }
    ] });
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
  });

  it('flags an oracle value the spec never declares (drift)', () => {
    const r = checkOracleParity(SPEC, { jsonInOutput: [
      { path: 'currency', equals: 'GBP' }
    ] });
    expect(r.ok).toBe(false);
    expect(r.issues[0]).toContain('"GBP"');
    expect(r.issues[0]).toContain('no such option/seed value');
  });

  it('is trivially ok when the oracle asserts no string fixtures (numbers / presence)', () => {
    const r = checkOracleParity(SPEC, { jsonInOutput: [{ path: 'grandTotal', approx: 14.4 }, { path: 'x', exists: true }] });
    expect(r.ok).toBe(true);
  });
});

describe('control-flow preservation receipt', () => {
  const SPEC = `
listen event on "x" {
  read v from gate { where: v.n > 0 }
  if v.ok == true {
    send a to screen { format: "json", key: v.k }
  } else {
    send a to screen { format: "json", key: v.k }
  }
  for item in list { send b to screen { format: "json", key: item } }
  return success
}`;
  it('extracts the declared control-flow intents', () => {
    const cf = extractIPLSemanticContract(SPEC).controlFlow;
    expect(cf).toContain('if');
    expect(cf).toContain('else');
    expect(cf).toContain('for');
    expect(cf).toContain('return');
  });

  it('measures that the branching survived into the source', () => {
    const c = extractIPLSemanticContract(SPEC);
    const good = measureSemanticPreservation(c, [{ relativePath: 'a.js', content: 'if (x) { } else { } for (y of z) { } return 0;' }]);
    expect(good.controlFlow.preserved).toBe(good.controlFlow.total);
    const flat = measureSemanticPreservation(c, [{ relativePath: 'a.js', content: 'console.log(1);' }]);
    expect(flat.controlFlow.preserved).toBeLessThan(flat.controlFlow.total);
  });
});

describe('renderNLBrief (deterministic de-biased NL baseline)', () => {
  it('summarizes the spec as flat prose: entities, fixtures, formulas, output keys', () => {
    const spec = `
add entity Product { sku: id, name: text, stock: number, maxStock: number, category: options("auto", "food") }
seed Product p1 { sku: "SKU-42", name: "Coffee Beans", stock: 5, maxStock: 20, category: "food" }
listen event on "inventory:restock" {
  read product from warehouse { where: stock < maxStock }
  compute reorderQty from product { formula: maxStock - stock }
  send receipt to screen { format: "json", sku: product.sku, name: product.name, stock: product.stock, reorderQty: reorderQty }
}`;
    const brief = renderNLBrief(spec);
    expect(brief).toContain('Product has fields: sku (id), name (text)');
    expect(brief).toContain('category is one of "auto", "food"');
    expect(brief).toContain('Product p1: sku = SKU-42, name = Coffee Beans, stock = 5, maxStock = 20');
    expect(brief).toContain('reorderQty = maxStock - stock');
    expect(brief).toContain('JSON document with the keys: sku, name, stock, reorderQty');
  });

  it('is deterministic: same spec -> identical output', () => {
    const spec = 'add entity A { x: number }';
    expect(renderNLBrief(spec)).toBe(renderNLBrief(spec));
  });
});
