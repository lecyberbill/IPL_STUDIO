import type * as monaco from 'monaco-editor';
import type { TargetLanguage, LLMConfig } from '../engine/llmGenerator';
import type { SyntaxErrorItem, IPLVerb } from '../engine/iplGrammar';
import type { StateCreator } from 'zustand';

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

export interface ClarificationRequest {
  question: string;
  errorLog: string;
  cmdToRun: string;
  attempt: number;
}

export interface IDEState {
  // Code & Editor state
  code: string;
  targetLang: TargetLanguage;
  generatedCode: string;
  isGenerating: boolean;
  editorViewMode: 'text' | 'blocks';
  syntaxErrors: SyntaxErrorItem[];
  editorInstance: monaco.editor.IStandaloneCodeEditor | null;
  /** Last generation / LLM failure surfaced to the UI, or null when none. */
  generationError: string | null;
  /** Dismiss the current generation error banner. */
  clearGenerationError: () => void;

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

  // Logs & History
  logs: LogEntry[];

  // Settings & Modals
  llmConfig: LLMConfig;
  isSettingsOpen: boolean;
  isProjectModalOpen: boolean;
  isGitModalOpen: boolean;
  isTutorialOpen: boolean;
  toggleTutorial: () => void;
  /** First-run onboarding: set to true once the welcome modal has been dismissed. */
  hasSeenWelcome: boolean;
  completeWelcome: () => void;

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
  /** Set when the self-healing loop paused because the LLM asked a precision. */
  pendingClarification: ClarificationRequest | null;
  /** User answers the pending clarification; the agent resumes repair and re-runs. */
  answerClarification: (answer: string) => Promise<boolean>;
  clearPendingClarification: () => void;
}

/**
 * A Zustand slice: a partial builder over the full IDEState.
 * `set`/`get` are typed on IDEState so slices can call each other freely.
 */
export type StoreSlice<T> = StateCreator<IDEState, [], [], T>;
