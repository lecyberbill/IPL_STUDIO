import type { LLMConfig } from '../../engine/llmGenerator';
import { DEFAULT_LLM_CONFIG } from '../../engine/llmGenerator';
import type { CustomTarget, PolyglotConfig } from '../types';
import type { StoreSlice } from '../types';
import { DEFAULT_CUSTOM_TARGETS, DEFAULT_POLYGLOT_CONFIG, DEFAULT_LAYOUT } from '../defaults';

export interface SettingsSlice {
  llmConfig: LLMConfig;
  isSettingsOpen: boolean;
  isProjectModalOpen: boolean;
  isGitModalOpen: boolean;
  isTutorialOpen: boolean;
  polyglotConfig: PolyglotConfig;
  isPolyglotModalOpen: boolean;
  customTargets: CustomTarget[];
  leftSidebarWidth: number;
  rightSidebarWidth: number;
  hasSeenWelcome: boolean;
  /** Systematic pre-delivery consolidation agent (deterministic gates + LLM review + auto-fix). */
  consolidationEnabled: boolean;
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
}

export const settingsSlice: StoreSlice<SettingsSlice> = (set, get) => ({
  llmConfig: DEFAULT_LLM_CONFIG,
  isSettingsOpen: false,
  isProjectModalOpen: false,
  isGitModalOpen: false,
  isTutorialOpen: false,
  polyglotConfig: DEFAULT_POLYGLOT_CONFIG,
  isPolyglotModalOpen: false,
  customTargets: DEFAULT_CUSTOM_TARGETS,
  leftSidebarWidth: DEFAULT_LAYOUT.leftSidebarWidth,
  rightSidebarWidth: DEFAULT_LAYOUT.rightSidebarWidth,
  hasSeenWelcome: false,
  consolidationEnabled: true,

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

  setLLMConfig: (configUpdate) => set((state) => ({
    llmConfig: { ...state.llmConfig, ...configUpdate }
  })),

  toggleSettings: () => set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),
  toggleProjectModal: () => set((state) => ({ isProjectModalOpen: !state.isProjectModalOpen })),
  toggleGitModal: () => set((state) => ({ isGitModalOpen: !state.isGitModalOpen })),
  toggleTutorial: () => set((state) => ({ isTutorialOpen: !state.isTutorialOpen })),
  completeWelcome: () => set({ hasSeenWelcome: true }),

  setLeftSidebarWidth: (w) => set({ leftSidebarWidth: Math.max(160, Math.min(650, w)) }),
  setRightSidebarWidth: (w) => set({ rightSidebarWidth: Math.max(260, Math.min(950, w)) }),

  toggleConsolidation: () => set((state) => ({ consolidationEnabled: !state.consolidationEnabled }))
});
