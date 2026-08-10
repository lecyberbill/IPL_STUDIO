import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { validateIPLCode } from '../engine/iplGrammar';
import { DEFAULT_PROJECTS } from './defaults';
import type { IDEState } from './types';
import type { LogEntry, IPLProject, CustomTarget, PolyglotLayer, PolyglotConfig, ClarificationRequest } from './types';
import { editorSlice } from './slices/editorSlice';
import { logsSlice } from './slices/logsSlice';
import { projectsSlice } from './slices/projectsSlice';
import { settingsSlice } from './slices/settingsSlice';
import { generationSlice } from './slices/generationSlice';
import { diskSlice } from './slices/diskSlice';

export type {
  IDEState,
  LogEntry,
  IPLProject,
  CustomTarget,
  PolyglotLayer,
  PolyglotConfig,
  ClarificationRequest
};

/**
 * Slim store entry point. State and actions are composed from typed slices
 * (see ./slices/*) so the public API stays identical to the historical
 * monolithic store. Persistence semantics are preserved byte-for-byte.
 */
export const useIdeStore = create<IDEState>()(
  persist(
    (...a) => ({
      ...editorSlice(...a),
      ...logsSlice(...a),
      ...projectsSlice(...a),
      ...settingsSlice(...a),
      ...generationSlice(...a),
      ...diskSlice(...a),

      // Initial editor state mirrors the first example project.
      code: DEFAULT_PROJECTS[0].code,
      targetLang: DEFAULT_PROJECTS[0].targetLang,
      syntaxErrors: validateIPLCode(DEFAULT_PROJECTS[0].code)
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
        hasSeenWelcome: state.hasSeenWelcome,
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
