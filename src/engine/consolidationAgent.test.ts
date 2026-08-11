import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  callLLM: vi.fn(),
  refineIPLArtifact: vi.fn()
}));

vi.mock('./llmGenerator', () => ({
  callLLM: mocks.callLLM,
  refineIPLArtifact: mocks.refineIPLArtifact,
  DEFAULT_LLM_CONFIG: { mode: 'external' },
  grammarSignatureText: () => ''
}));

import {
  filesToXml,
  mergeFindings,
  buildConsolidationDirective,
  buildDeliveryReport,
  summarizeConsolidation,
  consolidateArtifact
} from './consolidationAgent';
import type { ProjectArtifactFile } from './artifactGenerator';
import type { MissingModuleRef } from './staticChecker';
const file = (relativePath: string, content: string): ProjectArtifactFile => ({ relativePath, content });
const llmConfig = {
  mode: 'external' as const,
  localEndpoint: '',
  externalEndpoint: '',
  apiKeyName: '',
  model: 'test'
};

beforeEach(() => {
  mocks.callLLM.mockReset();
  mocks.refineIPLArtifact.mockReset();
});

describe('filesToXml', () => {
  it('wraps each file in a <file> tag', () => {
    const xml = filesToXml([file('a.js', 'const x = 1;'), file('b.js', 'const y = 2;')]);
    expect(xml).toContain('<file path="a.js">');
    expect(xml).toContain('<file path="b.js">');
    expect(xml).toContain('const x = 1;');
  });
});

describe('mergeFindings', () => {
  const staticIssues: MissingModuleRef[] = [
    { importer: 'src/index.js', specifier: './entities', resolved: 'src/entities.js', suggestion: 'file "src/entities.js" imported by src/index.js is not generated' }
  ];

  it('keeps static findings as errors and drops review infos', () => {
    const merged = mergeFindings(staticIssues, [], [
      { severity: 'error', file: 'src/app.js', message: 'x is undefined' },
      { severity: 'info', file: 'src/app.js', message: 'nit: naming' }
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0].kind).toBe('static');
    expect(merged[0].severity).toBe('error');
    expect(merged.every(m => m.severity === 'error')).toBe(true);
  });

  it('dedupes review findings that duplicate static ones', () => {
    const merged = mergeFindings(staticIssues, [], [
      { severity: 'error', file: 'src/entities.js', message: 'file "src/entities.js" imported by src/index.js is not generated' }
    ]);
    expect(merged).toHaveLength(1);
  });

  it('surfaces invalid JSON as a static error finding', () => {
    const merged = mergeFindings([], [{ file: 'package.json', reason: 'Unexpected token /', suggestion: 'invalid' }], []);
    expect(merged).toHaveLength(1);
    expect(merged[0].kind).toBe('static');
    expect(merged[0].file).toBe('package.json');
    expect(merged[0].severity).toBe('error');
  });
});

describe('buildConsolidationDirective', () => {
  it('lists every finding with its kind', () => {
    const directive = buildConsolidationDirective(
      [
        { kind: 'static', file: 'src/entities.js', message: 'missing', severity: 'error' },
        { kind: 'review', file: 'src/index.js', message: 'guard never true', severity: 'warning' }
      ],
      'javascript'
    );
    expect(directive).toContain('JAVASCRIPT');
    expect(directive).toContain('(confirmed: file is imported but not generated)');
    expect(directive).toContain('(reviewer finding)');
    expect(directive).toContain('GENERATE');
  });
});

describe('buildDeliveryReport', () => {
  it('reports a clean delivery', () => {
    const report = buildDeliveryReport([file('a.js', '')], [], [], [], [], 0, false);
    expect(report).toContain('No confirmed defects found.');
    expect(report).toContain('Delivered 1 file(s)');
  });

  it('reports static, warning and confirmed sections', () => {
    const staticIssues: MissingModuleRef[] = [
      { importer: 'src/index.js', specifier: './entities', resolved: 'src/entities.js', suggestion: 'missing' }
    ];
    const report = buildDeliveryReport(
      [file('a.js', '')],
      staticIssues,
      [],
      [{ severity: 'warning', file: 'a.js', message: 'dead code' }],
      [{ kind: 'static', file: 'src/entities.js', message: 'missing' }],
      1,
      true
    );
    expect(report).toContain('Static import gate: 1 missing file(s)');
    expect(report).toContain('src/entities.js (imported by src/index.js)');
    expect(report).toContain('Reviewer warnings');
    expect(report).toContain('Auto-fix: 1 consolidation pass(es) applied (files modified)');
    expect(report).toContain('Confirmed issues remaining');
  });

  it('reports invalid JSON files', () => {
    const report = buildDeliveryReport(
      [file('package.json', '// broken')],
      [],
      [{ file: 'package.json', reason: 'Unexpected token /', suggestion: 'rewrite' }],
      [],
      [{ kind: 'static', file: 'package.json', message: 'rewrite' }],
      0,
      false
    );
    expect(report).toContain('Static JSON gate: 1 invalid JSON file(s)');
    expect(report).toContain('package.json: Unexpected token /');
  });
});

describe('summarizeConsolidation (Delivery panel numbers)', () => {
  const base = {
    files: [file('a.js', '')],
    staticIssues: [] as MissingModuleRef[],
    jsonIssues: [],
    reviewIssues: [],
    confirmedIssues: [],
    passesUsed: 0,
    changed: false,
    report: ''
  };

  it('reports found / fixed / remaining for a clean delivery', () => {
    const s = summarizeConsolidation(base);
    expect(s).toEqual({ found: 0, fixed: 0, remaining: 0, warnings: [] });
  });

  it('counts static + json + reviewer (non-info) findings as found', () => {
    const s = summarizeConsolidation({
      ...base,
      staticIssues: [
        { importer: 'src/index.js', specifier: './entities', resolved: 'src/entities.js', suggestion: 'missing' }
      ],
      jsonIssues: [{ file: 'package.json', reason: 'bad', suggestion: 'rewrite' }],
      reviewIssues: [
        { severity: 'error', file: 'a.js', message: 'x undefined' },
        { severity: 'warning', file: 'a.js', message: 'dead code' },
        { severity: 'info', file: 'a.js', message: 'nit' }
      ]
    });
    expect(s.found).toBe(4); // 1 static + 1 json + 1 error + 1 warning (info excluded)
    expect(s.warnings).toHaveLength(1);
    expect(s.warnings[0].severity).toBe('warning');
  });

  it('counts auto-fix passes as corrected only when files changed', () => {
    expect(summarizeConsolidation({ ...base, passesUsed: 2, changed: true }).fixed).toBe(2);
    expect(summarizeConsolidation({ ...base, passesUsed: 2, changed: false }).fixed).toBe(0);
  });

  it('reports confirmed issues as remaining', () => {
    const s = summarizeConsolidation({
      ...base,
      confirmedIssues: [
        { kind: 'static', file: 'src/entities.js', message: 'missing' },
        { kind: 'review', file: 'a.js', message: 'x undefined' }
      ]
    });
    expect(s.remaining).toBe(2);
  });
});

describe('consolidateArtifact (LLM loop)', () => {
  it('skips the LLM fix when the deterministic gate is clean', async () => {
    mocks.callLLM.mockResolvedValue('{ "issues": [] }');
    const xml = filesToXml([file('src/index.js', 'console.log("hi");')]);
    const result = await consolidateArtifact(xml, 'javascript', llmConfig, { maxConsolidationPasses: 2 });
    expect(result.staticIssues).toEqual([]);
    expect(result.jsonIssues).toEqual([]);
    expect(result.passesUsed).toBe(0);
    expect(result.changed).toBe(false);
    expect(mocks.refineIPLArtifact).not.toHaveBeenCalled();
  });

  it('fixes a missing-file finding via refineIPLArtifact', async () => {
    // Systematic review returns a missing-file finding as an error.
    mocks.callLLM.mockResolvedValue(
      '{ "issues": [{ "severity": "error", "file": "src/entities.js", "message": "file \\"src/entities.js\\" imported by src/index.js is not generated" }] }'
    );
    // The fix pass emits the missing file.
    mocks.refineIPLArtifact.mockResolvedValue('<file path="src/entities.js">\nmodule.exports = {};\n</file>');
    // The re-review sees the tree clean.
    mocks.callLLM.mockResolvedValueOnce('{ "issues": [] }')
      .mockResolvedValueOnce('{ "issues": [{ "severity": "error", "file": "src/entities.js", "message": "missing" }] }')
      .mockResolvedValue('{ "issues": [] }');

    const xml = filesToXml([file('src/index.js', `const { E } = require('./entities');\nconsole.log(E);`)]);
    const result = await consolidateArtifact(xml, 'javascript', llmConfig, { maxConsolidationPasses: 2, systematicReview: true });
    expect(result.changed).toBe(true);
    expect(result.passesUsed).toBeGreaterThanOrEqual(1);
    expect(result.files.some(f => f.relativePath === 'src/entities.js')).toBe(true);
    expect(result.report).toContain('CONSOLIDATION REPORT');
  });

  it('stops after max passes when the fix does not land (no progress)', async () => {
    mocks.callLLM.mockResolvedValue(
      '{ "issues": [{ "severity": "error", "file": "src/entities.js", "message": "missing file" }] }'
    );
    // Fix pass never emits the file (model stubbornly returns prose).
    mocks.refineIPLArtifact.mockResolvedValue('I cannot fix this.');
    const xml = filesToXml([file('src/index.js', `require('./entities');`)]);
    const result = await consolidateArtifact(xml, 'javascript', llmConfig, { maxConsolidationPasses: 2, systematicReview: false });
    expect(result.passesUsed).toBeLessThanOrEqual(2);
    expect(result.changed).toBe(false);
    expect(result.confirmedIssues.length).toBeGreaterThan(0);
  });
});
