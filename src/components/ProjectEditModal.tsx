import React, { useEffect, useState } from 'react';
import { useIdeStore } from '../store/useIdeStore';
import { defaultOutputDir } from '../engine/paths';
import { Pencil, X, Check } from 'lucide-react';

/**
 * Edit-current-project modal: rename + change the disk output directory.
 * Uses the existing renameProject / setProjectOutputDir store actions.
 */
export const ProjectEditModal: React.FC = () => {
  const { isProjectEditOpen, toggleProjectEdit, projects, activeProjectId, renameProject, setProjectOutputDir } = useIdeStore();
  const proj = projects.find(p => p.id === activeProjectId);

  const [name, setName] = useState('');
  const [outputDir, setOutputDir] = useState('');

  useEffect(() => {
    if (isProjectEditOpen && proj) {
      setName(proj.name);
      setOutputDir(proj.outputDir || defaultOutputDir(proj.name));
    }
  }, [isProjectEditOpen, proj]);

  if (!isProjectEditOpen || !proj) return null;

  const save = () => {
    const cleanName = name.trim();
    if (cleanName && cleanName !== proj.name) renameProject(proj.id, cleanName);
    const cleanDir = outputDir.trim();
    if (cleanDir && cleanDir !== proj.outputDir) setProjectOutputDir(proj.id, cleanDir);
    toggleProjectEdit();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center" onClick={toggleProjectEdit}>
      <div className="bg-[#161922] border border-[#2a2f42] rounded-xl w-[460px] shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2f42]">
          <div className="flex items-center space-x-2 text-sm font-semibold text-white">
            <Pencil size={15} className="text-cyan-400" />
            <span>Edit project</span>
          </div>
          <button onClick={toggleProjectEdit} className="p-1 text-gray-400 hover:text-white hover:bg-[#2a2f42] rounded transition-colors" title="Close">
            <X size={15} />
          </button>
        </div>

        <div className="p-4 space-y-3 text-xs">
          <label className="block space-y-1">
            <span className="text-gray-400">Project name</span>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              className="w-full bg-[#0f1117] border border-[#2a2f42] rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-cyan-500"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-gray-400">Output directory (disk)</span>
            <input
              value={outputDir}
              onChange={e => setOutputDir(e.target.value)}
              placeholder={defaultOutputDir(name || 'my_project')}
              className="w-full bg-[#0f1117] border border-[#2a2f42] rounded px-2.5 py-1.5 text-white font-mono focus:outline-none focus:border-cyan-500"
            />
          </label>
          <p className="text-[10px] text-gray-500">
            The output directory is where "Save to disk" writes the generated files.
          </p>
        </div>

        <div className="flex items-center justify-end space-x-2 px-4 py-3 border-t border-[#2a2f42]">
          <button onClick={toggleProjectEdit} className="px-3 py-1.5 text-gray-300 hover:bg-[#2a2f42] rounded text-xs transition-colors">
            Cancel
          </button>
          <button
            onClick={save}
            className="flex items-center space-x-1 px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-500/40 rounded text-xs font-semibold transition-colors"
          >
            <Check size={13} />
            <span>Save</span>
          </button>
        </div>
      </div>
    </div>
  );
};
