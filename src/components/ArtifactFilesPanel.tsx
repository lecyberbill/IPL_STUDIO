import React, { useState, useEffect } from 'react';
import { useIdeStore } from '../store/useIdeStore';
import { downloadProjectZip, parseMultiFileXml } from '../engine/artifactGenerator';
import { defaultOutputDir } from '../engine/paths';
import {
  Code,
  Copy,
  Check,
  Package,
  Save,
  FolderSearch,
  HardDrive,
  RefreshCw,
  FilePlus,
  Pencil,
  Trash2,
  Settings,
  AlertCircle,
  X
} from 'lucide-react';

/**
 * Artifact MANAGER: list the generated artifact files and act on them
 * (create / rename / delete, Save to disk, Export zip, Sync). Selecting a file
 * opens it in the CENTRAL editor (which is the single editing surface) — this
 * panel is no longer a viewer.
 */
export const ArtifactFilesPanel: React.FC = () => {
  const {
    generatedCode,
    targetLang,
    isGenerating,
    toggleSettings,
    code,
    projects,
    activeProjectId,
    writeArtifactToDisk,
    readArtifactFromDisk,
    customTargets,
    generationError,
    clearGenerationError,
    selectedFilePath,
    setSelectedFilePath,
    renameArtifactFile,
    deleteArtifactFile,
    addArtifactFile,
    setEditingTarget
  } = useIdeStore();

  const [copied, setCopied] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isWritingDisk, setIsWritingDisk] = useState(false);
  const [isReadingDisk, setIsReadingDisk] = useState(false);

  const activeProject = projects.find(p => p.id === activeProjectId);
  const outputDir = activeProject?.outputDir || defaultOutputDir(activeProject?.name || 'my_project');

  const files = parseMultiFileXml(generatedCode || '');
  const selected = files.find(f => f.relativePath === selectedFilePath) || files[0];

  useEffect(() => {
    if (files.length > 0 && (!selectedFilePath || !files.some(f => f.relativePath === selectedFilePath))) {
      setSelectedFilePath(files[0].relativePath);
    }
  }, [generatedCode, targetLang, files, selectedFilePath, setSelectedFilePath]);

  const openFile = (path: string) => {
    setSelectedFilePath(path);
    setEditingTarget('artifact');
  };

  const handleCopy = () => {
    const textToCopy = selected ? selected.content : generatedCode;
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  const handleNewFile = () => {
    const p = window.prompt('New file path (e.g. src/utils.js):', 'newfile.js');
    if (p && p.trim()) addArtifactFile(p.trim());
  };
  const handleRename = () => {
    if (!selected) return;
    const next = window.prompt('Rename file:', selected.relativePath);
    if (next && next.trim() && next.trim() !== selected.relativePath) renameArtifactFile(selected.relativePath, next.trim());
  };
  const handleDelete = () => {
    if (!selected) return;
    if (!window.confirm(`Delete "${selected.relativePath}" from the artifact?`)) return;
    deleteArtifactFile(selected.relativePath);
  };
  const handleCopyPath = () => {
    if (outputDir) {
      navigator.clipboard.writeText(outputDir);
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    }
  };
  const handleExportZip = async () => {
    if (!generatedCode) return;
    setIsExporting(true);
    try { await downloadProjectZip(activeProject?.name || 'ipl_project', targetLang, generatedCode, code); }
    catch (e) { console.error(e); }
    finally { setIsExporting(false); }
  };
  const handleWriteDisk = async () => {
    if (!generatedCode) return;
    setIsWritingDisk(true);
    try { await writeArtifactToDisk(); }
    catch (e) { console.error(e); }
    finally { setIsWritingDisk(false); }
  };
  const handleReadDisk = async () => {
    setIsReadingDisk(true);
    try { await readArtifactFromDisk(); }
    catch (e) { console.error(e); }
    finally { setIsReadingDisk(false); }
  };

  const customTargetObj = customTargets.find(ct => ct.id === targetLang);
  const activeTargetDisplayName = customTargetObj ? customTargetObj.name : ({
    polyglot: '🌐 Polyglot', rust: '🦀 Rust', python: '🐍 Python', javascript: '⚡ JavaScript',
    go: '🐹 Go', cpp: '⚙️ C++', html: '🌐 HTML5', pll: '🧩 PLL'
  }[targetLang] || targetLang.toUpperCase());

  return (
    <div className="w-full h-full flex flex-col bg-[#12141c] overflow-hidden select-none">
      {/* Actions */}
      <div className="h-8 bg-[#161922] px-2 border-b border-[#2a2f42] flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-1.5 text-[11px] font-mono text-cyan-400 truncate">
          <Code size={13} />
          <span className="truncate">{activeTargetDisplayName}</span>
          <span className="text-gray-500">· {isGenerating ? 'generating...' : files.length > 0 ? `${files.length} file(s)` : 'idle'}</span>
        </div>
        <div className="flex items-center space-x-1">
          <button onClick={handleNewFile} className="p-1 text-gray-400 hover:text-cyan-300 hover:bg-[#2a2f42] rounded transition-colors" title="New file in the artifact">
            <FilePlus size={13} />
          </button>
          <button onClick={handleWriteDisk} disabled={isWritingDisk || !generatedCode} className="flex items-center space-x-1 px-2 py-0.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-black font-bold rounded text-[10px]" title="Write files to disk output folder">
            <Save size={12} /><span>{isWritingDisk ? '...' : 'Save'}</span>
          </button>
          <button onClick={handleExportZip} disabled={isExporting} className="flex items-center space-x-1 px-2 py-0.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded text-[10px] font-semibold" title="Download zip archive">
            <Package size={12} /><span>{isExporting ? '...' : 'Zip'}</span>
          </button>
          <button onClick={handleCopy} disabled={!generatedCode} className="p-1 text-gray-400 hover:text-white hover:bg-[#2a2f42] rounded transition-colors disabled:opacity-40" title="Copy selected file content">
            {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
          </button>
        </div>
      </div>

      {/* Disk path */}
      <div className="px-2 py-1 bg-[#0f1117] border-b border-[#2a2f42] flex items-center justify-between text-[10px] text-gray-400 font-mono shrink-0">
        <div className="flex items-center space-x-1 truncate" title={outputDir}>
          <HardDrive size={11} className="text-emerald-400 shrink-0" />
          <span className="truncate">{outputDir}</span>
          <button onClick={handleCopyPath} className="p-0.5 text-gray-400 hover:text-white rounded shrink-0" title="Copy disk path">
            {copiedPath ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
          </button>
        </div>
        <button onClick={handleReadDisk} disabled={isReadingDisk} className="text-cyan-400 hover:text-cyan-300 flex items-center space-x-1 shrink-0 disabled:opacity-50 font-semibold" title="Resync the IDE from files on disk (Pull)">
          <RefreshCw size={10} className={isReadingDisk ? 'animate-spin' : ''} /><span>Sync</span>
        </button>
      </div>

      {generationError && !isGenerating && (
        <div className="px-2 py-1.5 bg-rose-950/80 border-b border-rose-500/50 flex items-start space-x-2 shrink-0">
          <AlertCircle size={14} className="text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold text-rose-300 uppercase">Generation failed</div>
            <div className="text-[10px] text-rose-200/90 break-words select-text">{generationError}</div>
          </div>
          <button onClick={toggleSettings} className="p-1 text-purple-300 hover:text-white rounded shrink-0" title="Open Settings ⚙️"><Settings size={12} /></button>
          <button onClick={clearGenerationError} className="p-1 text-rose-300/70 hover:text-white rounded shrink-0" title="Dismiss"><X size={12} /></button>
        </div>
      )}

      {/* File list (manager) */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {files.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-4 text-center text-gray-500">
            <Code size={28} className="text-gray-600 mb-2" />
            <p className="font-semibold text-[11px] text-gray-400">No artifact yet.</p>
            <p className="text-[10px] max-w-[220px] mt-1 text-gray-500">
              Generate a project (Ctrl+Enter), or paste one in the Verify tab.
            </p>
          </div>
        ) : (
          <ul className="p-1.5 space-y-1">
            {files.map((f) => {
              const isSel = selected?.relativePath === f.relativePath;
              return (
                <li key={f.relativePath}>
                  <div
                    onClick={() => openFile(f.relativePath)}
                    className={`group px-2 py-1.5 rounded-lg border text-[11px] font-mono flex items-center justify-between cursor-pointer transition-all ${
                      isSel ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 font-semibold shadow-sm' : 'bg-[#161922]/60 text-gray-400 border-transparent hover:border-[#2a2f42] hover:text-white'
                    }`}
                    title="Open in the central editor"
                  >
                    <div className="flex items-center space-x-2 truncate min-w-0">
                      <FolderSearch size={13} className={isSel ? 'text-cyan-400 shrink-0' : 'text-gray-500 shrink-0'} />
                      <span className="truncate">{f.relativePath}</span>
                    </div>
                    <div className="flex items-center space-x-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); const next = window.prompt('Rename file:', f.relativePath); if (next && next.trim() && next.trim() !== f.relativePath) renameArtifactFile(f.relativePath, next.trim()); }}
                        className="p-1 text-gray-500 hover:text-cyan-300" title="Rename"
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); if (window.confirm(`Delete "${f.relativePath}"?`)) deleteArtifactFile(f.relativePath); }}
                        className="p-1 text-gray-500 hover:text-rose-400" title="Delete"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-[#2a2f42] text-[10px] text-gray-500 bg-[#0f1117] font-mono shrink-0 flex items-center justify-between">
        <span>Selected file opens in the central editor.</span>
        {selected && (
          <span className="flex items-center space-x-1 shrink-0">
            <button onClick={handleRename} className="p-0.5 text-gray-400 hover:text-cyan-300" title="Rename selected"><Pencil size={11} /></button>
            <button onClick={handleDelete} className="p-0.5 text-gray-400 hover:text-rose-400" title="Delete selected"><Trash2 size={11} /></button>
          </span>
        )}
      </div>
    </div>
  );
};
