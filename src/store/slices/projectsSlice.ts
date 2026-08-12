import { validateIPLCode } from '../../engine/iplGrammar';
import { defaultOutputDir } from '../../engine/paths';
import type { IPLProject } from '../types';
import type { StoreSlice } from '../types';
import { DEFAULT_PROJECTS } from '../defaults';

export interface ProjectsSlice {
  projects: IPLProject[];
  activeProjectId: string;
  createProject: (name: string, templateCode?: string, outputDir?: string) => void;
  deleteProject: (id: string) => void;
  switchProject: (id: string) => void;
  renameProject: (id: string, newName: string) => void;
  setProjectOutputDir: (id: string, outputDir: string) => void;
  exportProject: (id?: string) => void;
  importProject: (fileName: string, fileContent: string) => void;
  createSourceFile: (filename: string) => void;
  switchSourceFile: (filename: string) => void;
  deleteSourceFile: (filename: string) => void;
}

export const projectsSlice: StoreSlice<ProjectsSlice> = (set, get) => ({
  projects: DEFAULT_PROJECTS,
  activeProjectId: DEFAULT_PROJECTS[0].id,

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
      generatedCode: '',
      consolidationResult: null,
      selectedFilePath: '',
      runUsage: null
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
      generatedCode: '',
      consolidationResult: null,
      selectedFilePath: '',
      runUsage: null
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
        generatedCode: '',
        consolidationResult: null,
        selectedFilePath: '',
        runUsage: null
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
  }
});
