import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as monaco from 'monaco-editor';
import type { TargetLanguage, LLMConfig } from '../engine/llmCompiler';
import { DEFAULT_LLM_CONFIG, compileIPL } from '../engine/llmCompiler';
import type { SyntaxErrorItem, IPLVerb } from '../engine/iplGrammar';
import { validateIPLCode } from '../engine/iplGrammar';

export interface LogEntry {
  id: string;
  time: string;
  type: 'info' | 'success' | 'warn' | 'error';
  text: string;
}

export interface IPLProject {
  id: string;
  name: string;
  code: string;
  targetLang: TargetLanguage;
  outputDir?: string;
  sourceFiles?: Record<string, string>;
  activeSourceFile?: string;
  updatedAt: string;
}

export interface CustomTarget {
  id: string;
  name: string;
  extension: string;
  promptInstructions: string;
}

export interface IDEState {
  // Code & Editor state
  code: string;
  targetLang: TargetLanguage;
  compiledCode: string;
  isCompiling: boolean;
  editorViewMode: 'text' | 'blocks';
  syntaxErrors: SyntaxErrorItem[];
  
  // Custom Extensible Targets
  customTargets: CustomTarget[];
  addCustomTarget: (target: Omit<CustomTarget, 'id'>) => void;
  deleteCustomTarget: (id: string) => void;

  // Projects Management
  projects: IPLProject[];
  activeProjectId: string;

  // Monaco Reference for programmatic insertions preserving undo/redo
  editorInstance: monaco.editor.IStandaloneCodeEditor | null;

  // Logs & History
  logs: LogEntry[];

  // Settings & Modals
  llmConfig: LLMConfig;
  isSettingsOpen: boolean;
  isProjectModalOpen: boolean;
  isGitModalOpen: boolean;

  // Actions
  setCode: (newCode: string) => void;
  setTargetLang: (lang: TargetLanguage) => void;
  setEditorViewMode: (mode: 'text' | 'blocks') => void;
  setEditorInstance: (editor: monaco.editor.IStandaloneCodeEditor | null) => void;
  setLLMConfig: (config: Partial<LLMConfig>) => void;
  toggleSettings: () => void;
  toggleProjectModal: () => void;
  toggleGitModal: () => void;
  addLog: (text: string, type?: LogEntry['type']) => void;
  clearLogs: () => void;

  // Source Files Management (.ipl)
  createSourceFile: (filename: string) => void;
  switchSourceFile: (filename: string) => void;
  deleteSourceFile: (filename: string) => void;

  // Project Management Actions
  createProject: (name: string, templateCode?: string, outputDir?: string) => void;
  deleteProject: (id: string) => void;
  switchProject: (id: string) => void;
  renameProject: (id: string, newName: string) => void;
  setProjectOutputDir: (id: string, outputDir: string) => void;
  exportProject: (id?: string) => void;
  importProject: (fileName: string, fileContent: string) => void;
  writeArtifactToDisk: (id?: string) => Promise<boolean>;
  
  // Native Monaco insertion API preserving Undo/Redo (Ctrl+Z) and cursor position
  insertVerbSnippet: (verb: IPLVerb) => void;

  // Compilation & Autonomous Agent triggers
  runCompilation: () => Promise<void>;
  requestLLMCorrection: (userPrompt: string) => Promise<{ textReply: string; codeChanged: boolean }>;
  autoDebugAndFix: (customCmd?: string) => Promise<boolean>;
}

const DEFAULT_PROJECTS: IPLProject[] = [
  {
    id: 'proj-stresstest',
    name: 'Enterprise System Architecture',
    targetLang: 'python',
    updatedAt: new Date().toLocaleTimeString(),
    code: `// IPL v1.0 - Enterprise Multi-Services System Architecture Spec

add datacenter {
  name: "Eu-Central-Datacenter",
  region: "eu-west-1",
  nodes: 64,
  clusterState: "active"
}

add queue {
  name: "high-priority-tasks",
  maxCapacity: 10000,
  retryPolicy: "exponential-backoff"
}

listen event on "user:payment_completed" {
  try {
    read paymentDetails from eventData {
      where: amount > 0 && status == "settled"
    }

    compute taxDeduction from paymentDetails {
      rate: 0.20,
      applyExemption: false
    }

    if (paymentDetails.amount >= 5000) {
      add vipOrder {
        userId: paymentDetails.userId,
        amount: paymentDetails.amount,
        flag: "HIGH_VAL_TRANSACTION"
      }
      send alert to complianceTeam {
        channel: "slack-vip-channel",
        priority: "CRITICAL"
      }
    } else {
      add standardOrder {
        userId: paymentDetails.userId,
        amount: paymentDetails.amount
      }
    }

    search inventory in warehouse {
      query: paymentDetails.items,
      limit: 100
    }

    for item in inventory {
      if (item.stock < item.minimumThreshold) {
        send restockOrder to supplier {
          itemId: item.id,
          qtyNeeded: 500
        }
        set item.status = "restock_pending"
      } else {
        set item.stock = item.stock - item.quantity
      }
    }

    return {
      status: "SUCCESS",
      processedCount: inventory.length
    }

  } catch (err) {
    send log to centralizedLogging {
      level: "ERROR",
      message: err.message,
      stackTrace: err.stack
    }
    remove transientSession from memoryStore {
      where: sessionId == eventData.sessionId
    }
    return {
      status: "FAILED",
      reason: err.message
    }
  }
}`
  },
  {
    id: 'proj-ecommerce',
    name: 'E-Commerce Dashboard',
    targetLang: 'python',
    updatedAt: new Date().toLocaleTimeString(),
    code: `// IPL Project v1.0 - E-Commerce Dashboard
add catalog {
  name: "IPL Studio Store",
  currency: "USD"
}

read products from catalog {
  where: stock > 0
}

compute totalValue from products {
  taxRate: 0.20
}

if (totalValue > 1000) {
  send alert to manager {
    message: "High sales volume detected"
  }
}`
  },
  {
    id: 'proj-form',
    name: 'User Registration Form',
    targetLang: 'javascript',
    updatedAt: new Date().toLocaleTimeString(),
    code: `// IPL Project v1.0 - User Registration Form
add form {
  title: "Member Registration",
  fields: ["email", "password"]
}

listen event on "form:submit" {
  read email from form
  if (email != "") {
    send welcome to email
    set status = "success"
  } else {
    set status = "error"
  }
}`
  },
  {
    id: 'proj-hello',
    name: 'Hello World IPL',
    targetLang: 'html',
    updatedAt: new Date().toLocaleTimeString(),
    code: `// IPL Project v1.0 - Hello World
add message {
  text: "Hello World IPL Studio v1.0",
  target: "console"
}

compute timestamp from system
send message to screen
return success`
  }
];

export const useIdeStore = create<IDEState>()(
  persist(
    (set, get) => ({
      projects: DEFAULT_PROJECTS,
      activeProjectId: 'proj-ecommerce',
      code: DEFAULT_PROJECTS[0].code,
      targetLang: DEFAULT_PROJECTS[0].targetLang,
      compiledCode: '',
      isCompiling: false,
      editorViewMode: 'text',
      syntaxErrors: validateIPLCode(DEFAULT_PROJECTS[0].code),
      editorInstance: null,
      logs: [
        {
          id: 'init-1',
          time: new Date().toLocaleTimeString(),
          type: 'info',
          text: 'IPL Studio v1.0 initialized with persistent multi-project manager.'
        }
      ],
      customTargets: [
        {
          id: 'java',
          name: '☕ Java 21 Spring Boot (.java)',
          extension: 'java',
          promptInstructions: 'Generate a complete multi-file Java 21 Spring Boot enterprise application.'
        },
        {
          id: 'k8s',
          name: '☸️ Kubernetes Manifests (.yaml)',
          extension: 'yaml',
          promptInstructions: 'Generate complete Kubernetes production manifests (Deployment, Service, Ingress).'
        }
      ],
      llmConfig: DEFAULT_LLM_CONFIG,
      isSettingsOpen: false,
      isProjectModalOpen: false,
      isGitModalOpen: false,

      addCustomTarget: (newTarget) => {
        const id = newTarget.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const customObj: CustomTarget = { id, ...newTarget };
        set((state) => ({ customTargets: [...state.customTargets, customObj] }));
        get().addLog(`Nouvelle cible de compilation créée : "${newTarget.name}"`, 'success');
      },

      deleteCustomTarget: (id: string) => {
        set((state) => ({ customTargets: state.customTargets.filter(t => t.id !== id) }));
        get().addLog(`Cible custom "${id}" supprimée.`, 'info');
      },

      setCode: (newCode: string) => {
        const errors = validateIPLCode(newCode);
        const { activeProjectId, projects } = get();
        
        // Mettre à jour le code du projet actif dans la liste des projets
        const updatedProjects = projects.map(p => 
          p.id === activeProjectId 
            ? { ...p, code: newCode, updatedAt: new Date().toLocaleTimeString() }
            : p
        );

        set({ code: newCode, syntaxErrors: errors, projects: updatedProjects });
      },

      setTargetLang: (targetLang) => {
        const { activeProjectId, projects } = get();
        const updatedProjects = projects.map(p => 
          p.id === activeProjectId ? { ...p, targetLang } : p
        );

        set({ targetLang, projects: updatedProjects });
        get().addLog(`Cible de compilation du projet changée vers: ${targetLang.toUpperCase()}`, 'info');
      },

      setEditorViewMode: (editorViewMode) => set({ editorViewMode }),

      setEditorInstance: (editorInstance) => set({ editorInstance }),

      setLLMConfig: (configUpdate) => set((state) => ({
        llmConfig: { ...state.llmConfig, ...configUpdate }
      })),

      toggleSettings: () => set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),
      toggleProjectModal: () => set((state) => ({ isProjectModalOpen: !state.isProjectModalOpen })),
      toggleGitModal: () => set((state) => ({ isGitModalOpen: !state.isGitModalOpen })),

      addLog: (text, type = 'info') => {
        const newEntry: LogEntry = {
          id: Math.random().toString(36).substring(2, 9),
          time: new Date().toLocaleTimeString(),
          type,
          text
        };
        set((state) => ({ logs: [newEntry, ...state.logs.slice(0, 99)] }));
      },

      clearLogs: () => set({ logs: [] }),

      // Actions de gestion de projets
      createProject: (name: string, templateCode?: string) => {
        const newId = `proj-${Date.now()}`;
        const defaultCode = templateCode || `// Nouveau projet IPL : ${name}\nadd item {\n  name: "${name}"\n}\n`;
        const newProject: IPLProject = {
          id: newId,
          name: name.trim() || 'Nouveau Projet IPL',
          code: defaultCode,
          targetLang: 'python',
          updatedAt: new Date().toLocaleTimeString()
        };

        set((state) => ({
          projects: [newProject, ...state.projects],
          activeProjectId: newId,
          code: newProject.code,
          targetLang: newProject.targetLang,
          syntaxErrors: validateIPLCode(newProject.code),
          compiledCode: ''
        }));

        get().addLog(`Projet "${newProject.name}" créé et activé.`, 'success');
      },

      deleteProject: (id: string) => {
        const { projects, activeProjectId } = get();
        if (projects.length <= 1) {
          get().addLog(`Impossible de supprimer le seul projet existant.`, 'warn');
          return;
        }

        const projectToDelete = projects.find(p => p.id === id);
        const filtered = projects.filter(p => p.id !== id);
        
        let newActiveId = activeProjectId;
        let newCode = get().code;
        let newTarget = get().targetLang;

        if (activeProjectId === id) {
          newActiveId = filtered[0].id;
          newCode = filtered[0].code;
          newTarget = filtered[0].targetLang;
        }

        set({
          projects: filtered,
          activeProjectId: newActiveId,
          code: newCode,
          targetLang: newTarget,
          syntaxErrors: validateIPLCode(newCode),
          compiledCode: ''
        });

        get().addLog(`Projet "${projectToDelete?.name || id}" supprimé.`, 'info');
      },

      switchProject: (id: string) => {
        const targetProj = get().projects.find(p => p.id === id);
        if (targetProj) {
          set({
            activeProjectId: targetProj.id,
            code: targetProj.code,
            targetLang: targetProj.targetLang,
            syntaxErrors: validateIPLCode(targetProj.code),
            compiledCode: ''
          });
          get().addLog(`Basculé vers le projet "${targetProj.name}".`, 'info');
        }
      },

      renameProject: (id: string, newName: string) => {
        if (!newName.trim()) return;
        set((state) => ({
          projects: state.projects.map(p => 
            p.id === id ? { ...p, name: newName.trim(), updatedAt: new Date().toLocaleTimeString() } : p
          )
        }));
        get().addLog(`Projet renommé en "${newName}".`, 'info');
      },

      setProjectOutputDir: (id: string, outputDir: string) => {
        set((state) => ({
          projects: state.projects.map(p => 
            p.id === id ? { ...p, outputDir: outputDir.trim(), updatedAt: new Date().toLocaleTimeString() } : p
          )
        }));
        get().addLog(`Dossier d'output physique associé au projet : "${outputDir.trim()}"`, 'info');
      },

      writeArtifactToDisk: async (id?: string) => {
        const { projects, activeProjectId, compiledCode, code, targetLang, addLog } = get();
        const proj = projects.find(p => p.id === (id || activeProjectId));
        if (!proj) return false;

        const targetDir = proj.outputDir && proj.outputDir.trim()
          ? proj.outputDir.trim()
          : `d:/image_to_text/IPL/output/${proj.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

        if (!compiledCode) {
          addLog(`Impossible de matérialiser : le projet n'a pas encore été compilé.`, 'warn');
          return false;
        }

        try {
          const { buildProjectArtifact } = await import('../engine/artifactGenerator');
          const artifact = buildProjectArtifact(proj.name, targetLang, compiledCode, code);

          const response = await fetch('/api/write-artifact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              outputDir: targetDir,
              files: artifact.files
            })
          });

          if (response.ok) {
            const data = await response.json();
            addLog(`[Disque] Artefacts matérialisés avec succès ! ${data.writtenFilesCount} fichier(s) écrits dans "${data.targetDir}" 📂`, 'success');
            return true;
          } else {
            const errData = await response.json();
            addLog(`Erreur écriture disque: ${errData.error}`, 'error');
            return false;
          }
        } catch (err: any) {
          addLog(`Échec de la matérialisation physique sur le disque: ${err.message}`, 'error');
          return false;
        }
      },

      exportProject: (id?: string) => {
        const { projects, activeProjectId } = get();
        const proj = projects.find(p => p.id === (id || activeProjectId));
        if (!proj) return;

        const blob = new Blob([proj.code], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${proj.name.toLowerCase().replace(/\s+/g, '_')}.ipl`;
        a.click();
        URL.revokeObjectURL(url);

        get().addLog(`Fichier "${a.download}" exporté avec succès.`, 'success');
      },

      importProject: (fileName: string, fileContent: string) => {
        const cleanName = fileName.replace(/\.ipl$/i, '');
        get().createProject(cleanName, fileContent);
        get().addLog(`Fichier .ipl "${fileName}" importé avec succès.`, 'success');
      },

      insertVerbSnippet: (verb) => {
        const editor = get().editorInstance;
        if (!editor) {
          const currentCode = get().code;
          get().setCode(`${currentCode}\n\n${verb.snippet}`);
          get().addLog(`Snippet ${verb.name} inséré à la fin du document`, 'warn');
          return;
        }

        const selection = editor.getSelection() || new monaco.Selection(1, 1, 1, 1);
        const model = editor.getModel();
        
        // Calcul de l'indentation de la ligne courante du curseur
        const lineContent = model ? model.getLineContent(selection.startLineNumber) : '';
        const indentMatch = lineContent.match(/^\s*/);
        const currentIndent = indentMatch ? indentMatch[0] : '';

        // Indenter chaque ligne du snippet pour qu'il s'imbrique parfaitement
        const indentedSnippet = verb.snippet
          .split('\n')
          .map((line, idx) => (idx === 0 ? line : currentIndent + line))
          .join('\n');

        const textToInsert = indentedSnippet;

        editor.executeEdits('ipl-palette-insert', [
          {
            range: selection,
            text: textToInsert,
            forceMoveMarkers: true
          }
        ]);

        editor.focus();
        get().addLog(`Brique de verbe "${verb.name}" insérée au niveau du curseur (Ctrl+Z actif)`, 'success');
      },

      createSourceFile: (filename: string) => {
        const { projects, activeProjectId } = get();
        const activeProj = projects.find(p => p.id === activeProjectId);
        if (!activeProj) return;

        const currentFiles = activeProj.sourceFiles || { 'main.ipl': activeProj.code };
        const initialContent = `// Fichier source IPL : ${filename}\nadd module {\n  name: "${filename.replace(/\.ipl$/, '')}"\n}\n`;
        const updatedFiles = { ...currentFiles, [filename]: initialContent };

        set((state) => ({
          projects: state.projects.map(p => 
            p.id === activeProjectId 
              ? { ...p, sourceFiles: updatedFiles, activeSourceFile: filename } 
              : p
          ),
          code: initialContent,
          syntaxErrors: validateIPLCode(initialContent)
        }));

        get().addLog(`Fichier source "${filename}" créé et activé.`, 'success');
      },

      switchSourceFile: (filename: string) => {
        const { projects, activeProjectId } = get();
        const activeProj = projects.find(p => p.id === activeProjectId);
        if (!activeProj) return;

        const currentFiles = activeProj.sourceFiles || { 'main.ipl': activeProj.code };
        const targetContent = currentFiles[filename] || '';

        set((state) => ({
          projects: state.projects.map(p => 
            p.id === activeProjectId ? { ...p, activeSourceFile: filename } : p
          ),
          code: targetContent,
          syntaxErrors: validateIPLCode(targetContent)
        }));

        get().addLog(`Basculé sur le fichier source "${filename}".`, 'info');
      },

      deleteSourceFile: (filename: string) => {
        const { projects, activeProjectId } = get();
        const activeProj = projects.find(p => p.id === activeProjectId);
        if (!activeProj || filename === 'main.ipl') return;

        const currentFiles = { ...(activeProj.sourceFiles || { 'main.ipl': activeProj.code }) };
        delete currentFiles[filename];

        set((state) => ({
          projects: state.projects.map(p => 
            p.id === activeProjectId 
              ? { ...p, sourceFiles: currentFiles, activeSourceFile: 'main.ipl' } 
              : p
          ),
          code: currentFiles['main.ipl'] || '',
          syntaxErrors: validateIPLCode(currentFiles['main.ipl'] || '')
        }));

        get().addLog(`Fichier source "${filename}" supprimé.`, 'info');
      },

      runCompilation: async () => {
        const { code, targetLang, llmConfig, addLog, projects, activeProjectId } = get();
        const activeProj = projects.find(p => p.id === activeProjectId);
        set({ isCompiling: true });

        const errors = validateIPLCode(code);
        if (errors.length > 0) {
          addLog(`Erreur de syntaxe détectée : ${errors[0].message} (Ligne ${errors[0].line})`, 'error');
        }

        const { resolveIPLImports } = await import('../engine/iplGrammar');
        const unifiedCode = resolveIPLImports(code, activeProj?.sourceFiles);

        const result = await compileIPL(
          unifiedCode, 
          targetLang, 
          llmConfig, 
          (msg, type) => {
            addLog(msg, type);
          },
          (streamChunkText) => {
            set({ compiledCode: streamChunkText });
          }
        );

        set({ compiledCode: result, isCompiling: false });
        await get().writeArtifactToDisk();
      },

      requestLLMCorrection: async (userPrompt: string) => {
        const { compiledCode, targetLang, llmConfig, addLog } = get();
        if (!userPrompt.trim()) return { textReply: '', codeChanged: false };

        set({ isCompiling: true });
        try {
          const { refineIPLArtifact } = await import('../engine/llmCompiler');
          const { parseMultiFileXml } = await import('../engine/artifactGenerator');

          const rawResult = await refineIPLArtifact(
            compiledCode || '',
            userPrompt.trim(),
            targetLang,
            llmConfig,
            (msg, type) => addLog(msg, type)
          );

          const fileMatches = parseMultiFileXml(rawResult);

          if (fileMatches.length > 0) {
            set({ compiledCode: rawResult, isCompiling: false });
            await get().writeArtifactToDisk();

            const textReply = rawResult.replace(/<file\s+path=["']([^"']+)["']\s*>([\s\S]*?)<\/file>/gi, '').trim();
            return {
              textReply: textReply || `I have updated your project files according to your request: "${userPrompt.trim()}".`,
              codeChanged: true
            };
          } else {
            // Conversational response only - DO NOT overwrite project code!
            set({ isCompiling: false });
            return {
              textReply: rawResult.trim() || 'I am ready to help you with your project.',
              codeChanged: false
            };
          }
        } catch (err: any) {
          addLog(`LLM Chat Error: ${err.message}`, 'error');
          set({ isCompiling: false });
          return {
            textReply: `Error: ${err.message}`,
            codeChanged: false
          };
        }
      },

      autoDebugAndFix: async (customCmd?: string) => {
        const { projects, activeProjectId, targetLang, llmConfig, addLog, writeArtifactToDisk } = get();
        const activeProj = projects.find(p => p.id === activeProjectId);
        const outputDir = activeProj?.outputDir || `d:/image_to_text/IPL/output/${activeProj?.name.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'mon_projet'}`;

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
          addLog(`[Agent Codeur 🤖] Pass ${attempt}/${maxAttempts} - Diagnostic et exécution de "${cmdToRun}"...`, 'info');
          
          await writeArtifactToDisk();

          let outputLog = '';
          try {
            const response = await fetch('/api/run-command', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ command: cmdToRun, cwd: outputDir })
            });
            const text = await response.text();
            outputLog = text;
          } catch (err: any) {
            outputLog = err.message;
          }

          const hasError = outputLog.includes('Processus terminé avec le code 1') || 
                           outputLog.includes('Processus terminé avec le code 101') ||
                           outputLog.includes('Traceback (most recent call last)') ||
                           outputLog.includes('error:') || 
                           outputLog.includes('Error:');

          if (!hasError) {
            addLog(`[Agent Codeur 🤖] 🎉 Exécution réussie à 100% à la passe ${attempt} ! Aucun bug détecté.`, 'success');
            return true;
          }

          addLog(`[Agent Codeur 🤖] ⚠️ Erreur détectée dans la console. Analyse du stacktrace et réparation en cours...`, 'warn');
          
          set({ isCompiling: true });
          try {
            const { refineIPLArtifact } = await import('../engine/llmCompiler');
            const promptCorrection = `LE CODE A ÉCHOUÉ À L'EXÉCUTION TERMINAL AVEC L'ERREUR SUIVANTE. ANALYSE ET CORRIGE LES FICHIERS POUR QUE LE SCRIPT S'EXÉCUTE SANS ERREUR :\n\nConsole Log Output:\n${outputLog.substring(0, 2000)}`;
            
            const fixedResult = await refineIPLArtifact(
              get().compiledCode || '',
              promptCorrection,
              targetLang,
              llmConfig,
              (msg, type) => addLog(msg, type),
              (streamChunkText) => set({ compiledCode: streamChunkText })
            );

            set({ compiledCode: fixedResult, isCompiling: false });
            await writeArtifactToDisk();
          } catch (err: any) {
            addLog(`Échec de l'auto-réparation LLM: ${err.message}`, 'error');
            set({ isCompiling: false });
            return false;
          }
        }

        addLog(`[Autonomous Agent 🤖] Completed 3 self-healing repair passes. Inspect the terminal log.`, 'warn');
        return false;
      }
    }),
    {
      name: 'ipl-studio-store-v4',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        projects: state.projects,
        activeProjectId: state.activeProjectId,
        llmConfig: state.llmConfig,
        targetLang: state.targetLang,
        customTargets: state.customTargets
      })
    }
  )
);
