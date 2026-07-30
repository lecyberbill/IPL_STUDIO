/**
 * Intent Engine : Traduction du code IPL v1.0 vers le langage cible via LLM (Ollama ou API distante)
 * Supporte le Streaming Temps Réel de Réflexion/Génération, la Compilation Autonome 2-Passes et les Demandes de Correction
 */

export type TargetLanguage = 'python' | 'javascript' | 'pll' | 'html' | 'rust' | 'go' | 'cpp' | 'polyglot';

export interface LLMConfig {
  mode: 'local' | 'external';
  localEndpoint: string;
  externalEndpoint: string;
  apiKeyName: string;
  customApiKey?: string;
  model: string;
}

export const DEFAULT_LLM_CONFIG: LLMConfig = {
  mode: 'local',
  localEndpoint: 'http://localhost:11434/api/generate',
  externalEndpoint: 'https://api.deepseek.com/v1/chat/completions',
  apiKeyName: 'VITE_DP_API_KEY',
  customApiKey: '',
  model: 'deepseek-chat'
};

// Cache de compilation local
const compilationCache = new Map<string, string>();

function hashRequest(iplCode: string, targetLang: TargetLanguage): string {
  return `${targetLang}::${iplCode.trim()}`;
}

/**
 * System Prompt pour l'Étape 1 : Analyse de Topologie Architecturale (The Smart Architect)
 */
function getTopologyPrompt(targetLang: TargetLanguage): string {
  if (targetLang === 'polyglot') {
    return `Tu es l'architecte logiciel système Polyglotte du langage IPL v1.0 (Intent Programming Language).
Ta mission est d'analyser le script IPL v1.0 et de CHOISIR ET PROPOSER l'architecture polyglotte idéale en sélectionnant librement la combinaison de langages la plus pertinente (ex: Python, Rust, Go, JS, C++, HTML) pour répondre au besoin.

Règles :
1. Choisis librement les langages adaptés et découpe l'application en modules clairs.
2. Inclus un orchestrateur ou des fichiers de configuration pour interconnecter le tout si nécessaire.
3. Retourne UNIQUEMENT un objet JSON structuré respectant ce schéma exact :
{
  "project_structure": [
    { "path": "nom_du_fichier", "purpose": "Description et langage choisi" }
  ],
  "dependency_graph": {
    "fichier_a": ["fichier_b"]
  }
}`;
  }

  return `Tu es l'architecte logiciel officiel du langage IPL v1.0 (Intent Programming Language).
Ta mission est d'analyser le script IPL v1.0 fourni et d'établir la topologie projet multi-fichiers idéale pour ${targetLang.toUpperCase()}.

Règles :
1. Découpe l'application en modules propres (ex: main, config, database, services, ui).
2. Résous les dépendances sans import circulaire.
3. Retourne UNIQUEMENT un objet JSON structuré respectant ce schéma exact :
{
  "project_structure": [
    { "path": "main.py", "purpose": "Point d'entrée principal" },
    { "path": "src/config.py", "purpose": "Configuration" }
  ],
  "dependency_graph": {
    "main.py": ["src/config.py"]
  }
}`;
}

/**
 * System Prompt pour l'Étape 2 : Génération Multi-Fichiers Autonome (The Multi-File Compiler)
 */
function getMultiFileGenerationPrompt(targetLang: TargetLanguage, topologyJson: string): string {
  if (targetLang === 'polyglot') {
    return `### SYSTEM PROMPT: Autonomous Polyglot Architect & Compiler (IPL v1.0)

Tu es le moteur de compilation Polyglotte IPL v1.0.
Ta mission est de traduire le code IPL v1.0 en un projet multi-fichiers complet en suivant la proposition d'architecture retenue :
${topologyJson}

RÈGLES D'AUTONOMIE POLYGLOTTE :
1. Rédige chaque fichier dans le langage qui lui a été attribué par l'Architecte.
2. Assure l'interconnexion propre des modules et des dépendances.
3. FORMAT D'OUTPUT OBLIGATOIRE : Entoure CHAQUE fichier généré par cette balise XML exacte :

<file path="nom_du_fichier">
// contenu complet du fichier
</file>`;
  }

  return `### SYSTEM PROMPT: Autonomous Multi-File Architect & Compiler (IPL v1.0)

Tu es le moteur de compilation officielle IPL v1.0.
Ta mission est de traduire le code IPL v1.0 fourni en un projet multi-fichiers propre et immédiatement exécutable en ${targetLang.toUpperCase()} en suivant ce plan de topologie :
${topologyJson}

RÈGLES D'AUTONOMIE TOTALE :
1. Ne génère AUCUN fichier monolithique unique. Découpe le projet en modules clairs.
2. Résous automatiquement toutes les dépendances : les chemins d'importation relatifs, les exports et les inclusions doivent être 100% exacts sans référence cassée.
3. Pour Rust : inclus Cargo.toml, src/main.rs, et sous-modules mod.rs.
4. Pour Python : inclus main.py, requirements.txt, et modules dans src/.
5. Pour JavaScript : inclus package.json, index.js, et modules dans src/.
6. FORMAT D'OUTPUT OBLIGATOIRE : Entoure CHAQUE fichier généré par cette balise XML exacte :

<file path="nom_du_fichier">
// contenu complet du fichier
</file>`;
}

/**
 * Normalise l'URL d'endpoint API (ex: ajoute /v1/chat/completions si nécessaire)
 */
function normalizeEndpoint(url: string): string {
  let cleaned = url.trim().replace(/\/+$/, '');
  if (!cleaned.endsWith('/chat/completions')) {
    if (cleaned.endsWith('/v1')) {
      cleaned += '/chat/completions';
    } else {
      cleaned += '/v1/chat/completions';
    }
  }
  return cleaned;
}

/**
 * Effectue un appel réseau unifié avec Streaming Temps Réel
 */
async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  config: LLMConfig,
  onChunk?: (accumulated: string, chunk: string) => void
): Promise<string> {
  let accumulatedText = '';

  if (config.mode === 'local') {
    const response = await fetch(config.localEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model || 'llama3:latest',
        prompt: `${systemPrompt}\n\nInput :\n${userPrompt}`,
        stream: true
      })
    });

    if (!response.ok) throw new Error(`Ollama HTTP Error ${response.status}`);

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (reader) {
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            const chunk = parsed.response || parsed.content || '';
            if (chunk) {
              accumulatedText += chunk;
              onChunk?.(accumulatedText, chunk);
            }
          } catch {}
        }
      }
    }
    return accumulatedText;
  } else {
    const systemEnvs = (globalThis as any).__IPL_SYSTEM_ENVS__ || (globalThis as any).process?.env || (import.meta as any).env || {};
    const keyName = config.apiKeyName.trim();
    const envVal = systemEnvs[keyName] || 
                   systemEnvs[`VITE_${keyName}`] || 
                   systemEnvs[keyName.replace(/^VITE_/, '')] || 
                   systemEnvs['VITE_DP_API_KEY'] || 
                   systemEnvs['DP_API_KEY'] || '';

    const apiKey = (config.customApiKey && config.customApiKey.trim()) ? config.customApiKey.trim() : envVal;
    const targetEndpoint = normalizeEndpoint(config.externalEndpoint || 'https://api.deepseek.com');

    if (!apiKey) {
      throw new Error(`Clé API (${keyName}) non configurée.`);
    }

    const response = await fetch(targetEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: config.model || 'deepseek-chat',
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API HTTP Error ${response.status}: ${errText.substring(0, 100)}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (reader) {
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (trimmed.startsWith('data: ')) {
            try {
              const jsonStr = trimmed.substring(6);
              const parsed = JSON.parse(jsonStr);
              const chunk = parsed.choices?.[0]?.delta?.content || '';
              if (chunk) {
                accumulatedText += chunk;
                onChunk?.(accumulatedText, chunk);
              }
            } catch {}
          }
        }
      }
    }
    return accumulatedText;
  }
}

/**
 * Demande une correction / amélioration spécifique au LLM sur l'artefact de fichiers existant
 */
export async function refineIPLArtifact(
  currentFilesXml: string,
  userCorrectionPrompt: string,
  targetLang: TargetLanguage,
  config: LLMConfig,
  onLog?: (msg: string, type?: 'info' | 'warn' | 'success' | 'error') => void,
  onStreamChunk?: (accumulated: string) => void
): Promise<string> {
  onLog?.(`[Correction LLM 🛠️] Application de votre demande : "${userCorrectionPrompt}"...`, 'info');

  const systemPrompt = `Tu es l'architecte et développeur senior du projet IPL (${targetLang.toUpperCase()}).
L'utilisateur te demande d'apporter les corrections, modifications ou ajouts suivants aux fichiers existants du projet :
"${userCorrectionPrompt}"

RÈGLES DE CORRECTION :
1. Conserve la structure globale du projet et corrige ou améliore précisément ce qui est demandé.
2. Retourne l'ensemble des fichiers (modifiés ou conservés) sous forme de balises XML exactes :
<file path="nom_du_fichier">
// contenu du fichier
</file>`;

  const result = await callLLM(systemPrompt, currentFilesXml, config, (accumulated) => {
    onStreamChunk?.(accumulated);
  });

  onLog?.(`[Correction LLM 🛠️] Modifications et corrections appliquées avec succès ! 🚀`, 'success');
  return result;
}

/**
 * Fallback Déterministe si le LLM n'est pas disponible
 */
function fallbackTranspile(iplCode: string, targetLang: TargetLanguage): string {
  if (targetLang === 'polyglot') {
    let output = `<file path="backend/src/main.rs">\n// --- Core Backend Rust ---\nfn main() {\n    println!("[Polyglot Rust Backend] Running...");\n}\n</file>\n\n`;
    output += `<file path="analytics/processor.py">\n# --- Data Processing Python ---\ndef process_analytics():\n    print("[Polyglot Python Analytics] Processing data...")\n\nif __name__ == "__main__":\n    process_analytics()\n</file>\n\n`;
    output += `<file path="web/index.html">\n<!DOCTYPE html>\n<html>\n<body>\n  <h1>Dashboard Polyglotte IPL</h1>\n</body>\n</html>\n</file>\n\n`;
    output += `<file path="run_polyglot.bat">\n@echo off\necho Démarrage de la suite Microservices Polyglotte IPL...\ncd backend && cargo run\ncd ../analytics && python processor.py\npause\n</file>`;
    return output;
  }

  if (targetLang === 'rust') {
    return `<file path="Cargo.toml">\n[package]\nname = "ipl_app"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\ntokio = { version = "1.0", features = ["full"] }\n</file>\n\n<file path="src/main.rs">\n// --- Code Rust généré par IPL v1.0 ---\nfn main() {\n    println!("[IPL Rust] Master Execution Ready.");\n}\n</file>`;
  } else if (targetLang === 'python') {
    return `<file path="requirements.txt">\nasyncio\nrequests\n</file>\n\n<file path="main.py">\n# --- Code Python ---\nif __name__ == "__main__":\n    print("IPL Python Ready")\n</file>`;
  } else if (targetLang === 'javascript') {
    return `<file path="package.json">\n{\n  "name": "ipl-app",\n  "version": "1.0.0",\n  "main": "index.js"\n}\n</file>\n\n<file path="index.js">\nconsole.log("IPL JS Ready");\n</file>`;
  } else {
    return `<file path="main.${targetLang}">\n// --- Code ${targetLang.toUpperCase()} ---\n${iplCode}\n</file>`;
  }
}

/**
 * Compilation Autonome à Deux Étapes (Two-Pass Polyglot Multi-File Compiler avec Streaming)
 */
export async function compileIPL(
  iplCode: string,
  targetLang: TargetLanguage,
  config: LLMConfig,
  onLog?: (msg: string, type?: 'info' | 'warn' | 'success' | 'error') => void,
  onStreamChunk?: (accumulated: string) => void
): Promise<string> {
  const cacheKey = hashRequest(iplCode, targetLang);
  
  if (compilationCache.has(cacheKey)) {
    onLog?.('Résultat trouvé dans le cache local de compilation ⚡', 'info');
    const cached = compilationCache.get(cacheKey)!;
    onStreamChunk?.(cached);
    return cached;
  }

  try {
    // --- ÉTAPE 1 : PASSE D'ARCHITECTURE (Analyseur de Topologie) ---
    onLog?.(`[1/2] 🧠 Le LLM réfléchit et conçoit la topologie logicielle (${targetLang.toUpperCase()})...`, 'info');
    let topologyPlan = '';
    try {
      topologyPlan = await callLLM(getTopologyPrompt(targetLang), iplCode, config);
      onLog?.(`[1/2] Topologie logicielle multi-fichiers validée par l'Architecte 📐`, 'success');
    } catch (err: any) {
      onLog?.(`Étape 1 (Topologie) avec fallback local: ${err.message}`, 'warn');
      topologyPlan = JSON.stringify({ project_structure: [{ path: `main.${targetLang}`, purpose: 'Entry point' }] });
    }

    // --- ÉTAPE 2 : PASSE DE GÉNÉRATION STREAMING MULTI-FICHIERS ---
    onLog?.(`[2/2] ⚡ Génération et rédaction du code en direct (Streaming)...`, 'info');
    const multiFilePrompt = getMultiFileGenerationPrompt(targetLang, topologyPlan);
    
    let lastLoggedLength = 0;
    const compiledResult = await callLLM(multiFilePrompt, iplCode, config, (accumulated) => {
      onStreamChunk?.(accumulated);
      if (accumulated.length - lastLoggedLength > 150) {
        lastLoggedLength = accumulated.length;
        onLog?.(`[LLM 🧠] Rédaction en cours... (${accumulated.length} caractères générés)`, 'info');
      }
    });

    if (compiledResult && compiledResult.includes('<file path=')) {
      compilationCache.set(cacheKey, compiledResult);
      onLog?.(`[2/2] Architecture ${targetLang === 'polyglot' ? 'Polyglotte' : targetLang.toUpperCase()} générée avec succès (${compiledResult.length} car) ! 🚀`, 'success');
      return compiledResult;
    } else {
      const fallbackResult = compiledResult || fallbackTranspile(iplCode, targetLang);
      compilationCache.set(cacheKey, fallbackResult);
      onLog?.(`Projet généré et encapsulé dans l'artefact.`, 'success');
      return fallbackResult;
    }
  } catch (err: any) {
    onLog?.(`Ollama/API indisponible (${err.message}). Utilisation du compilateur déterministe de secours.`, 'warn');
    const fallbackResult = fallbackTranspile(iplCode, targetLang);
    compilationCache.set(cacheKey, fallbackResult);
    onStreamChunk?.(fallbackResult);
    return fallbackResult;
  }
}
