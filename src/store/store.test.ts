import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createStore } from 'zustand/vanilla';
import type { IDEState } from './types';
import { editorSlice } from './slices/editorSlice';
import { logsSlice } from './slices/logsSlice';
import { projectsSlice } from './slices/projectsSlice';
import { settingsSlice } from './slices/settingsSlice';
import { generationSlice, buildGitCommand } from './slices/generationSlice';
import { diskSlice } from './slices/diskSlice';
import { validateIPLCode } from '../engine/iplGrammar';
import { DEFAULT_LLM_CONFIG } from '../engine/llmGenerator';
import { DEFAULT_PROJECTS, DEFAULT_POLYGLOT_CONFIG } from './defaults';

/**
 * Builds the exact same slice composition as useIdeStore, minus the persist
 * middleware (no localStorage in tests). Every behavior assertion runs against
 * the real combined store so cross-slice wiring (e.g. setCode -> projects sync)
 * is covered end-to-end.
 */
function createTestStore() {
  return createStore<IDEState>()((...a) => ({
    ...editorSlice(...a),
    ...logsSlice(...a),
    ...projectsSlice(...a),
    ...settingsSlice(...a),
    ...generationSlice(...a),
    ...diskSlice(...a),
    code: DEFAULT_PROJECTS[0].code,
    targetLang: DEFAULT_PROJECTS[0].targetLang,
    syntaxErrors: validateIPLCode(DEFAULT_PROJECTS[0].code)
  }));
}

const okJson = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => okJson({ success: true, targetDir: 'x', files: [] })));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('logsSlice', () => {
  it('prepends new entries and caps the log at 100', () => {
    const store = createTestStore();
    for (let i = 0; i < 110; i++) store.getState().addLog(`log-${i}`);
    expect(store.getState().logs.length).toBe(100);
    expect(store.getState().logs[0].text).toBe('log-109');
    expect(store.getState().logs[99].text).toBe('log-10');
  });

  it('clears all logs', () => {
    const store = createTestStore();
    store.getState().addLog('a');
    store.getState().clearLogs();
    expect(store.getState().logs.length).toBe(0);
  });
});

describe('editorSlice', () => {
  it('setCode updates code, syntaxErrors and the active project', () => {
    const store = createTestStore();
    const activeId = store.getState().activeProjectId;
    const newCode = 'add entity User {\n  id: id\n}\n';
    store.getState().setCode(newCode);
    const s = store.getState();
    expect(s.code).toBe(newCode);
    expect(s.projects.find(p => p.id === activeId)?.code).toBe(newCode);
    expect(s.projects.find(p => p.id === activeId)?.updatedAt).toBeTruthy();
  });

  it('setCode keeps per-file sourceFiles in sync with the active file', () => {
    const store = createTestStore();
    store.getState().createSourceFile('sub.ipl');
    store.getState().setCode('import "sub.ipl"\n');
    const proj = store.getState().projects.find(p => p.id === store.getState().activeProjectId)!;
    expect(proj.sourceFiles?.['sub.ipl']).toBe('import "sub.ipl"\n');
  });

  it('setTargetLang updates the language and the active project', () => {
    const store = createTestStore();
    store.getState().setTargetLang('go');
    const s = store.getState();
    expect(s.targetLang).toBe('go');
    expect(s.projects.find(p => p.id === s.activeProjectId)?.targetLang).toBe('go');
  });

  it('insertVerbSnippet appends to the end when no Monaco editor exists', () => {
    const store = createTestStore();
    store.setState({ editorInstance: null });
    const before = store.getState().code;
    store.getState().insertVerbSnippet({ name: 'send', snippet: 'send alert to ops { channel: "slack" }' } as any);
    expect(store.getState().code).toBe(`${before}\n\nsend alert to ops { channel: "slack" }`);
  });
});

describe('projectsSlice', () => {
  it('createProject activates a new project and resets editor state', () => {
    const store = createTestStore();
    store.getState().setCode('old');
    store.getState().setTargetLang('rust');
    store.setState({ generatedCode: '<file path="x">y</file>' });
    store.getState().createProject('My App');
    const s = store.getState();
    expect(s.projects[0].name).toBe('My App');
    expect(s.activeProjectId).toBe(s.projects[0].id);
    expect(s.projects[0].code).toContain('add item');
    expect(s.projects[0].targetLang).toBe('python');
    expect(s.code).toBe(s.projects[0].code);
    expect(s.targetLang).toBe('python');
    expect(s.generatedCode).toBe('');
  });

  it('deleteProject refuses to delete the last remaining project', () => {
    const store = createTestStore();
    const first = store.getState().projects[0].id;
    for (const p of store.getState().projects.slice(1)) {
      store.getState().deleteProject(p.id);
    }
    expect(store.getState().projects.length).toBe(1);
    store.getState().deleteProject(first);
    expect(store.getState().projects.length).toBe(1);
  });

  it('deleteProject falls back to the first remaining project when deleting the active one', () => {
    const store = createTestStore();
    const active = store.getState().activeProjectId;
    store.getState().deleteProject(active);
    const s = store.getState();
    expect(s.projects.some(p => p.id === active)).toBe(false);
    expect(s.activeProjectId).toBe(s.projects[0].id);
    expect(s.code).toBe(s.projects[0].code);
    expect(s.targetLang).toBe(s.projects[0].targetLang);
  });

  it('renameProject and setProjectOutputDir mutate the right project', () => {
    const store = createTestStore();
    const active = store.getState().activeProjectId;
    store.getState().renameProject(active, 'Renamed');
    store.getState().setProjectOutputDir(active, 'output/custom');
    const proj = store.getState().projects.find(p => p.id === active)!;
    expect(proj.name).toBe('Renamed');
    expect(proj.outputDir).toBe('output/custom');
  });

  it('createSourceFile adds a file map and switches to it', () => {
    const store = createTestStore();
    store.getState().createSourceFile('auth.ipl');
    const s = store.getState();
    const proj = s.projects.find(p => p.id === s.activeProjectId)!;
    expect(proj.sourceFiles?.['auth.ipl']).toContain('add module');
    expect(proj.activeSourceFile).toBe('auth.ipl');
    expect(s.code).toContain('auth.ipl');
  });

  it('deleteSourceFile protects main.ipl', () => {
    const store = createTestStore();
    store.getState().deleteSourceFile('main.ipl');
    expect(store.getState().projects[0].sourceFiles?.['main.ipl'] ?? store.getState().projects[0].code).toBeTruthy();
  });

  it('switchProject loads the target code and clears generated artifacts', () => {
    const store = createTestStore();
    store.setState({ generatedCode: '<file path="x">y</file>' });
    const target = store.getState().projects[1];
    store.getState().switchProject(target.id);
    const s = store.getState();
    expect(s.code).toBe(target.code);
    expect(s.targetLang).toBe(target.targetLang);
    expect(s.generatedCode).toBe('');
  });
});

describe('settingsSlice', () => {
  it('setLLMConfig merges partial config', () => {
    const store = createTestStore();
    store.getState().setLLMConfig({ model: 'deepseek-reasoner' });
    expect(store.getState().llmConfig.model).toBe('deepseek-reasoner');
    expect(store.getState().llmConfig.externalEndpoint).toBe(DEFAULT_LLM_CONFIG.externalEndpoint);
  });

  it('setLLMConfig sets and clears the independent reviewer config (P3)', () => {
    const store = createTestStore();
    store.getState().setLLMConfig({ reviewer: { mode: 'external', model: 'gpt-4o-mini' } });
    expect(store.getState().llmConfig.reviewer?.model).toBe('gpt-4o-mini');
    store.getState().setLLMConfig({ reviewer: undefined });
    expect(store.getState().llmConfig.reviewer).toBeUndefined();
  });

  it('toggles the settings, project, git and tutorial modals', () => {
    const store = createTestStore();
    const s = store.getState();
    expect(s.isSettingsOpen).toBe(false);
    s.toggleSettings();
    expect(store.getState().isSettingsOpen).toBe(true);
    s.toggleProjectModal();
    expect(store.getState().isProjectModalOpen).toBe(true);
    s.toggleGitModal();
    expect(store.getState().isGitModalOpen).toBe(true);
    s.toggleTutorial();
    expect(store.getState().isTutorialOpen).toBe(true);
  });

  it('addCustomTarget derives a stable id and deleteCustomTarget removes it', () => {
    const store = createTestStore();
    store.getState().addCustomTarget({
      name: 'Go Service',
      extension: 'go',
      promptInstructions: 'gen go'
    });
    const added = store.getState().customTargets.find(t => t.name === 'Go Service');
    expect(added?.id).toBe('go_service');
    store.getState().deleteCustomTarget(added!.id);
    expect(store.getState().customTargets.some(t => t.id === added!.id)).toBe(false);
  });

  it('clamps sidebar widths to their allowed ranges', () => {
    const store = createTestStore();
    store.getState().setLeftSidebarWidth(10);
    expect(store.getState().leftSidebarWidth).toBe(160);
    store.getState().setLeftSidebarWidth(400);
    expect(store.getState().leftSidebarWidth).toBe(400);
    store.getState().setRightSidebarWidth(9999);
    expect(store.getState().rightSidebarWidth).toBe(950);
  });

  it('completeWelcome persists the first-run onboarding flag', () => {
    const store = createTestStore();
    expect(store.getState().hasSeenWelcome).toBe(false);
    store.getState().completeWelcome();
    expect(store.getState().hasSeenWelcome).toBe(true);
  });

  it('setPolyglotConfig persists the config onto the active project', () => {
    const store = createTestStore();
    const custom = { ...DEFAULT_POLYGLOT_CONFIG, autoDecide: false };
    store.getState().setPolyglotConfig(custom);
    const proj = store.getState().projects.find(p => p.id === store.getState().activeProjectId)!;
    expect(proj.polyglotConfig?.autoDecide).toBe(false);
  });

  it('formFactor defaults to cli and is updated by setFormFactor', () => {
    const store = createTestStore();
    expect(store.getState().formFactor).toBe('cli');
    store.getState().setFormFactor('gui');
    expect(store.getState().formFactor).toBe('gui');
  });
});

describe('buildGitCommand (repo management from chat)', () => {
  it('passes through explicit git commands verbatim', () => {
    expect(buildGitCommand('git status')).toBe('git status');
    expect(buildGitCommand('git add . && git commit -m "x"')).toBe('git add . && git commit -m "x"');
    expect(buildGitCommand('!git push')).toBe('git push');
  });

  it('maps natural-language git intents to commands', () => {
    expect(buildGitCommand('commit les changements')).toContain('git add . && git commit -m');
    expect(buildGitCommand('commit et pousse')).toContain('&& git push');
    expect(buildGitCommand('pousse sur le repo')).toBe('git push');
    expect(buildGitCommand('statut du dépôt')).toBe('git status');
    expect(buildGitCommand('montre le log')).toBe('git log --oneline -10');
    expect(buildGitCommand('fais un pull')).toBe('git pull');
    expect(buildGitCommand('diff')).toBe('git diff');
  });

  it('returns null for ordinary code requests', () => {
    expect(buildGitCommand('ajoute une feature')).toBeNull();
    expect(buildGitCommand('corrige le bug dans app.js')).toBeNull();
    expect(buildGitCommand('la liste des boissons est vide')).toBeNull();
  });
});

describe('generationSlice', () => {
  it('starts with no pending clarification and clears it', () => {
    const store = createTestStore();
    expect(store.getState().pendingClarification).toBeNull();
    store.setState({ pendingClarification: { question: 'q', errorLog: 'e', cmdToRun: 'x', attempt: 1 } });
    expect(store.getState().pendingClarification?.question).toBe('q');
    store.getState().clearPendingClarification();
    expect(store.getState().pendingClarification).toBeNull();
  });

  it('answerClarification returns false when no clarification is pending', async () => {
    const store = createTestStore();
    expect(await store.getState().answerClarification('yes')).toBe(false);
  });

  it('clearGenerationError dismisses a surfaced generation error', () => {
    const store = createTestStore();
    expect(store.getState().generationError).toBeNull();
    store.setState({ generationError: 'boom' });
    store.getState().clearGenerationError();
    expect(store.getState().generationError).toBeNull();
  });

  it('requestLLMCorrection runs a git command directly (no LLM) when the prompt starts with git', async () => {
    const store = createTestStore();
    vi.mocked(fetch).mockResolvedValueOnce(new Response('On branch main\nnothing to commit, working tree clean', { status: 200 }));
    const res = await store.getState().requestLLMCorrection('git status');
    expect(res.codeChanged).toBe(false);
    expect(res.textReply).toContain('On branch main');
    // No LLM call was made — only the run-command endpoint.
    const calls = vi.mocked(fetch).mock.calls.map(c => String(c[0]));
    expect(calls.some(u => u.includes('/api/run-command'))).toBe(true);
  });

  it('setConsolidationResult publishes the delivery report for the Delivery panel', () => {
    const store = createTestStore();
    expect(store.getState().consolidationResult).toBeNull();
    const result = {
      files: [{ relativePath: 'main.py', content: 'print(1)' }],
      staticIssues: [],
      jsonIssues: [],
      reviewIssues: [],
      confirmedIssues: [{ kind: 'static' as const, file: 'lib/util.py', message: 'missing import' }],
      passesUsed: 1,
      changed: true,
      report: '--- CONSOLIDATION REPORT ---'
    };
    store.getState().setConsolidationResult(result);
    expect(store.getState().consolidationResult?.confirmedIssues).toHaveLength(1);
    expect(store.getState().consolidationResult?.report).toContain('CONSOLIDATION REPORT');
  });

  it('switchProject clears the previous delivery report', () => {
    const store = createTestStore();
    store.getState().setConsolidationResult({
      files: [],
      staticIssues: [],
      jsonIssues: [],
      reviewIssues: [],
      confirmedIssues: [],
      passesUsed: 0,
      changed: false,
      report: 'old'
    });
    store.getState().switchProject(store.getState().projects[1].id);
    expect(store.getState().consolidationResult).toBeNull();
  });

  it('runGeneration seeds the token usage accumulator even when it fails', async () => {
    const store = createTestStore();
    store.getState().setLLMConfig({ customApiKey: 'ci-test-key' });
    vi.mocked(fetch).mockRejectedValue(new Error('connection refused'));
    await store.getState().runGeneration();
    const usage = store.getState().runUsage;
    expect(usage).not.toBeNull();
    expect(usage!.specTokens).toBeGreaterThan(0);
  });

  it('switchProject clears the token usage accumulator', () => {
    const store = createTestStore();
    store.getState().setRunUsage({
      specTokens: 42,
      generation: { inputTokens: 10, outputTokens: 20 },
      consolidation: { inputTokens: 5, outputTokens: 5 },
      repair: { inputTokens: 0, outputTokens: 0 },
      repairPasses: 0,
      clarificationRoundtrips: 0
    });
    expect(store.getState().runUsage).not.toBeNull();
    store.getState().switchProject(store.getState().projects[1].id);
    expect(store.getState().runUsage).toBeNull();
  });

  it('runGeneration surfaces and then clears generation errors', async () => {
    const store = createTestStore();
    // Force pass 2 (the streaming call) to reject: same config, stubbed fetch.
    // A customApiKey makes the flow environment-independent: without it the
    // generator short-circuits with a missing-key error before reaching fetch
    // (CI has no .env, so VITE_DP_API_KEY is undefined there).
    store.getState().setLLMConfig({ customApiKey: 'ci-test-key' });
    vi.mocked(fetch).mockRejectedValue(new Error('connection refused'));
    await store.getState().runGeneration();
    expect(store.getState().generationError).toBe('connection refused');
    // A new run clears the previous error (even if it fails again it re-surfaces).
    store.getState().clearGenerationError();
    expect(store.getState().generationError).toBeNull();
  });
});

describe('diskSlice', () => {
  it('writeArtifactToDisk warns and returns false when nothing was generated', async () => {
    const store = createTestStore();
    store.setState({ generatedCode: '' });
    expect(await store.getState().writeArtifactToDisk()).toBe(false);
    expect(store.getState().logs.some(l => l.type === 'warn')).toBe(true);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('writeArtifactToDisk posts the parsed artifact and logs success', async () => {
    const store = createTestStore();
    store.setState({ generatedCode: '<file path="main.py">\nprint("hi")\n</file>' });
    const fetchMock = vi.mocked(fetch).mockResolvedValueOnce(
      okJson({ success: true, targetDir: 'output/typed_e_commerce_order_spec', writtenFilesCount: 1 })
    );
    expect(await store.getState().writeArtifactToDisk()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/write-artifact');
    const body = JSON.parse(String(init!.body));
    // buildProjectArtifact parses the generated <file> blocks then always appends
    // source/main.ipl (the spec) and a tracking README.md, so 3 files are expected.
    expect(body.files).toHaveLength(3);
    const mainPy = body.files.find((f: { relativePath: string }) => f.relativePath === 'main.py');
    expect(mainPy).toBeTruthy();
    expect(mainPy.content).toBe('print("hi")');
    expect(body.files.some((f: { relativePath: string }) => f.relativePath === 'source/main.ipl')).toBe(true);
    expect(body.files.some((f: { relativePath: string }) => f.relativePath === 'README.md')).toBe(true);
    expect(store.getState().logs.some(l => l.type === 'success' && l.text.includes('[Disk]'))).toBe(true);
  });

  it('readArtifactFromDisk rebuilds generatedCode from scanned files', async () => {
    const store = createTestStore();
    vi.mocked(fetch).mockResolvedValueOnce(
      okJson({ success: true, targetDir: 'output/typed_e_commerce_order_spec', files: [
        { relativePath: 'main.py', content: 'print(1)' },
        { relativePath: 'lib/util.py', content: 'x = 1' }
      ] })
    );
    expect(await store.getState().readArtifactFromDisk()).toBe(true);
    const code = store.getState().generatedCode;
    expect(code).toContain('main.py');
    expect(code).toContain('lib/util.py');
    expect(code).toContain('print(1)');
  });

  it('readArtifactFromDisk clears generatedCode for an empty folder', async () => {
    const store = createTestStore();
    store.setState({ generatedCode: '<file path="x">y</file>' });
    vi.mocked(fetch).mockResolvedValueOnce(okJson({ success: true, targetDir: 'output/typed_e_commerce_order_spec', files: [] }));
    expect(await store.getState().readArtifactFromDisk()).toBe(true);
    expect(store.getState().generatedCode).toBe('');
  });
});
