import { describe, it, expect, vi, afterEach } from 'vitest';
import { extractClarificationRequest, estimateTokens, createRunTokenUsage, recordTokenUsage, callLLM, buildLangInstruction, buildFormDirective } from './llmGenerator';
import type { LLMConfig } from './llmGenerator';

const localConfig: LLMConfig = {
  mode: 'local',
  localEndpoint: 'http://localhost:11434',
  externalEndpoint: '',
  apiKeyName: '',
  model: 'test-model'
};

describe('token telemetry helpers (P2)', () => {
  it('estimateTokens rounds chars / 4 up to at least 1', () => {
    expect(estimateTokens(0)).toBe(1);
    expect(estimateTokens(4)).toBe(1);
    expect(estimateTokens(5)).toBe(2);
    expect(estimateTokens(211)).toBe(53); // ceil(211 / 4)
  });

  it('createRunTokenUsage seeds spec tokens and zeroes buckets', () => {
    const u = createRunTokenUsage(211);
    expect(u.specTokens).toBe(53);
    expect(u.generation).toEqual({ inputTokens: 0, outputTokens: 0 });
    expect(u.consolidation).toEqual({ inputTokens: 0, outputTokens: 0 });
    expect(u.repair).toEqual({ inputTokens: 0, outputTokens: 0 });
    expect(u.repairPasses).toBe(0);
    expect(u.clarificationRoundtrips).toBe(0);
  });

  it('recordTokenUsage adds estimated tokens to the requested bucket only', () => {
    const u = createRunTokenUsage(0);
    recordTokenUsage(u, 'generation', 100, 200);
    recordTokenUsage(u, 'consolidation', 40, 80);
    expect(u.generation).toEqual({ inputTokens: 25, outputTokens: 50 });
    expect(u.consolidation).toEqual({ inputTokens: 10, outputTokens: 20 });
    expect(u.repair).toEqual({ inputTokens: 0, outputTokens: 0 });
  });
});

describe('form-factor directives (P4)', () => {
  it('appends the form directive only when a form factor is provided', () => {
    const withCli = buildLangInstruction('javascript', undefined, 'cli');
    expect(withCli).toContain('EXECUTION FORM');
    expect(withCli).toContain('NO DOM');

    const without = buildLangInstruction('javascript');
    expect(without).not.toContain('EXECUTION FORM');
  });

  it('builds distinct directives for web, gui, server and library', () => {
    expect(buildFormDirective('web')).toContain('index.html');
    expect(buildFormDirective('gui')).toContain('WITH A WINDOW');
    expect(buildFormDirective('gui')).toContain('SDL');
    expect(buildFormDirective('gui')).toContain('game');
    expect(buildFormDirective('server')).toContain('listens on a port');
    expect(buildFormDirective('server')).toContain('FastAPI');
    expect(buildFormDirective('library')).toContain('runnable entry point');
    expect(buildFormDirective()).toBe('');
  });
});

describe('callLLM token recording (P2)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Ollama-style streamed NDJSON body from raw response lines. */
  function ollamaResponse(texts: string[]): Response {
    const encoder = new TextEncoder();
    const body = texts.map(t => `${JSON.stringify({ response: t })}\n`).join('');
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(body));
        controller.close();
      }
    });
    return new Response(stream, { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  it('records estimated input/output tokens into the bound bucket', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ollamaResponse(['hel', 'lo world'])));
    const usage = createRunTokenUsage(0);
    const prompt = 'REVIEW: this is the prompt text';
    const out = await callLLM(prompt, localConfig, () => {}, undefined, {
      temperature: 0.1,
      usage: { usage, bucket: 'consolidation' }
    });
    expect(out).toBe('hello world');
    expect(usage.consolidation.inputTokens).toBe(estimateTokens(prompt.length));
    expect(usage.consolidation.outputTokens).toBe(estimateTokens(out.length));
    expect(usage.generation).toEqual({ inputTokens: 0, outputTokens: 0 });
    expect(usage.repair).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it('records nothing when no hook is bound', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ollamaResponse(['plain'])));
    const out = await callLLM('prompt', localConfig, () => {});
    expect(out).toBe('plain');
  });
});

describe('extractClarificationRequest', () => {
  it('extracts a NEED_CLARIFICATION question', () => {
    const output = 'NEED_CLARIFICATION: Which entry point should the Node app use: index.js or src/main.js?';
    expect(extractClarificationRequest(output)).toBe('Which entry point should the Node app use: index.js or src/main.js?');
  });

  it('returns null for a normal fix response with <file> tags', () => {
    const output = '<file path="index.js">\nconsole.log("ok");\n</file>';
    expect(extractClarificationRequest(output)).toBeNull();
  });

  it('returns null for a conversational reply without the contract', () => {
    expect(extractClarificationRequest('Here is what I think the issue is...')).toBeNull();
  });

  it('is case-insensitive and trims surrounding whitespace', () => {
    expect(extractClarificationRequest('  need_clarification:   do you want a browser or a CLI app?  ')).toBe(
      'do you want a browser or a CLI app?'
    );
  });

  it('does not trigger on the word appearing inside a code comment', () => {
    const output = '<file path="a.py">\n# need_clarification: not a real request\nprint(1)\n</file>';
    expect(extractClarificationRequest(output)).toBeNull();
  });
});
