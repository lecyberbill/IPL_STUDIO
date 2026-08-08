import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as monaco from 'monaco-editor';
import type { TargetLanguage, LLMConfig } from '../engine/llmGenerator';
import { DEFAULT_LLM_CONFIG, generateIPL } from '../engine/llmGenerator';
import type { SyntaxErrorItem, IPLVerb } from '../engine/iplGrammar';
import { validateIPLCode } from '../engine/iplGrammar';
import { defaultOutputDir } from '../engine/paths';

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
  polyglotConfig?: PolyglotConfig;
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

export interface PolyglotLayer {
  id: string;
  role: string;
  tech: string;
}

export interface PolyglotConfig {
  autoDecide: boolean;
  layers: PolyglotLayer[];
}

export interface IDEState {
  // Code & Editor state
  code: string;
  targetLang: TargetLanguage;
  generatedCode: string;
  isGenerating: boolean;
  editorViewMode: 'text' | 'blocks';
  syntaxErrors: SyntaxErrorItem[];

  // Polyglot Stack Config
  polyglotConfig: PolyglotConfig;
  isPolyglotModalOpen: boolean;
  setPolyglotConfig: (config: PolyglotConfig) => void;
  togglePolyglotModal: () => void;
  
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
  isTutorialOpen: boolean;
  toggleTutorial: () => void;

  // Layout & Resizing
  leftSidebarWidth: number;
  rightSidebarWidth: number;
  setLeftSidebarWidth: (width: number) => void;
  setRightSidebarWidth: (width: number) => void;

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
  readArtifactFromDisk: (id?: string) => Promise<boolean>;
  
  // Native Monaco insertion API preserving Undo/Redo (Ctrl+Z) and cursor position
  insertVerbSnippet: (verb: IPLVerb) => void;
  insertSnippetText: (snippetText: string, label?: string) => void;

  // Generation & Autonomous Agent triggers
  runGeneration: () => Promise<void>;
  requestLLMCorrection: (userPrompt: string) => Promise<{ textReply: string; codeChanged: boolean }>;
  autoDebugAndFix: (customCmd?: string) => Promise<boolean>;
}

const DEFAULT_PROJECTS: IPLProject[] = [
  {
    id: 'proj-typed-order',
    name: '[Exemple] Typed E-Commerce Order Spec',
    targetLang: 'rust',
    updatedAt: new Date().toLocaleTimeString(),
    code: `// IPL Project v1.0 - Typed E-Commerce Order Spec (Human Intent Types)
add entity Order {
  id: id,
  customerName: text,
  totalAmount: number,
  isPaid: boolean,
  createdAt: date,
  status: options("pending", "processing", "shipped", "delivered")
}

listen event on "checkout:completed" {
  read orderData from event {
    where: totalAmount > 0
  }

  if (orderData.isPaid == true) {
    set orderData.status = "processing"
    send confirmationEmail to orderData.customerName {
      subject: "Order Confirmation",
      orderId: orderData.id
    }
  } else {
    set orderData.status = "pending"
  }
}`
  },
  {
    id: 'proj-stresstest',
    name: '[Exemple] Architecture Enterprise System',
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
    name: '[Exemple] E-Commerce Dashboard',
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
    name: '[Exemple] Formulaire d\'Inscription',
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
    name: '[Exemple] Hello World Application',
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
      activeProjectId: 'proj-typed-order',
      code: DEFAULT_PROJECTS[0].code,
      targetLang: DEFAULT_PROJECTS[0].targetLang,
      generatedCode: '',
      isGenerating: false,
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
      polyglotConfig: {
        autoDecide: true,
        layers: [
          { id: 'l-1', role: 'Backend API', tech: 'Python 3 (FastAPI / Flask)' },
          { id: 'l-2', role: 'Frontend UI', tech: 'HTML5 / JavaScript (Vanilla / Tailwind)' }
        ]
      },
      isPolyglotModalOpen: false,
      setPolyglotConfig: (config) => set((state) => ({
        polyglotConfig: config,
        projects: state.projects.map(p => 
          p.id === state.activeProjectId 
            ? { ...p, polyglotConfig: config, updatedAt: new Date().toLocaleTimeString() } 
            : p
        )
      })),
      togglePolyglotModal: () => set((state) => ({ isPolyglotModalOpen: !state.isPolyglotModalOpen })),
      llmConfig: DEFAULT_LLM_CONFIG,
      isSettingsOpen: false,
      isProjectModalOpen: false,
      isGitModalOpen: false,
      isTutorialOpen: false,

      leftSidebarWidth: 280,
      rightSidebarWidth: 520,

      setLeftSidebarWidth: (w) => set({ leftSidebarWidth: Math.max(160, Math.min(650, w)) }),
      setRightSidebarWidth: (w) => set({ rightSidebarWidth: Math.max(260, Math.min(950, w)) }),

      addCustomTarget: (newTarget) => {
        const id = newTarget.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const customObj: CustomTarget = { id, ...newTarget };
        set((state) => ({ customTargets: [...state.customTargets, customObj] }));
        get().addLog(`New generation target created: "${newTarget.name}"`, 'success');
      },

      deleteCustomTarget: (id: string) => {
        set((state) => ({ customTargets: state.customTargets.filter(t => t.id !== id) }));
        get().addLog(`Custom target "${id}" removed.`, 'info');
      },

      setCode: (newCode: string) => {
        const errors = validateIPLCode(newCode);
        const { activeProjectId, projects } = get();
        
        // Update the active project's code in the projects list
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
        get().addLog(`Project generation target changed to: ${targetLang.toUpperCase()}`, 'info');
      },

      setEditorViewMode: (editorViewMode) => set({ editorViewMode }),

      setEditorInstance: (editorInstance) => set({ editorInstance }),

      setLLMConfig: (configUpdate) => set((state) => ({
        llmConfig: { ...state.llmConfig, ...configUpdate }
      })),

      toggleSettings: () => set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),
      toggleProjectModal: () => set((state) => ({ isProjectModalOpen: !state.isProjectModalOpen })),
      toggleGitModal: () => set((state) => ({ isGitModalOpen: !state.isGitModalOpen })),
      toggleTutorial: () => set((state) => ({ isTutorialOpen: !state.isTutorialOpen })),

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

      createProject: (name: string, templateCode?: string, outputDir?: string) => {
        const newId = `proj-${Date.now()}`;
        const defaultCode = templateCode || `// New IPL Project: ${name}\nadd item {\n  name: "${name}"\n}\n`;
        const finalOutputDir = outputDir?.trim() || defaultOutputDir(name);

        const newProject: IPLProject = {
          id: newId,
          name: name.trim() || 'New IPL Project',
          code: defaultCode,
          targetLang: 'python',
          outputDir: finalOutputDir,
          updatedAt: new Date().toLocaleTimeString()
        };

        set((state) => ({
          projects: [newProject, ...state.projects],
          activeProjectId: newId,
          code: newProject.code,
          targetLang: newProject.targetLang,
          syntaxErrors: validateIPLCode(newProject.code),
          generatedCode: ''
        }));

        get().addLog(`Project "${newProject.name}" created and activated.`, 'success');
      },

      deleteProject: (id: string) => {
        const { projects, activeProjectId } = get();
        if (projects.length <= 1) {
          get().addLog(`Cannot delete the only remaining project.`, 'warn');
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
          generatedCode: ''
        });

        get().addLog(`Project "${projectToDelete?.name || id}" deleted.`, 'info');
      },

      switchProject: (id: string) => {
        const targetProj = get().projects.find(p => p.id === id);
        if (targetProj) {
          set({
            activeProjectId: targetProj.id,
            code: targetProj.code,
            targetLang: targetProj.targetLang,
            polyglotConfig: targetProj.polyglotConfig || {
              autoDecide: true,
              layers: [
                { id: 'l-1', role: 'Backend API', tech: 'Python 3 (FastAPI / Flask)' },
                { id: 'l-2', role: 'Frontend UI', tech: 'HTML5 / JavaScript (Vanilla / Tailwind)' }
              ]
            },
            syntaxErrors: validateIPLCode(targetProj.code),
            generatedCode: ''
          });
          get().addLog(`Switched to project "${targetProj.name}".`, 'info');
          if (targetProj.outputDir) {
            get().readArtifactFromDisk(targetProj.id);
          }
        }
      },

      renameProject: (id: string, newName: string) => {
        if (!newName.trim()) return;
        set((state) => ({
          projects: state.projects.map(p => 
            p.id === id ? { ...p, name: newName.trim(), updatedAt: new Date().toLocaleTimeString() } : p
          )
        }));
        get().addLog(`Project renamed to "${newName}".`, 'info');
      },

      setProjectOutputDir: (id: string, outputDir: string) => {
        set((state) => ({
          projects: state.projects.map(p => 
            p.id === id ? { ...p, outputDir: outputDir.trim(), updatedAt: new Date().toLocaleTimeString() } : p
          )
        }));
        get().addLog(`Output directory associated with project: "${outputDir.trim()}"`, 'info');
      },

      writeArtifactToDisk: async (id?: string) => {
        const { projects, activeProjectId, generatedCode, code, targetLang, addLog } = get();
        const proj = projects.find(p => p.id === (id || activeProjectId));
        if (!proj) return false;

        const targetDir = proj.outputDir && proj.outputDir.trim()
          ? proj.outputDir.trim()
          : defaultOutputDir(proj.name);

        if (!generatedCode) {
          addLog(`Cannot materialize: the project has not been generated yet.`, 'warn');
          return false;
        }

        try {
          const { buildProjectArtifact } = await import('../engine/artifactGenerator');
          const artifact = buildProjectArtifact(proj.name, targetLang, generatedCode, code);

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
            addLog(`[Disk] Artifacts materialized successfully! ${data.writtenFilesCount} file(s) written to "${data.targetDir}" 📂`, 'success');
            return true;
          } else {
            const errData = await response.json();
            addLog(`Disk write error: ${errData.error}`, 'error');
            return false;
          }
        } catch (err: any) {
          addLog(`Failed to materialize artifacts on disk: ${err.message}`, 'error');
          return false;
        }
      },

      readArtifactFromDisk: async (id?: string) => {
        const { projects, activeProjectId, addLog } = get();
        const proj = projects.find(p => p.id === (id || activeProjectId));
        if (!proj) return false;

        const targetDir = proj.outputDir && proj.outputDir.trim()
          ? proj.outputDir.trim()
          : defaultOutputDir(proj.name);

        try {
          const response = await fetch('/api/read-disk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ outputDir: targetDir })
          });

          if (response.ok) {
            const data = await response.json();
            const diskFiles: Array<{ relativePath: string; content: string }> = data.files || [];
            
            if (diskFiles.length === 0) {
              set({ generatedCode: '' });
              addLog(`[Disk] Disk sync: The folder "${data.targetDir}" is empty.`, 'warn');
              return true;
            }

            const xmlGeneratedCode = diskFiles.map(f => `<file path="${f.relativePath}">\n${f.content}\n</file>`).join('\n\n');
            
            set({ generatedCode: xmlGeneratedCode });
            addLog(`[Disk] Disk sync successful! ${diskFiles.length} file(s) scanned and updated from "${data.targetDir}" 🔄`, 'success');
            return true;
          } else {
            const errData = await response.json();
            addLog(`Disk read error: ${errData.error}`, 'error');
            return false;
          }
        } catch (err: any) {
          addLog(`Disk sync failed: ${err.message}`, 'error');
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

        get().addLog(`File "${a.download}" exported successfully.`, 'success');
      },

      importProject: (fileName: string, fileContent: string) => {
        const cleanName = fileName.replace(/\.ipl$/i, '');
        get().createProject(cleanName, fileContent);
        get().addLog(`IPL file "${fileName}" imported successfully.`, 'success');
      },

      insertVerbSnippet: (verb) => {
        const editor = get().editorInstance;
        if (!editor) {
          const currentCode = get().code;
          get().setCode(`${currentCode}\n\n${verb.snippet}`);
          get().addLog(`Snippet ${verb.name} inserted at end of document`, 'warn');
          return;
        }

        const selection = editor.getSelection() || new monaco.Selection(1, 1, 1, 1);
        const model = editor.getModel();
        
        // Calcul de l'indentation de la ligne courante du curseur
        const lineContent = model ? model.getLineContent(selection.startLineNumber) : '';
        const indentMatch = lineContent.match(/^\s*/);
        const currentIndent = indentMatch ? indentMatch[0] : '';

        // Indent each snippet line so it nests cleanly
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
        get().addLog(`Verb block "${verb.name}" inserted at cursor (Ctrl+Z enabled)`, 'success');
      },

      insertSnippetText: (snippetText, label) => {
        const editor = get().editorInstance;
        if (!editor) {
          const currentCode = get().code;
          get().setCode(`${currentCode} ${snippetText}`);
          get().addLog(`Type "${label || snippetText}" inserted.`, 'info');
          return;
        }

        const selection = editor.getSelection() || new monaco.Selection(1, 1, 1, 1);
        editor.executeEdits('ipl-type-insert', [
          {
            range: selection,
            text: snippetText,
            forceMoveMarkers: true
          }
        ]);
        editor.focus();
        get().addLog(`Intent type "${label || snippetText}" inserted at cursor position`, 'info');
      },

      createSourceFile: (filename: string) => {
        const { projects, activeProjectId } = get();
        const activeProj = projects.find(p => p.id === activeProjectId);
        if (!activeProj) return;

        const currentFiles = activeProj.sourceFiles || { 'main.ipl': activeProj.code };
        const initialContent = `// IPL source file: ${filename}\nadd module {\n  name: "${filename.replace(/\.ipl$/, '')}"\n}\n`;
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

        get().addLog(`Source file "${filename}" created and activated.`, 'success');
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

        get().addLog(`Switched to source file "${filename}".`, 'info');
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

        get().addLog(`Source file "${filename}" deleted.`, 'info');
      },

      runGeneration: async () => {
        const { code, targetLang, llmConfig, polyglotConfig, addLog, projects, activeProjectId } = get();
        const activeProj = projects.find(p => p.id === activeProjectId);
        set({ isGenerating: true });

        try {
          const errors = validateIPLCode(code);
          if (errors.length > 0) {
            addLog(`Advisory IPL check: ${errors[0].message} (line ${errors[0].line}). Generation continues.`, 'warn');
          }

          const { resolveIPLImports } = await import('../engine/iplGrammar');
          const unifiedCode = resolveIPLImports(code, activeProj?.sourceFiles);

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

          set({ generatedCode: result, isGenerating: false });
          await get().writeArtifactToDisk();
        } catch (err: any) {
          addLog(`Generation error: ${err.message}`, 'error');
        } finally {
          set({ isGenerating: false });
        }
      },

      requestLLMCorrection: async (userPrompt: string) => {
        const { generatedCode, targetLang, llmConfig, addLog } = get();
        if (!userPrompt.trim()) return { textReply: '', codeChanged: false };

        set({ isGenerating: true });
        try {
          const { refineIPLArtifact } = await import('../engine/llmGenerator');
          const { parseMultiFileXml } = await import('../engine/artifactGenerator');

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
            const { refineIPLArtifact } = await import('../engine/llmGenerator');
            const promptCorrection = `THE CODE FAILED TO EXECUTE IN THE TERMINAL WITH THE FOLLOWING ERROR. ANALYZE AND FIX THE FILES SO THE SCRIPT RUNS WITHOUT ERROR:\n\nConsole Log Output:\n${outputLog.substring(0, 2000)}`;
            
            const fixedResult = await refineIPLArtifact(
              get().generatedCode || '',
              promptCorrection,
              targetLang,
              llmConfig,
              (msg, type) => addLog(msg, type),
              (streamChunkText) => set({ generatedCode: streamChunkText })
            );

            const { parseMultiFileXml } = await import('../engine/artifactGenerator');
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
      }
    }),
    {
      name: 'ipl-studio-store-v6',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        projects: state.projects,
        activeProjectId: state.activeProjectId,
        code: state.code,
        generatedCode: state.generatedCode,
        llmConfig: state.llmConfig,
        targetLang: state.targetLang,
        polyglotConfig: state.polyglotConfig,
        customTargets: state.customTargets,
        leftSidebarWidth: state.leftSidebarWidth,
        rightSidebarWidth: state.rightSidebarWidth
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          const activeProj = state.projects.find(p => p.id === state.activeProjectId);
          if (activeProj) {
            if (activeProj.code && (!state.code || state.code === DEFAULT_PROJECTS[0].code)) {
              state.code = activeProj.code;
            }
            if (activeProj.targetLang) {
              state.targetLang = activeProj.targetLang;
            }
            if (activeProj.polyglotConfig) {
              state.polyglotConfig = activeProj.polyglotConfig;
            }
            state.syntaxErrors = validateIPLCode(state.code || activeProj.code || '');
            if (activeProj.outputDir) {
              state.readArtifactFromDisk(activeProj.id);
            }
          }
        }
      }
    }
  )
);
