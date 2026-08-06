/**
 * Moteur de Compilation LLM Polyglotte 2-Passes
 * Transforme les déclarations d'intentions IPL en applications multi-fichiers complètes.
 */

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

export type TargetLanguage = 'polyglot' | 'rust' | 'python' | 'javascript' | 'go' | 'cpp' | 'html' | 'pll' | string;

export interface ProjectTopology {
  projectName: string;
  targetLang: string;
  files: Array<{
    relativePath: string;
    description: string;
  }>;
}

/**
 * Sends a prompt to LLM and streams chunk responses
 */
export async function callLLM(
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
      throw new Error(`Cloud API Key introuvable ! Veuillez saisir votre clé directement dans les Paramètres (⚙️) ou la définir dans .env sous [${viteEnvVarName}].`);
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
 * Compiles IPL Intent code into a production-ready multi-file application (Two-Pass LLM Compiler)
 */
export async function compileIPL(
  iplCode: string,
  targetLang: TargetLanguage,
  config: LLMConfig,
  onLog: (msg: string, type: 'info' | 'success' | 'warn' | 'error') => void,
  onStreamChunk?: (accumulatedText: string) => void,
  polyglotConfig?: { autoDecide: boolean; layers: Array<{ role: string; tech: string }> }
): Promise<string> {
  onLog(`🚀 Launching 2-Passes LLM Compiler for target: [${targetLang.toUpperCase()}]...`, 'info');

  let langInstruction = '';
  if (targetLang === 'polyglot') {
    if (polyglotConfig && !polyglotConfig.autoDecide && polyglotConfig.layers.length > 0) {
      const layersList = polyglotConfig.layers.map(l => `- Component/Role "${l.role}": ${l.tech}`).join('\n');
      langInstruction = `Target Polyglot Stack Architecture:\n${layersList}\nProvide clean, decoupled multi-file source code for each specified component layer!`;
    } else {
      langInstruction = 'Select ONE cohesive architecture stack (e.g., Frontend UI in HTML5/JS/Tailwind, or Python/Node/Rust backend service) that best fulfills the IPL specification. Build ONE single, complete, production-ready application. Do NOT output multiple redundant implementations in different languages!';
    }
  } else {
    langInstruction = `Target language: ${targetLang.toUpperCase()}. Generate clean, production-ready code for this specific ecosystem.`;
  }

  const INTENT_PHILOSOPHY = `
IMPORTANT INTENT PHILOSOPHY & PROFESSIONAL BEHAVIOR:
- The IPL code below is a HIGH-LEVEL INTENT DIRECTIVE for YOU (the AI Senior Software Engineer).
- IPL is NOT a programming language runtime to be parsed at runtime.
- DO NOT build an IPL parser, IPL interpreter, or IPL AST evaluator in the generated application code UNLESS explicitly requested.
- Fulfill the user's intent DIRECTLY by writing clean, elegant, production-grade application code in the target language stack.
`;

  // PASS 1: Topology Analysis
  onLog('Pass 1: Analyzing project topology & multi-file structure...', 'info');
  const pass1Prompt = `SYSTEM ROLE: Senior Autonomous Software Architect.
TASK: Analyze the following Intent Programming Language (IPL) specification and determine the optimal multi-file project architecture.

${INTENT_PHILOSOPHY}

${langInstruction}

IPL INTENT SPECIFICATION:
\`\`\`ipl
${iplCode}
\`\`\`

OUTPUT INSTRUCTIONS:
Return ONLY a raw JSON object with the project structure. No markdown formatting, no code blocks (\`\`\`json).
Required JSON format:
{
  "projectName": "my_project",
  "targetLang": "${targetLang}",
  "files": [
    { "relativePath": "Cargo.toml", "description": "Dependencies" },
    { "relativePath": "src/main.rs", "description": "Main entry point" }
  ]
}`;

  let topologyJsonStr = '';
  try {
    topologyJsonStr = await callLLM(pass1Prompt, config, onLog);
  } catch (err: any) {
    onLog(`Pass 1 Fallback triggered: ${err.message}`, 'warn');
  }

  // PASS 2: Complete Code Generation
  onLog('Pass 2: Generating full multi-file source code with XML tagging...', 'info');
  const pass2Prompt = `SYSTEM ROLE: Senior Software Engineer & Code Generator.
You are building a complete, runnable multi-file codebase based on the IPL specification and project topology.

${INTENT_PHILOSOPHY}

${langInstruction}

IPL SPECIFICATION:
\`\`\`ipl
${iplCode}
\`\`\`

TOPOLOGY REFERENCE:
${topologyJsonStr || 'Standard Multi-File Layout'}

CRITICAL CODE GENERATION RULES:
1. DIRECT INTENT FULFILLMENT: Fulfill the business logic directly with professional application code. Do NOT create IPL parsers or interpreter classes.
2. DETERMINISTIC INTENT TYPE MAPPING:
   - 'text' -> Target String type (e.g., String in Rust/Java, str in Python, string in Go)
   - 'number' -> Target Numeric type (e.g., f64/i64 in Rust, float/int in Python, float64 in Go)
   - 'boolean' -> Target Boolean type (e.g., bool in Rust/Python/Go, boolean in Java)
   - 'id' -> Target Unique Identifier type (e.g., Uuid in Rust, UUID/str in Python/Java, uuid.UUID in Go)
   - 'date' -> Target DateTime type (e.g., DateTime<Utc> in Rust, datetime in Python)
   - 'options(...)' -> Target Enum / Union type
3. Provide FULL, production-grade source code for every file. NEVER use comments like "// TODO" or "// implement here".
4. Format every file using the XML tag: <file path="relative/path/to/file.ext">file content</file>
5. FOR HTML5 / WEB FRONTEND: Unless explicitly requested otherwise, include <script src="https://cdn.tailwindcss.com"></script> inside <head> of index.html so Tailwind CSS utility classes render out-of-the-box in standalone browsers.
6. Include config files (e.g. Cargo.toml, requirements.txt, package.json, go.mod, Makefile) so the project can be built & executed immediately.

Example:
<file path="main.py">
def main():
    print("Hello World")

if __name__ == "__main__":
    main()
</file>`;

  const generatedArtifact = await callLLM(pass2Prompt, config, onLog, onStreamChunk);
  onLog('🎉 2-Pass Compilation completed successfully!', 'success');
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
  onStreamChunk?: (accumulatedText: string) => void
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

  return await callLLM(prompt, config, onLog, onStreamChunk, { temperature: 0.0 });
}
