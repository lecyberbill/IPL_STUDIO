/**
 * Moteur de Compilation LLM Polyglotte 2-Passes
 * Transforme les déclarations d'intentions IPL en applications multi-fichiers complètes.
 */

export interface LLMConfig {
  mode: 'local' | 'external';
  localEndpoint: string;
  externalEndpoint: string;
  apiKeyName: string;
  customApiKey?: string;
  model: string;
}

export const DEFAULT_LLM_CONFIG: LLMConfig = {
  mode: 'external',
  localEndpoint: 'http://localhost:11434',
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
  onStreamChunk?: (accumulatedText: string) => void
): Promise<string> {
  const isLocal = config.mode === 'local';
  
  if (isLocal) {
    onLog(`Connecting to local LLM (${config.model} at ${config.localEndpoint})...`, 'info');
    const response = await fetch(`${config.localEndpoint}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        prompt: prompt,
        stream: true
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
  } else {
    // Mode Externe API Cloud (DeepSeek / OpenAI compatible)
    const apiKey = import.meta.env[config.apiKeyName] || config.customApiKey;
    if (!apiKey) {
      throw new Error(`Environment API key variable [${config.apiKeyName}] is missing.`);
    }

    onLog(`Connecting to Cloud API (${config.model} at ${config.externalEndpoint})...`, 'info');

    const response = await fetch(`${config.externalEndpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        stream: true
      })
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
  onStreamChunk?: (accumulatedText: string) => void
): Promise<string> {
  onLog(`🚀 Launching 2-Passes LLM Compiler for target: [${targetLang.toUpperCase()}]...`, 'info');

  const langInstruction = targetLang === 'polyglot'
    ? 'Choose the most optimal language and framework (Rust, Go, Python, Node.js, C++) based on the architecture requirements.'
    : `Target language: ${targetLang.toUpperCase()}. Generate clean, production-ready code for this specific ecosystem.`;

  // PASS 1: Topology Analysis
  onLog('Pass 1: Analyzing project topology & multi-file structure...', 'info');
  const pass1Prompt = `SYSTEM ROLE: Senior Autonomous Software Architect.
TASK: Analyze the following Intent Programming Language (IPL) specification and determine the optimal multi-file project architecture.

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

${langInstruction}

IPL SPECIFICATION:
\`\`\`ipl
${iplCode}
\`\`\`

TOPOLOGY REFERENCE:
${topologyJsonStr || 'Standard Multi-File Layout'}

CRITICAL CODE GENERATION RULES:
1. Provide FULL, production-grade source code for every file. NEVER use comments like "// TODO" or "// implement here".
2. Format every file using the XML tag: <file path="relative/path/to/file.ext">file content</file>
3. Include config files (e.g. Cargo.toml, requirements.txt, package.json, go.mod, Makefile) so the project can be built & executed immediately.

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
1. IF the user is asking to modify code, add features, or fix bugs:
   - Output all updated files wrapped inside <file path="relative/path/to/file.ext">full code</file> tags.
   - You may add a brief conversational explanation before or after the <file> tags.
2. IF the user is asking a general question, asking for clarification, or greeting you (without requesting explicit code changes):
   - Answer conversationally in normal text.
   - DO NOT output any <file> tags if no code files were modified.`;

  return await callLLM(prompt, config, onLog, onStreamChunk);
}
