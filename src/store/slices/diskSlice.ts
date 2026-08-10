import { apiFetch } from '../../services/api';
import { buildProjectArtifact } from '../../engine/artifactGenerator';
import { defaultOutputDir } from '../../engine/paths';
import type { StoreSlice } from '../types';

export interface DiskSlice {
  writeArtifactToDisk: (id?: string) => Promise<boolean>;
  readArtifactFromDisk: (id?: string) => Promise<boolean>;
}

export const diskSlice: StoreSlice<DiskSlice> = (set, get) => ({
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
      const artifact = buildProjectArtifact(proj.name, targetLang, generatedCode, code);

      const performWrite = (): Promise<Response> => apiFetch('/api/write-artifact', {
        method: 'POST',
        body: JSON.stringify({
          outputDir: targetDir,
          files: artifact.files
        })
      });

      let response = await performWrite();

      // Sandbox: external output folders require an explicit user confirmation
      // before the server will write there. Ask once, persist server-side, retry.
      if (response.status === 403) {
        const errData = await response.json();
        if (errData.code === 'PATH_CONFIRMATION_REQUIRED' && errData.path) {
          const confirmed = window.confirm(
            `Allow IPL Studio to write into the external folder:\n\n${errData.path}\n\n`
            + 'This directory is outside the project workspace. You already selected it as this project\'s output folder. Confirm to continue.'
          );
          if (confirmed) {
            await apiFetch('/api/confirm-path', {
              method: 'POST',
              body: JSON.stringify({ path: errData.path })
            });
            response = await performWrite();
          } else {
            addLog('Disk write cancelled: external output directory was not confirmed.', 'warn');
            return false;
          }
        }
      }

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
      const response = await apiFetch('/api/read-disk', {
        method: 'POST',
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
  }
});
