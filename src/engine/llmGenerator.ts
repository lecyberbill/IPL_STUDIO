/**
 * Polyglot 2-Pass LLM Generation Engine
 * Transforms IPL intent declarations into complete multi-file applications.
 */

import { grammarSignatureText } from './iplCore.ts';

export interface LLMConfig {
  mode: 'local' | 'lmstudio' | 'external';
  localEndpoint: string;
  lmStudioEndpoint?: string;
  externalEndpoint: string;
  apiKeyName: string;
  customApiKey?: string;
  model: string;
}

export const DEFAULT_LLM_CONFIG: LLMConfig = {
  mode: 'external',
  localEndpoint: 'http://localhost:11434',
  lmStudioEndpoint: 'http://localhost:1234',
  externalEndpoint: 'https://api.deepseek.com',
  apiKeyName: 'VITE_DP_API_KEY',
  model: 'deepseek-chat'
};

// ---------------------------------------------------------------------------
// Token telemetry (P2 — the token-economy contract must be measurable)
// ---------------------------------------------------------------------------

export interface TokenBucket {
  /** Estimated input tokens (prompt chars / 4). */
  inputTokens: number;
  /** Estimated output tokens (response chars / 4). */
  outputTokens: number;
}

export type TokenBucketName = 'generation' | 'consolidation' | 'repair';

export interface RunTokenUsage {
  /** Estimated tokens of the IPL spec that triggered the run (chars / 4). */
  specTokens: number;
  /** 2-Pass generation + user-driven refinements. */
  generation: TokenBucket;
  /** Delivery-gate review + auto-fix passes. */
  consolidation: TokenBucket;
  /** Self-healing repair loop. */
  repair: TokenBucket;
  /** Repair passes actually run in the self-healing loop. */
  repairPasses: number;
  /** Clarification roundtrips the agent asked the human before resuming. */
  clarificationRoundtrips: number;
}

/** Binds a run accumulator to the bucket a given LLM call belongs to. */
export interface TokenUsageHook {
  usage: RunTokenUsage;
  bucket: TokenBucketName;
}

/** Rough token estimate (chars / 4), the same heuristic the benchmark uses. */
export function estimateTokens(chars: number): number {
  return Math.max(1, Math.ceil(chars / 4));
}

export function emptyTokenBucket(): TokenBucket {
  return { inputTokens: 0, outputTokens: 0 };
}

export function createRunTokenUsage(specChars: number): RunTokenUsage {
  return {
    specTokens: estimateTokens(specChars),
    generation: emptyTokenBucket(),
    consolidation: emptyTokenBucket(),
    repair: emptyTokenBucket(),
    repairPasses: 0,
    clarificationRoundtrips: 0
  };
}

/** Adds one call's chars (estimated to tokens) to the given bucket. */
export function recordTokenUsage(
  usage: RunTokenUsage,
  bucket: TokenBucketName,
  inputChars: number,
  outputChars: number
): void {
  usage[bucket].inputTokens += estimateTokens(inputChars);
  usage[bucket].outputTokens += estimateTokens(outputChars);
}

export type TargetLanguage = 'polyglot' | 'rust' | 'python' | 'javascript' | 'go' | 'cpp' | 'html' | 'pll' | string;

/**
 * Execution form factor of the generated project (P4): the model drifts toward
 * web apps for CLI-ish specs unless the prompt pins the form explicitly.
 * `undefined` keeps the historical behavior (no form directive).
 */
export type FormFactor = 'cli' | 'web' | 'gui' | 'server' | 'library';

/** Returns the form-factor directive block ('' when no form is requested). */
export function buildFormDirective(formFactor?: FormFactor): string {
  switch (formFactor) {
    case 'cli':
      return 'EXECUTION FORM: a standalone command-line executable. NO web server, NO DOM, NO browser APIs (document/window), NO app.run. It must run headless and print its output to stdout/console.';
    case 'web':
      return 'EXECUTION FORM: a browser web application. Provide an index.html entry (or public/ assets) and client-side code; a headless CLI is NOT required.';
    case 'gui':
      return 'EXECUTION FORM: a native desktop application WITH A WINDOW (a windowed program or a game with a loop). NOT a CLI script, NOT a browser app. Use the platform GUI toolkit (Win32/SDL/OpenGL/SFML for C++, tkinter/pygame for Python, egui/winit/eframe for Rust, Electron for JS) and open a real window / game loop.';
    case 'server':
      return 'EXECUTION FORM: a backend service / API server with NO browser UI (no index.html, no DOM). Provide a server that listens on a port and exposes routes/endpoints (FastAPI/uvicorn/Flask for Python, Express/Fastify for Node, gin/echo for Go, axum/actix for Rust). It must START and serve requests — a CLI script that exits is NOT acceptable.';
    case 'library':
      return 'EXECUTION FORM: a reusable library/module. Export functions and classes; do NOT execute side effects at import time and provide NO runnable entry point.';
    default:
      return '';
  }
}

export interface ProjectTopology {
  projectName: string;
  targetLang: string;
  files: Array<{
    relativePath: string;
    description: string;
  }>;
}

/**
 * Sends a prompt to LLM and streams chunk responses. When `options.usage` is
 * provided, the estimated input/output tokens (chars / 4) of the call are
 * recorded into the run accumulator under the given bucket — the single choke
 * point that makes the P2 token-economy telemetry possible.
 */
async function callLLMRaw(
  prompt: string,
  config: LLMConfig,
  onLog: (msg: string, type: 'info' | 'success' | 'warn' | 'error') => void,
  onStreamChunk?: (accumulatedText: string) => void,
  options?: { temperature?: number; seed?: number }
): Promise<string> {
  const temp = options?.temperature ?? 0.15;
  const seedVal = options?.seed ?? 42;

  if (config.mode === 'local') {
    onLog(`Connecting to local Ollama (temp=${temp}) (${config.model} at ${config.localEndpoint})...`, 'info');
    const response = await fetch(`${config.localEndpoint}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        prompt: prompt,
        stream: true,
        options: {
          temperature: temp,
          seed: seedVal
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama Local Error HTTP ${response.status}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let accumulatedText = '';

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunkStr = decoder.decode(value, { stream: true });
        const lines = chunkStr.split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.response) {
              accumulatedText += parsed.response;
              onStreamChunk?.(accumulatedText);
            }
          } catch {
            // raw text chunk fallback
          }
        }
      }
    }

    return accumulatedText;
  } else if (config.mode === 'lmstudio') {
    const rawEndpoint = config.lmStudioEndpoint || 'http://localhost:1234';
    const baseUrl = rawEndpoint.replace(/\/$/, '');
    const targetUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
    const selectedModel = config.model || 'local-model';

    onLog(`Connecting to LM Studio Local Server (temp=${temp}) (${selectedModel} at ${targetUrl})...`, 'info');

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer lm-studio'
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: temp,
        seed: seedVal,
        stream: true
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`LM Studio HTTP Error ${response.status}: ${errText}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let accumulatedText = '';
    let buffer = '';

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.substring(6);
            if (dataStr === '[DONE]') break;
            try {
              const parsed = JSON.parse(dataStr);
              const content = parsed.choices?.[0]?.delta?.content || '';
              if (content) {
                accumulatedText += content;
                onStreamChunk?.(accumulatedText);
              }
            } catch {
              // raw text chunk fallback
            }
          }
        }
      }
    }

    return accumulatedText;
  } else {
    // Mode Externe API Cloud (DeepSeek / Gemini / OpenAI compatible)
    const envVarName = config.apiKeyName || 'GEMINI_API_KEY';
    const viteEnvVarName = envVarName.startsWith('VITE_') ? envVarName : `VITE_${envVarName}`;

    const apiKey =
      (config.customApiKey && config.customApiKey.trim()) ||
      import.meta.env[envVarName] ||
      import.meta.env[viteEnvVarName] ||
      import.meta.env.VITE_GEMINI_API_KEY ||
      import.meta.env.VITE_DEEPSEEK_API_KEY ||
      import.meta.env.VITE_OPENAI_API_KEY ||
      import.meta.env.VITE_API_KEY;

    if (!apiKey) {
      throw new Error(`Cloud API Key not found! Enter your key directly in Settings (⚙️) or define it in .env as [${viteEnvVarName}].`);
    }

    onLog(`Connecting to Cloud API (temp=${temp}) (${config.model} at ${config.externalEndpoint})...`, 'info');

    const baseUrl = config.externalEndpoint.replace(/\/+$/, '').replace(/\/v1$/, '').replace(/\/v1\/chat\/completions$/, '');
    const apiUrl = `${baseUrl}/v1/chat/completions`;

    const bodyObj: Record<string, any> = {
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: temp,
      stream: true
    };

    if (seedVal !== undefined && !baseUrl.includes('googleapis')) {
      bodyObj.seed = seedVal;
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(bodyObj)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Cloud API HTTP Error ${response.status}: ${errText}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let accumulatedText = '';
    let buffer = '';

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.substring(6);
            if (dataStr === '[DONE]') break;
            try {
              const parsed = JSON.parse(dataStr);
              const content = parsed.choices?.[0]?.delta?.content || '';
              if (content) {
                accumulatedText += content;
                onStreamChunk?.(accumulatedText);
              }
            } catch {
              // raw text chunk fallback
            }
          }
        }
      }
    }

    return accumulatedText;
  }
}

/**
 * Public entry point: streams the LLM call and, when a token hook is bound,
 * records the estimated input/output token cost into the run accumulator.
 */
export async function callLLM(
  prompt: string,
  config: LLMConfig,
  onLog: (msg: string, type: 'info' | 'success' | 'warn' | 'error') => void,
  onStreamChunk?: (accumulatedText: string) => void,
  options?: { temperature?: number; seed?: number; usage?: TokenUsageHook }
): Promise<string> {
  const text = await callLLMRaw(prompt, config, onLog, onStreamChunk, options);
  if (options?.usage) {
    recordTokenUsage(options.usage.usage, options.usage.bucket, prompt.length, text.length);
  }
  return text;
}

/**
 * Builds the per-target stack instruction used by both passes. When a form
 * factor is provided, its directive is appended so the model cannot drift
 * toward a web app for a CLI spec (P4).
 */
export function buildLangInstruction(
  targetLang: TargetLanguage,
  polyglotConfig?: { autoDecide: boolean; layers: Array<{ role: string; tech: string }> },
  formFactor?: FormFactor
): string {
  let base: string;
  if (targetLang === 'polyglot') {
    if (polyglotConfig && !polyglotConfig.autoDecide && polyglotConfig.layers.length > 0) {
      const layersList = polyglotConfig.layers.map(l => `- Component/Role "${l.role}": ${l.tech}`).join('\n');
      base = `Target Polyglot Stack Architecture:\n${layersList}\nProvide clean, decoupled multi-file source code for each specified component layer!`;
    } else {
      base = 'Select ONE cohesive architecture stack (e.g., Frontend UI in HTML5/JS/Tailwind, or Python/Node/Rust backend service) that best fulfills the IPL specification. Build ONE single, complete, production-ready application. Do NOT output multiple redundant implementations in different languages!';
    }
  } else {
    base = `Target language: ${targetLang.toUpperCase()}. Generate clean, production-ready code for this specific ecosystem.`;
  }
  const form = buildFormDirective(formFactor);
  return form ? `${base}\n\n${form}` : base;
}

/**
 * Pass 1 prompt: topology architect (JSON project structure).
 */
export function buildPass1Prompt(
  iplCode: string,
  targetLang: TargetLanguage,
  polyglotConfig?: { autoDecide: boolean; layers: Array<{ role: string; tech: string }> },
  formFactor?: FormFactor
): string {
  return `You are a Lead Software Architect.

TARGET STACK:
${buildLangInstruction(targetLang, polyglotConfig, formFactor)}

BUSINESS REQUIREMENTS (Structured Pseudo-Code):
\`\`\`
${iplCode}
\`\`\`

IPL GRAMMAR SIGNATURE (authorized verbs & intent types — the spec above uses ONLY these):
${grammarSignatureText()}

ARCHITECTURE GUIDANCE:
Design a clean, cohesive application architecture. Use multi-file organization ONLY IF NEEDED for complexity, grouping related features logically (e.g. index.html, src/app.js). Avoid unnecessary file fragmentation for simple tasks.

TASK:
Return ONLY a valid raw JSON object defining the project topology:
{
  "projectName": "my_project",
  "files": [
    { "relativePath": "path/to/file.ext", "description": "purpose" }
  ]
}`;
}

/**
 * Pass 2 prompt: code generator (XML-tagged source files).
 */
export function buildPass2Prompt(
  iplCode: string,
  targetLang: TargetLanguage,
  topologyJsonStr: string,
  polyglotConfig?: { autoDecide: boolean; layers: Array<{ role: string; tech: string }> },
  formFactor?: FormFactor
): string {
  return `You are a Senior Full-Stack Software Engineer.
Build a complete, production-ready software application that directly fulfills the business requirements described in the structured pseudo-code below.

1. TARGET STACK:
${buildLangInstruction(targetLang, polyglotConfig, formFactor)}

2. BUSINESS REQUIREMENTS (Structured Pseudo-Code):
\`\`\`
${iplCode}
\`\`\`

3. IPL GRAMMAR SIGNATURE (authorized verbs & intent types used in the spec above):
${grammarSignatureText()}

4. PROJECT TOPOLOGY:
${topologyJsonStr || 'Standard Multi-File Layout'}

OUTPUT FORMAT INSTRUCTION:
Wrap EVERY generated project file inside XML tags:
<file path="relative/path/to/file.ext">
... complete runnable source code ...
</file>

Deliver clean, production-grade code directly fulfilling the requirements.`;
}

/**
 * Generates a production-ready multi-file application from IPL Intent code (Two-Pass LLM Code Generator)
 */
export async function generateIPL(
  iplCode: string,
  targetLang: TargetLanguage,
  config: LLMConfig,
  onLog: (msg: string, type: 'info' | 'success' | 'warn' | 'error') => void,
  onStreamChunk?: (accumulatedText: string) => void,
  polyglotConfig?: { autoDecide: boolean; layers: Array<{ role: string; tech: string }> },
  usage?: TokenUsageHook,
  formFactor?: FormFactor
): Promise<string> {
  onLog(`🚀 Starting the 2-Pass LLM Code Generator for target: [${targetLang.toUpperCase()}]...`, 'info');

  // PASS 1: Topology Analysis
  onLog('Pass 1: Analyzing project topology & multi-file structure...', 'info');
  const pass1Prompt = buildPass1Prompt(iplCode, targetLang, polyglotConfig, formFactor);

  let topologyJsonStr = '';
  try {
    topologyJsonStr = await callLLM(pass1Prompt, config, onLog, undefined, { temperature: 0.4, usage });
  } catch (err: any) {
    onLog(`Pass 1 Fallback triggered: ${err.message}`, 'warn');
  }

  // PASS 2: Complete Code Generation
  onLog('Pass 2: Generating full multi-file source code with XML tagging...', 'info');
  const pass2Prompt = buildPass2Prompt(iplCode, targetLang, topologyJsonStr, polyglotConfig, formFactor);

  const generatedArtifact = await callLLM(pass2Prompt, config, onLog, onStreamChunk, { usage });
  onLog('🎉 2-Pass generation completed successfully!', 'success');
  return generatedArtifact;
}

/**
 * Refines existing project files based on user chat feedback / error logs
 */
export async function refineIPLArtifact(
  existingXml: string,
  userCorrectionPrompt: string,
  targetLang: TargetLanguage,
  config: LLMConfig,
  onLog: (msg: string, type: 'info' | 'success' | 'warn' | 'error') => void,
  onStreamChunk?: (accumulatedText: string) => void,
  usage?: TokenUsageHook
): Promise<string> {
  onLog(`🤖 Refactoring & updating [${targetLang.toUpperCase()}] project files based on user instruction...`, 'info');

  const prompt = `SYSTEM ROLE: Senior Autonomous Software Architect & Assistant.
TASK: Answer the user question or modify the multi-file project based on the user request.

EXISTING PROJECT FILES:
\`\`\`xml
${existingXml}
\`\`\`

USER REQUEST:
"${userCorrectionPrompt}"

CRITICAL OUTPUT INSTRUCTIONS:
0. IF the request or the error is AMBIGUOUS and you cannot confidently determine the fix
   (multiple plausible interpretations, missing information, conflicting constraints):
   DO NOT guess. Reply with EXACTLY one line starting with:
   NEED_CLARIFICATION: <your precise, one-line question>
   and emit NO <file> or <patch> tags in that case.
1. IF the user is asking to modify specific lines, fix bugs, or update existing files:
   - OPTION A (Targeted Line Patching - Preferred for line edits):
     <patch path="relative/path/to/file.ext">
     <<<<<<< SEARCH
     exact lines to find in file
     =======
     new replacement lines
     >>>>>>> REPLACE
     </patch>
   
   - OPTION B (Full File Replacement / New File):
     <file path="relative/path/to/file.ext">
     full file content
     </file>

2. DO NOT write markdown headers (e.g. ## 3. Create file...) or conversational text between or outside <file> or <patch> tags.
3. IF the user is asking a general question without requesting code changes:
   - Answer conversationally in plain text.
   - DO NOT output any <file> or <patch> tags if no code was modified.`;

  return await callLLM(prompt, config, onLog, onStreamChunk, { temperature: 0.0, usage });
}

/**
 * Detects the NEED_CLARIFICATION contract in a refineIPLArtifact response.
 * Returns the user-facing question, or null when the model fixed the code
 * (or answered conversationally) without requesting a precision.
 */
export function extractClarificationRequest(output: string): string | null {
  // Only consider the text before any <file>/<patch> tag: if the model emitted
  // code changes it is not in "ask for precision" mode.
  const beforeTags = output.split(/<file\b|<patch\b/i)[0];
  const m = beforeTags.match(/NEED_CLARIFICATION\s*:\s*([^\n<]{1,300})/i);
  return m && m[1].trim() ? m[1].trim() : null;
}
