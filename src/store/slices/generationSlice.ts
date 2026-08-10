import { apiFetch } from '../../services/api';
import { generateIPL, refineIPLArtifact, extractClarificationRequest } from '../../engine/llmGenerator';
import { parseMultiFileXml } from '../../engine/artifactGenerator';
import { resolveIPLProject, validateIPLProject } from '../../engine/iplGrammar';
import { applyIPLQuickFixes } from '../../engine/iplQuickFix';
import { applyDeterministicRepairs } from '../../engine/deterministicRepair';
import { defaultOutputDir } from '../../engine/paths';
import type { ClarificationRequest } from '../types';
import type { StoreSlice } from '../types';

export interface GenerationSlice {
  generatedCode: string;
  isGenerating: boolean;
  pendingClarification: ClarificationRequest | null;
  generationError: string | null;
  clearGenerationError: () => void;
  runGeneration: () => Promise<void>;
  requestLLMCorrection: (userPrompt: string) => Promise<{ textReply: string; codeChanged: boolean }>;
  autoDebugAndFix: (customCmd?: string) => Promise<boolean>;
  answerClarification: (answer: string) => Promise<boolean>;
  clearPendingClarification: () => void;
}

export const generationSlice: StoreSlice<GenerationSlice> = (set, get) => ({
  generatedCode: '',
  isGenerating: false,
  pendingClarification: null,
  generationError: null,

  clearGenerationError: () => set({ generationError: null }),

  runGeneration: async () => {
    const { code, targetLang, llmConfig, polyglotConfig, addLog, projects, activeProjectId } = get();
    const activeProj = projects.find(p => p.id === activeProjectId);
    set({ isGenerating: true, generationError: null });

    try {
      // Phase 7: build the project union deterministically, rooted at
      // main.ipl, regardless of which file is active in the editor. The
      // active editor buffer is authoritative for its own file.
      const baseFiles = activeProj?.sourceFiles ? { ...activeProj.sourceFiles } : undefined;
      if (baseFiles) {
        const activeFile = activeProj?.activeSourceFile || 'main.ipl';
        baseFiles[activeFile] = code;
        if (!baseFiles['main.ipl']) baseFiles['main.ipl'] = code;
      }
      const projectRoot = baseFiles?.['main.ipl'] ?? code;

      const project = resolveIPLProject(projectRoot, baseFiles, 'main.ipl');

      // Cross-file advisory checks: duplicate declarations and unknown
      // references are now detected across imported modules.
      const projectErrors = validateIPLProject(projectRoot, baseFiles, 'main.ipl');
      if (projectErrors.length > 0) {
        addLog(`Project-wide IPL check: ${projectErrors.length} diagnostic(s) across merged modules (first: ${projectErrors[0].message}).`, 'warn');
      }
      for (const u of project.unresolved) {
        addLog(`Unresolved import "${u.file}" (from ${u.importedFrom}): module will not contribute to the build.`, 'warn');
      }

      // Pre-generation repair: apply fixable diagnostics (unterminated
      // string, unclosed block) on a copy of the merged union so the model
      // receives clean input. The user's editor buffer is never modified.
      const preRepair = applyIPLQuickFixes(project.code);
      let unifiedCode = preRepair.code;
      if (preRepair.applied.length > 0) {
        addLog(`Pre-generation repair: ${preRepair.applied.length} fix(es) applied deterministically (${preRepair.applied.map(a => a.fixLabel).join(', ')}). Editor untouched.`, 'success');
      }
      if (preRepair.remaining.length > 0) {
        addLog(`Still ${preRepair.remaining.length} diagnostic(s) unresolved before generation (advisory only).`, 'warn');
      }

      const result = await generateIPL(
        unifiedCode,
        targetLang,
        llmConfig,
        (msg, type) => {
          addLog(msg, type);
        },
        (streamChunkText) => {
          set({ generatedCode: streamChunkText });
        },
        polyglotConfig
      );

      set({ generatedCode: result, isGenerating: false, generationError: null });
      await get().writeArtifactToDisk();
    } catch (err: any) {
      const message = err?.message || 'Unknown generation error';
      addLog(`Generation error: ${message}`, 'error');
      set({ isGenerating: false, generationError: message });
    } finally {
      set({ isGenerating: false });
    }
  },

  requestLLMCorrection: async (userPrompt: string) => {
    const { generatedCode, targetLang, llmConfig, addLog } = get();
    if (!userPrompt.trim()) return { textReply: '', codeChanged: false };

    set({ isGenerating: true });
    try {
      const rawResult = await refineIPLArtifact(
        generatedCode || '',
        userPrompt.trim(),
        targetLang,
        llmConfig,
        (msg, type) => addLog(msg, type)
      );

      // Extract the current state of the files
      const existingFiles = parseMultiFileXml(generatedCode || '');
      // Merge and apply targeted modifications (<patch>) and new files (<file>)
      const updatedFiles = parseMultiFileXml(rawResult, existingFiles);

      const hasPatchOrFileTag = /<file\s+path=["']([^"']+)["']\s*>/i.test(rawResult) ||
                                /<patch\s+path=["']([^"']+)["']\s*>/i.test(rawResult);

      if (hasPatchOrFileTag && updatedFiles.length > 0) {
        // Rebuild a clean XML artifact with <file path="..."> per file
        const newXmlCode = updatedFiles.map(f => `<file path="${f.relativePath}">\n${f.content}\n</file>`).join('\n\n');

        set({ generatedCode: newXmlCode, isGenerating: false });
        await get().writeArtifactToDisk();

        // Clean the chat text reply by removing <file> and <patch> tags
        let textReply = rawResult
          .replace(/<file\s+path=["']([^"']+)["']\s*>([\s\S]*?)<\/file>/gi, '')
          .replace(/<patch\s+path=["']([^"']+)["']\s*>([\s\S]*?)<\/patch>/gi, '')
          .trim();

        return {
          textReply: textReply || `I applied the changes to your project files based on your request: "${userPrompt.trim()}".`,
          codeChanged: true
        };
      } else {
        // Conversational-only reply - DO NOT overwrite the project files!
        set({ isGenerating: false });
        return {
          textReply: rawResult.trim() || 'I am ready to help you with your IPL project.',
          codeChanged: false
        };
      }
    } catch (err: any) {
      addLog(`LLM Chat error: ${err.message}`, 'error');
      set({ isGenerating: false });
      return {
        textReply: `Error: ${err.message}`,
        codeChanged: false
      };
    }
  },

  autoDebugAndFix: async (customCmd?: string) => {
    const { projects, activeProjectId, targetLang, llmConfig, addLog, writeArtifactToDisk } = get();
    const activeProj = projects.find(p => p.id === activeProjectId);
    const outputDir = activeProj?.outputDir || defaultOutputDir(activeProj?.name || 'my_project');

    let cmdToRun = customCmd;
    if (!cmdToRun) {
      if (targetLang === 'rust') cmdToRun = 'cargo run';
      else if (targetLang === 'python') cmdToRun = 'python main.py';
      else if (targetLang === 'javascript') cmdToRun = 'node index.js';
      else if (targetLang === 'go') cmdToRun = 'go run main.go';
      else if (targetLang === 'cpp') cmdToRun = 'g++ -std=c++20 main.cpp -o main && ./main';
      else cmdToRun = 'python main.py';
    }

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      addLog(`[Coding Agent 🤖] Pass ${attempt}/${maxAttempts} - Diagnosing and running "${cmdToRun}"...`, 'info');

      await writeArtifactToDisk();

      let outputLog = '';
      try {
        const response = await apiFetch('/api/run-command', {
          method: 'POST',
          body: JSON.stringify({ command: cmdToRun, cwd: outputDir })
        });
        if (response.status === 403) {
          const errData = await response.json();
          addLog(`[Security] Command blocked: ${errData.error}`, 'error');
          return false;
        }
        const text = await response.text();
        outputLog = text;
      } catch (err: any) {
        outputLog = err.message;
      }

      // Robust error detection: rely first on the exit code
      // emitted by the backend, then on textual heuristics.
      const exitCodeMatch = outputLog.match(/\[Exit code:\s*(-?\d+)\]/i);
      const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1], 10) : null;

      let hasError = false;
      if (exitCode !== null) {
        hasError = exitCode !== 0;
      } else {
        hasError = /Traceback \(most recent call last\)|panic!|error:|Error:|Exception|SyntaxError|NameError|ReferenceError|TypeError|ImportError|command not found|is not recognized|cannot find|ENOENT|fatal:|exit code\s*[1-9]|terminé avec le code [1-9]/i.test(outputLog);
      }

      if (!hasError) {
        addLog(`[Coding Agent 🤖] 🎉 Execution succeeded at pass ${attempt}! No bugs detected.`, 'success');
        return true;
      }

      addLog(`[Coding Agent 🤖] ⚠️ Error detected in the console. Analyzing stacktrace and repairing...`, 'warn');

      set({ isGenerating: true });
      try {
        const currentFiles = parseMultiFileXml(get().generatedCode || '');
        const deterministic = applyDeterministicRepairs(currentFiles);
        if (deterministic.applied.length > 0) {
          const cleanXmlCode = deterministic.files
            .map(f => `<file path="${f.relativePath}">\n${f.content}\n</file>`)
            .join('\n\n');
          set({ generatedCode: cleanXmlCode, isGenerating: false });
          addLog(`[Coding Agent 🤖] ✅ Deterministic pre-repair applied: ${deterministic.applied.join('; ')}`, 'success');
          await writeArtifactToDisk();
          continue;
        }

        // 2. Deterministic repair didn't apply — spend an LLM repair call.
        const promptCorrection = `THE CODE FAILED TO EXECUTE IN THE TERMINAL WITH THE FOLLOWING ERROR. ANALYZE AND FIX THE FILES SO THE SCRIPT RUNS WITHOUT ERROR:\n\nConsole Log Output:\n${outputLog.substring(0, 2000)}`;

        const fixedResult = await refineIPLArtifact(
          get().generatedCode || '',
          promptCorrection,
          targetLang,
          llmConfig,
          (msg, type) => addLog(msg, type),
          (streamChunkText) => set({ generatedCode: streamChunkText })
        );

        // 2b. The LLM cannot fix confidently without a precision. Pause the
        //     loop, surface the question, and wait for the user's answer.
        //     NEVER guess (rails, not walls — the LLM is the interpreter).
        const clarification = extractClarificationRequest(fixedResult);
        if (clarification) {
          set({
            isGenerating: false,
            pendingClarification: { question: clarification, errorLog: outputLog.substring(0, 2000), cmdToRun, attempt }
          });
          addLog(`[Coding Agent 🤖] ❓ NEED_CLARIFICATION — ${clarification}`, 'warn');
          addLog('Please answer in the terminal input (or the chat) so the agent can repair accurately.', 'info');
          return false;
        }

        const existingFiles = parseMultiFileXml(get().generatedCode || '');
        const updatedFiles = parseMultiFileXml(fixedResult, existingFiles);

        if (updatedFiles.length > 0) {
          const cleanXmlCode = updatedFiles.map(f => `<file path="${f.relativePath}">\n${f.content}\n</file>`).join('\n\n');
          set({ generatedCode: cleanXmlCode, isGenerating: false });
        } else {
          set({ generatedCode: fixedResult, isGenerating: false });
        }

        await writeArtifactToDisk();
      } catch (err: any) {
        addLog(`LLM self-repair failed: ${err.message}`, 'error');
        set({ isGenerating: false });
        return false;
      }
    }

    addLog(`[Autonomous Agent 🤖] Completed 3 self-healing repair passes. Inspect the terminal log.`, 'warn');
    return false;
  },

  answerClarification: async (answer: string) => {
    const { projects, activeProjectId, targetLang, llmConfig, addLog, writeArtifactToDisk, pendingClarification } = get();
    if (!pendingClarification) return false;
    const { question, errorLog, cmdToRun, attempt } = pendingClarification;
    const activeProj = projects.find(p => p.id === activeProjectId);
    const outputDir = activeProj?.outputDir || defaultOutputDir(activeProj?.name || 'my_project');
    const nextAttempt = attempt + 1;

    addLog(`[Coding Agent 🤖] Answer received: "${answer}". Re-analyzing and repairing...`, 'info');
    set({ isGenerating: true });

    try {
      const promptCorrection = `THE CODE FAILED TO EXECUTE IN THE TERMINAL WITH THE FOLLOWING ERROR. ANALYZE AND FIX THE FILES SO THE SCRIPT RUNS WITHOUT ERROR.\n\nConsole Log Output:\n${errorLog}\n\nYou asked for a clarification:\n"${question}"\n\nUSER PRECISION (use it to decide the fix):\n"${answer}"`;

      const fixedResult = await refineIPLArtifact(
        get().generatedCode || '',
        promptCorrection,
        targetLang,
        llmConfig,
        (msg, type) => addLog(msg, type),
        (streamChunkText) => set({ generatedCode: streamChunkText })
      );

      // The model may still be unsure — ask again instead of guessing.
      const clarification = extractClarificationRequest(fixedResult);
      if (clarification) {
        set({ isGenerating: false, pendingClarification: { question: clarification, errorLog, cmdToRun, attempt: nextAttempt } });
        addLog(`[Coding Agent 🤖] ❓ NEED_CLARIFICATION (round ${nextAttempt}) — ${clarification}`, 'warn');
        return false;
      }

      const existingFiles = parseMultiFileXml(get().generatedCode || '');
      const updatedFiles = parseMultiFileXml(fixedResult, existingFiles);
      if (updatedFiles.length > 0) {
        const cleanXmlCode = updatedFiles.map(f => `<file path="${f.relativePath}">\n${f.content}\n</file>`).join('\n\n');
        set({ generatedCode: cleanXmlCode, isGenerating: false });
      } else {
        set({ generatedCode: fixedResult, isGenerating: false });
      }
      await writeArtifactToDisk();
      set({ pendingClarification: null });

      // Re-run the command to confirm the fix.
      addLog(`[Coding Agent 🤖] Re-running "${cmdToRun}" to verify...`, 'info');
      let outputLog = '';
      try {
        const response = await apiFetch('/api/run-command', {
          method: 'POST',
          body: JSON.stringify({ command: cmdToRun, cwd: outputDir })
        });
        if (response.status === 403) {
          const errData = await response.json();
          addLog(`[Security] Command blocked: ${errData.error}`, 'error');
          return false;
        }
        outputLog = await response.text();
      } catch (err: any) {
        outputLog = err.message;
      }

      const exitCodeMatch = outputLog.match(/\[Exit code:\s*(-?\d+)\]/i);
      const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1], 10) : null;
      const hasError = exitCode !== null
        ? exitCode !== 0
        : /Traceback \(most recent call last\)|panic!|error:|Error:|Exception|SyntaxError|NameError|ReferenceError|TypeError|ImportError|command not found|is not recognized|cannot find|ENOENT|fatal:|exit code\s*[1-9]|terminé avec le code [1-9]/i.test(outputLog);

      if (!hasError) {
        addLog(`[Coding Agent 🤖] 🎉 Execution succeeded after your clarification!`, 'success');
        return true;
      }

      // Still failing — hand back to the repair loop with the new error.
      addLog(`[Coding Agent 🤖] ⚠️ Still failing after clarification. Launching another repair pass...`, 'warn');
      return await get().autoDebugAndFix(cmdToRun);
    } catch (err: any) {
      addLog(`LLM self-repair failed after clarification: ${err.message}`, 'error');
      set({ isGenerating: false, pendingClarification: null });
      return false;
    }
  },

  clearPendingClarification: () => set({ pendingClarification: null })
});
