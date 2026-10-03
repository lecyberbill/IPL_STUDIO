import type { LLMConfig, FormFactor } from '../../engine/llmGenerator';
import { DEFAULT_LLM_CONFIG } from '../../engine/llmGenerator';
import type { Toolchains } from '../../engine/toolchains';
import type { CustomTarget, PolyglotConfig } from '../types';
import type { StoreSlice } from '../types';
import { BUILTIN_COMMANDS, type CustomCommand } from '../../engine/chatCommands';
import { DEFAULT_CUSTOM_TARGETS, DEFAULT_POLYGLOT_CONFIG, DEFAULT_LAYOUT, DEFAULT_CUSTOM_COMMANDS } from '../defaults';

export interface SettingsSlice {
  llmConfig: LLMConfig;
  isSettingsOpen: boolean;
  isProjectModalOpen: boolean;
  /** Edit-current-project modal (name + output dir). */
  isProjectEditOpen: boolean;
  toggleProjectEdit: () => void;
  isGitModalOpen: boolean;
  isTutorialOpen: boolean;
  polyglotConfig: PolyglotConfig;
  isPolyglotModalOpen: boolean;
  customTargets: CustomTarget[];
  /** User-defined chat micro-commands (`/id` → instruction macro). */
  customCommands: CustomCommand[];
  addCustomCommand: (cmd: CustomCommand) => void;
  updateCustomCommand: (id: string, patch: Partial<CustomCommand>) => void;
  deleteCustomCommand: (id: string) => void;
  leftSidebarWidth: number;
  rightSidebarWidth: number;
  hasSeenWelcome: boolean;
  /** Systematic pre-delivery consolidation agent (deterministic gates + LLM review + auto-fix). */
  consolidationEnabled: boolean;
  /** Execution form factor (P4): CLI / web / library — pinned in the prompt and gated deterministically. */
  formFactor: FormFactor;
  /** Explicit toolchain paths (Settings): override PATH for smoke checks and the run command. */
  toolchains: Toolchains;
  setToolchains: (toolchains: Toolchains) => void;
  setPolyglotConfig: (config: PolyglotConfig) => void;
  togglePolyglotModal: () => void;
  addCustomTarget: (target: Omit<CustomTarget, 'id'>) => void;
  deleteCustomTarget: (id: string) => void;
  setLLMConfig: (config: Partial<LLMConfig>) => void;
  toggleSettings: () => void;
  toggleProjectModal: () => void;
  toggleGitModal: () => void;
  toggleTutorial: () => void;
  completeWelcome: () => void;
  setLeftSidebarWidth: (width: number) => void;
  setRightSidebarWidth: (width: number) => void;
  toggleConsolidation: () => void;
  setFormFactor: (formFactor: FormFactor) => void;
}

export const settingsSlice: StoreSlice<SettingsSlice> = (set, get) => ({
  llmConfig: DEFAULT_LLM_CONFIG,
  isSettingsOpen: false,
  isProjectModalOpen: false,
  isProjectEditOpen: false,
  isGitModalOpen: false,
  isTutorialOpen: false,
  polyglotConfig: DEFAULT_POLYGLOT_CONFIG,
  isPolyglotModalOpen: false,
  customTargets: DEFAULT_CUSTOM_TARGETS,
  customCommands: DEFAULT_CUSTOM_COMMANDS,
  leftSidebarWidth: DEFAULT_LAYOUT.leftSidebarWidth,
  rightSidebarWidth: DEFAULT_LAYOUT.rightSidebarWidth,
  hasSeenWelcome: false,
  consolidationEnabled: true,
  formFactor: 'cli',
  toolchains: {},

  setPolyglotConfig: (config) => set((state) => ({
    polyglotConfig: config,
    projects: state.projects.map(p =>
      p.id === state.activeProjectId
        ? { ...p, polyglotConfig: config, updatedAt: new Date().toLocaleTimeString() }
        : p
    )
  })),

  togglePolyglotModal: () => set((state) => ({ isPolyglotModalOpen: !state.isPolyglotModalOpen })),

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

  addCustomCommand: (cmd) => {
    const id = cmd.id.trim().toLowerCase().replace(/^\/+/, '').replace(/[^a-z0-9-]/g, '-');
    if (!id) return;
    if (BUILTIN_COMMANDS.some(b => b.id === id) || get().customCommands.some(c => c.id === id)) {
      get().addLog(`Command "/${id}" already exists.`, 'warn');
      return;
    }
    set((state) => ({ customCommands: [...state.customCommands, { ...cmd, id }] }));
    get().addLog(`Command "/${id}" added.`, 'success');
  },
  updateCustomCommand: (id, patch) => {
    set((state) => ({ customCommands: state.customCommands.map(c => (c.id === id ? { ...c, ...patch } : c)) }));
  },
  deleteCustomCommand: (id) => {
    set((state) => ({ customCommands: state.customCommands.filter(c => c.id !== id) }));
    get().addLog(`Command "/${id}" removed.`, 'info');
  },

  setLLMConfig: (configUpdate) => set((state) => ({
    llmConfig: { ...state.llmConfig, ...configUpdate }
  })),

  toggleSettings: () => set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),
  toggleProjectModal: () => set((state) => ({ isProjectModalOpen: !state.isProjectModalOpen })),
  toggleProjectEdit: () => set((state) => ({ isProjectEditOpen: !state.isProjectEditOpen })),
  toggleGitModal: () => set((state) => ({ isGitModalOpen: !state.isGitModalOpen })),
  toggleTutorial: () => set((state) => ({ isTutorialOpen: !state.isTutorialOpen })),
  completeWelcome: () => set({ hasSeenWelcome: true }),

  setLeftSidebarWidth: (w) => set({ leftSidebarWidth: Math.max(160, Math.min(650, w)) }),
  setRightSidebarWidth: (w) => set({ rightSidebarWidth: Math.max(260, Math.min(950, w)) }),

  toggleConsolidation: () => set((state) => ({ consolidationEnabled: !state.consolidationEnabled })),

  setFormFactor: (formFactor) => set({ formFactor }),

  setToolchains: (toolchains) => set({ toolchains })
});
