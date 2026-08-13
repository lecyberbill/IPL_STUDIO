import { apiFetch } from '../../services/api';
import { generateIPL, refineIPLArtifact, extractClarificationRequest } from '../../engine/llmGenerator';
import { parseMultiFileXml } from '../../engine/artifactGenerator';
import { resolveIPLProject, validateIPLProject } from '../../engine/iplGrammar';
import { applyIPLQuickFixes } from '../../engine/iplQuickFix';
import { applyDeterministicRepairs } from '../../engine/deterministicRepair';
import { consolidateArtifact } from '../../engine/consolidationAgent';
import type { ConsolidationResult } from '../../engine/consolidationAgent';
import { createRunTokenUsage } from '../../engine/llmGenerator';
import type { RunTokenUsage, FormFactor } from '../../engine/llmGenerator';
import { defaultOutputDir } from '../../engine/paths';
import type { ClarificationRequest } from '../types';
import type { StoreSlice } from '../types';

export interface GenerationSlice {
  generatedCode: string;
  isGenerating: boolean;
  pendingClarification: ClarificationRequest | null;
  generationError: string | null;
  consolidationResult: ConsolidationResult | null;
  setConsolidationResult: (result: ConsolidationResult | null) => void;
  runUsage: RunTokenUsage | null;
  setRunUsage: (usage: RunTokenUsage | null) => void;
  clearGenerationError: () => void;
  runGeneration: () => Promise<void>;
  requestLLMCorrection: (userPrompt: string) => Promise<{ textReply: string; codeChanged: boolean }>;
  autoDebugAndFix: (customCmd?: string) => Promise<boolean>;
  answerClarification: (answer: string) => Promise<boolean>;
  clearPendingClarification: () => void;
}

/**
 * Shared consolidation helper: runs the delivery-gate agent, logs its report and
 * publishes it to the Delivery panel. LLM tokens spent here are counted in the
 * `consolidation` bucket of the run accumulator.
 */
async function runConsolidation(
  get: () => any,
  xml: string,
  targetLang: any,
  llmConfig: any,
  usage: RunTokenUsage,
  formFactor?: FormFactor
): Promise<{ xml: string; changed: boolean }> {
  const { addLog, consolidationEnabled } = get();
  if (!consolidationEnabled) {
    get().setConsolidationResult(null);
    return { xml, changed: false };
  }

  addLog('Running consolidation agent (deterministic gates + LLM review before delivery)...', 'info');
  const result = await consolidateArtifact(xml, targetLang, llmConfig, {
    onLog: (msg, type) => addLog(msg, type),
    // P6: adaptive — the LLM review + auto-fix only run when a deterministic
    // gate fired; a clean tree is delivered on the 0-token gates alone.
    systematicReview: 'adaptive',
    usage: { usage, bucket: 'consolidation' },
    formFactor
  });
  get().setConsolidationResult(result);
  if (result.changed) {
    addLog(result.report, 'warn');
  } else if (result.confirmedIssues.length > 0) {
    addLog(result.report, 'warn');
  } else {
    addLog(result.report, 'success');
  }
  const newXml = result.files.length > 0 ? filesToXml(result.files) : xml;
  return { xml: newXml, changed: result.changed };
}

/** Serializes project files back into the <file> XML representation the store uses. */
function filesToXml(files: { relativePath: string; content: string }[]): string {
  return files.map(f => `<file path="${f.relativePath}">\n${f.content}\n</file>`).join('\n\n');
}

// ---------------------------------------------------------------------------
// Repo management from the chat ("gérer le dépôt à la demande").
// `git <cmd>` runs directly (git is allow-listed in the security gate, no LLM
// token cost); a few natural-language intents map to common git actions. The
// model never executes arbitrary commands — only git, and only what the user
// asked for.
// ---------------------------------------------------------------------------

/** Extracts a commit message from a natural-language prompt (best-effort, defaulted). */
function extractCommitMessage(prompt: string): string {
  const cleaned = prompt
    .replace(/\b(commit|commits|valider|validation|et|puis|pousser|pousse|push|envoie|les|la|le|mes|mon|ma|vers|sur|main|repo|dépôt|depot|changements|modifs|modifications)\b/gi, ' ')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'chore: update generated project';
}

/**
 * Maps a chat prompt to a git command to execute, or null when it is not a
 * repo-management request. `git ...` passthrough + bounded natural-language
 * intents (commit / push / status / log / pull / diff).
 */
export function buildGitCommand(prompt: string): string | null {
  const trimmed = prompt.trim();
  if (/^(git|!git)\s/i.test(trimmed)) return trimmed.replace(/^!/, '');

  const p = trimmed.toLowerCase();
  if (/\b(commit|commits|valider)\b/.test(p)) {
    const push = /\b(push|pousse|pousser|envoie|envoyer)\b/.test(p);
    return `git add . && git commit -m "${extractCommitMessage(trimmed)}"${push ? ' && git push' : ''}`;
  }
  if (/\b(push|pousse|pousser|envoie|envoyer)\b/.test(p)) return 'git push';
  if (/\b(statut|status|etat|état)\b/.test(p)) return 'git status';
  if (/\blog\b/.test(p)) return 'git log --oneline -10';
  if (/\b(pull|tire|récupère|recupere)\b/.test(p)) return 'git pull';
  if (/\b(diff|différences|differences)\b/.test(p)) return 'git diff';
  return null;
}

/** Runs a git command via the dev API (security allow-list) and returns the output as a chat reply. */
export async function runGitFromChat(
  command: string,
  cwd: string,
  addLog: (msg: string, type?: 'info' | 'success' | 'warn' | 'error') => void
): Promise<{ textReply: string; codeChanged: boolean }> {
  addLog(`[Git] Running: ${command}`, 'info');
  try {
    const response = await apiFetch('/api/run-command', {
      method: 'POST',
      body: JSON.stringify({ command, cwd })
    });
    if (response.status === 403) {
      const err = await response.json();
      return { textReply: `⛔ Command blocked by security: ${err?.error || 'unknown'}`, codeChanged: false };
    }
    const text = (await response.text()).trim();
    addLog(`[Git] ${text.slice(0, 300) || '(no output)'}`, 'success');
    return { textReply: text ? `\`\`\`\n${text}\n\`\`\`` : '(no output — command ran)', codeChanged: false };
  } catch (err: any) {
    addLog(`[Git] Failed: ${err.message}`, 'error');
    return { textReply: `Error running git: ${err.message}`, codeChanged: false };
  }
}

export const generationSlice: StoreSlice<GenerationSlice> = (set, get) => ({
  generatedCode: '',
  isGenerating: false,
  pendingClarification: null,
  generationError: null,
  consolidationResult: null,
  runUsage: null,

  setConsolidationResult: (consolidationResult) => set({ consolidationResult }),
  setRunUsage: (runUsage) => set({ runUsage }),
  clearGenerationError: () => set({ generationError: null }),

  runGeneration: async () => {
    const { code, targetLang, llmConfig, polyglotConfig, addLog, projects, activeProjectId, formFactor } = get();
    const activeProj = projects.find(p => p.id === activeProjectId);
    // P2: a fresh run accumulator — spec tokens from the active editor buffer.
    const runUsage = createRunTokenUsage(code.length);
    set({ isGenerating: true, generationError: null, consolidationResult: null });

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
        polyglotConfig,
        { usage: runUsage, bucket: 'generation' },
        formFactor
      );

      // Delivery gate: consolidation agent (deterministic gates + systematic
      // LLM review + auto-fix) runs BEFORE the project is handed to the user.
      const consolidated = await runConsolidation(get, result, targetLang, llmConfig, runUsage, formFactor);
      set({ generatedCode: consolidated.xml, isGenerating: false, generationError: null, runUsage: { ...runUsage } });
      await get().writeArtifactToDisk();
    } catch (err: any) {
      const message = err?.message || 'Unknown generation error';
      addLog(`Generation error: ${message}`, 'error');
      set({ isGenerating: false, generationError: message, runUsage: { ...runUsage } });
    } finally {
      set({ isGenerating: false });
    }
  },

  requestLLMCorrection: async (userPrompt: string) => {
    const { generatedCode, targetLang, llmConfig, addLog, code, formFactor, projects, activeProjectId } = get();
    if (!userPrompt.trim()) return { textReply: '', codeChanged: false };

    // Repo management from the chat: "git ..." or a natural-language git intent
    // runs the command directly (no LLM token cost) and returns the output.
    const gitCommand = buildGitCommand(userPrompt);
    if (gitCommand) {
      const activeProj = projects.find(p => p.id === activeProjectId);
      const outputDir = activeProj?.outputDir || defaultOutputDir(activeProj?.name || 'my_project');
      return await runGitFromChat(gitCommand, outputDir, addLog);
    }

    set({ isGenerating: true });
    const runUsage = get().runUsage ?? createRunTokenUsage(code.length);
    try {
      const rawResult = await refineIPLArtifact(
        generatedCode || '',
        userPrompt.trim(),
        targetLang,
        llmConfig,
        (msg, type) => addLog(msg, type),
        undefined,
        { usage: runUsage, bucket: 'generation' }
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

        // Re-run the delivery-gate consolidation after a user-driven correction.
        const consolidated = await runConsolidation(get, newXmlCode, targetLang, llmConfig, runUsage, formFactor);
        set({ generatedCode: consolidated.xml, isGenerating: false, runUsage: { ...runUsage } });
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
        set({ isGenerating: false, runUsage: { ...runUsage } });
        return {
          textReply: rawResult.trim() || 'I am ready to help you with your IPL project.',
          codeChanged: false
        };
      }
    } catch (err: any) {
      addLog(`LLM Chat error: ${err.message}`, 'error');
      set({ isGenerating: false, runUsage: { ...runUsage } });
      return {
        textReply: `Error: ${err.message}`,
        codeChanged: false
      };
    }
  },

  autoDebugAndFix: async (customCmd?: string) => {
    const { projects, activeProjectId, targetLang, llmConfig, addLog, writeArtifactToDisk, code } = get();
    const activeProj = projects.find(p => p.id === activeProjectId);
    const outputDir = activeProj?.outputDir || defaultOutputDir(activeProj?.name || 'my_project');
    const runUsage = get().runUsage ?? createRunTokenUsage(code.length);

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
    const publishUsage = () => set({ runUsage: { ...runUsage } });
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
        publishUsage();
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

        runUsage.repairPasses += 1;
        const fixedResult = await refineIPLArtifact(
          get().generatedCode || '',
          promptCorrection,
          targetLang,
          llmConfig,
          (msg, type) => addLog(msg, type),
          (streamChunkText) => set({ generatedCode: streamChunkText }),
          { usage: runUsage, bucket: 'repair' }
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
          publishUsage();
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
        publishUsage();
        return false;
      }
    }

    addLog(`[Autonomous Agent 🤖] Completed 3 self-healing repair passes. Inspect the terminal log.`, 'warn');
    publishUsage();
    return false;
  },

  answerClarification: async (answer: string) => {
    const { projects, activeProjectId, targetLang, llmConfig, addLog, writeArtifactToDisk, pendingClarification, code } = get();
    if (!pendingClarification) return false;
    const { question, errorLog, cmdToRun, attempt } = pendingClarification;
    const activeProj = projects.find(p => p.id === activeProjectId);
    const outputDir = activeProj?.outputDir || defaultOutputDir(activeProj?.name || 'my_project');
    const nextAttempt = attempt + 1;

    addLog(`[Coding Agent 🤖] Answer received: "${answer}". Re-analyzing and repairing...`, 'info');
    set({ isGenerating: true });
    const runUsage = get().runUsage ?? createRunTokenUsage(code.length);
    runUsage.clarificationRoundtrips += 1;
    const publishUsage = () => set({ runUsage: { ...runUsage } });

    try {
      const promptCorrection = `THE CODE FAILED TO EXECUTE IN THE TERMINAL WITH THE FOLLOWING ERROR. ANALYZE AND FIX THE FILES SO THE SCRIPT RUNS WITHOUT ERROR.\n\nConsole Log Output:\n${errorLog}\n\nYou asked for a clarification:\n"${question}"\n\nUSER PRECISION (use it to decide the fix):\n"${answer}"`;

      const fixedResult = await refineIPLArtifact(
        get().generatedCode || '',
        promptCorrection,
        targetLang,
        llmConfig,
        (msg, type) => addLog(msg, type),
        (streamChunkText) => set({ generatedCode: streamChunkText }),
        { usage: runUsage, bucket: 'repair' }
      );

      // The model may still be unsure — ask again instead of guessing.
      const clarification = extractClarificationRequest(fixedResult);
      if (clarification) {
        set({ isGenerating: false, pendingClarification: { question: clarification, errorLog, cmdToRun, attempt: nextAttempt } });
        addLog(`[Coding Agent 🤖] ❓ NEED_CLARIFICATION (round ${nextAttempt}) — ${clarification}`, 'warn');
        publishUsage();
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
        publishUsage();
        return true;
      }

      // Still failing — hand back to the repair loop with the new error.
      addLog(`[Coding Agent 🤖] ⚠️ Still failing after clarification. Launching another repair pass...`, 'warn');
      publishUsage();
      return await get().autoDebugAndFix(cmdToRun);
    } catch (err: any) {
      addLog(`LLM self-repair failed after clarification: ${err.message}`, 'error');
      set({ isGenerating: false, pendingClarification: null });
      publishUsage();
      return false;
    }
  },

  clearPendingClarification: () => set({ pendingClarification: null })
});
