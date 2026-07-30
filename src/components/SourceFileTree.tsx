import React, { useState } from 'react';
import { useIdeStore } from '../store/useIdeStore';
import { FileCode, FilePlus, Trash2, FolderGit2, Check, X } from 'lucide-react';

export const SourceFileTree: React.FC = () => {
  const { projects, activeProjectId, createSourceFile, switchSourceFile, deleteSourceFile } = useIdeStore();
  const [newFileName, setNewFileName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const activeProj = projects.find(p => p.id === activeProjectId);
  const sourceFiles = activeProj?.sourceFiles || { 'main.ipl': activeProj?.code || '' };
  const activeSourceFile = activeProj?.activeSourceFile || 'main.ipl';
  const fileKeys = Object.keys(sourceFiles);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim()) return;
    let cleanName = newFileName.trim();
    if (!cleanName.endsWith('.ipl')) cleanName += '.ipl';

    createSourceFile(cleanName);
    setNewFileName('');
    setIsAdding(false);
  };

  return (
    <div className="w-full bg-[#12141c] flex flex-col h-full select-none">
      {/* Header Bar */}
      <div className="h-8 bg-[#161922] px-3 border-b border-[#2a2f42] flex items-center justify-between text-xs text-gray-300">
        <div className="flex items-center space-x-1.5 font-semibold text-[11px]">
          <FolderGit2 size={14} className="text-cyan-400" />
          <span>IPL Source Tree</span>
        </div>

        <button
          onClick={() => setIsAdding(!isAdding)}
          className="p-1 text-gray-400 hover:text-cyan-300 hover:bg-[#2a2f42] rounded transition-colors"
          title="New .ipl source file"
        >
          <FilePlus size={14} />
        </button>
      </div>

      {/* Add New File Bar */}
      {isAdding && (
        <form onSubmit={handleCreate} className="p-2 border-b border-[#2a2f42] bg-[#0f1117] flex items-center space-x-1">
          <input
            type="text"
            placeholder="models.ipl..."
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            className="flex-1 bg-[#161922] border border-[#2a2f42] rounded px-2 py-0.5 font-mono text-[11px] text-white focus:outline-none focus:border-cyan-500"
            autoFocus
          />
          <button type="submit" className="p-1 text-emerald-400 hover:text-emerald-300">
            <Check size={14} />
          </button>
          <button type="button" onClick={() => setIsAdding(false)} className="p-1 text-gray-400 hover:text-white">
            <X size={14} />
          </button>
        </form>
      )}

      {/* Files List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {fileKeys.map((fileName) => {
          const isActive = fileName === activeSourceFile;
          return (
            <div
              key={fileName}
              onClick={() => switchSourceFile(fileName)}
              className={`group px-2.5 py-1.5 rounded-lg border text-xs font-mono flex items-center justify-between cursor-pointer transition-all ${
                isActive
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 font-semibold shadow-sm'
                  : 'bg-[#161922]/60 text-gray-400 border-transparent hover:border-[#2a2f42] hover:text-white'
              }`}
            >
              <div className="flex items-center space-x-2 truncate">
                <FileCode size={14} className={isActive ? 'text-cyan-400' : 'text-gray-500'} />
                <span className="truncate">{fileName}</span>
              </div>

              {fileKeys.length > 1 && fileName !== 'main.ipl' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSourceFile(fileName);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-rose-400 transition-opacity"
                  title="Delete .ipl source file"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer Info */}
      <div className="p-2 border-t border-[#2a2f42] text-[10px] text-gray-500 bg-[#0f1117] font-mono">
        <div>Usage in IPL:</div>
        <div className="text-cyan-400 font-semibold mt-0.5">import "file.ipl";</div>
      </div>
    </div>
  );
};
