import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { useIdeStore } from '../store/useIdeStore';
import { buildProjectArtifact, downloadProjectZip } from '../engine/artifactGenerator';
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
  ChevronLeft,
  ChevronRight,
  FileText,
  Settings,
  AlertCircle,
  X
} from 'lucide-react';

function getLanguageFromFilename(filename?: string): string {
  if (!filename) return 'plaintext';
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'js':
    case 'jsx':
    case 'mjs':
      return 'javascript';
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'py':
      return 'python';
    case 'rs':
      return 'rust';
    case 'go':
      return 'go';
    case 'cpp':
    case 'c':
    case 'h':
    case 'hpp':
      return 'cpp';
    case 'html':
    case 'htm':
      return 'html';
    case 'css':
      return 'css';
    case 'json':
      return 'json';
    case 'yaml':
    case 'yml':
      return 'yaml';
    case 'md':
      return 'markdown';
    case 'bat':
    case 'cmd':
      return 'bat';
    case 'sh':
    case 'bash':
      return 'shell';
    case 'ipl':
      return 'ipl';
    default:
      return 'plaintext';
  }
}

/**
 * The generated/imported artifact viewer: the files produced by generation (or
 * to be inspected) with Save-to-disk / Export-zip / Sync. Lives in the LEFT
 * sidebar so all file views share ONE place (Pure IDE: sources + artifact side
 * by side, chat stays on the right).
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
    setSelectedFilePath
  } = useIdeStore();

  const [copied, setCopied] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isWritingDisk, setIsWritingDisk] = useState(false);
  const [isReadingDisk, setIsReadingDisk] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);

  const scrollTabs = (direction: 'left' | 'right') => {
    if (tabsRef.current) {
      tabsRef.current.scrollBy({ left: direction === 'left' ? -180 : 180, behavior: 'smooth' });
    }
  };

  const activeProject = projects.find(p => p.id === activeProjectId);
  const outputDir = activeProject?.outputDir || defaultOutputDir(activeProject?.name || 'my_project');

  const artifact = buildProjectArtifact(activeProject?.name || 'ipl_project', targetLang, generatedCode, code);
  const files = artifact.files;
  const currentFile = files.find(f => f.relativePath === selectedFilePath) || files[0] || { relativePath: 'code.txt', content: generatedCode };

  useEffect(() => {
    if (files.length > 0 && (!selectedFilePath || !files.some(f => f.relativePath === selectedFilePath))) {
      setSelectedFilePath(files[0].relativePath);
    }
  }, [generatedCode, targetLang, files, selectedFilePath, setSelectedFilePath]);

  const handleCopy = () => {
    const textToCopy = currentFile ? currentFile.content : generatedCode;
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
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
    try {
      await downloadProjectZip(activeProject?.name || 'ipl_project', targetLang, generatedCode, code);
    } catch (e) {
      console.error(e);
    } finally {
      setIsExporting(false);
    }
  };

  const handleWriteDisk = async () => {
    if (!generatedCode) return;
    setIsWritingDisk(true);
    try {
      await writeArtifactToDisk();
    } catch (e) {
      console.error(e);
    } finally {
      setIsWritingDisk(false);
    }
  };

  const handleReadDisk = async () => {
    setIsReadingDisk(true);
    try {
      await readArtifactFromDisk();
    } catch (e) {
      console.error(e);
    } finally {
      setIsReadingDisk(false);
    }
  };

  const customTargetObj = customTargets.find(ct => ct.id === targetLang);
  const activeTargetDisplayName = customTargetObj ? customTargetObj.name : ({
    polyglot: '🌐 Polyglot (Architect\'s Choice)',
    'python-html': '🐍 Python Backend + 🌐 HTML5/JS Frontend',
    'node-html': '⚡ Node.js Backend + 🌐 HTML5/JS Frontend',
    'go-html': '🐹 Go Backend + 🌐 HTML5/JS Frontend',
    'rust-html': '🦀 Rust Backend + 🌐 HTML5/JS Frontend',
    rust: '🦀 Rust High-Performance (.rs)',
    python: '🐍 Python 3 Code (.py)',
    javascript: '⚡ JavaScript ES6 (.js)',
    go: '🐹 Go Language (.go)',
    cpp: '⚙️ C++ 20 Code (.cpp)',
    html: '🌐 HTML5 Web Page (.html)',
    pll: '🧩 PLL v2 Low Level (.pll)'
  }[targetLang] || targetLang.toUpperCase());

  return (
    <div className="w-full h-full flex flex-col bg-[#12141c] overflow-hidden select-none">
      {/* Save / Export actions */}
      <div className="h-8 bg-[#161922] px-2 border-b border-[#2a2f42] flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-1.5 text-[11px] font-mono text-cyan-400 truncate">
          <Code size={13} />
          <span className="truncate">{activeTargetDisplayName}</span>
          <span className="text-gray-500">· {isGenerating ? 'generating...' : files.length > 0 ? `${files.length} file(s)` : 'idle'}</span>
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={handleWriteDisk}
            disabled={isWritingDisk || !generatedCode}
            className="flex items-center space-x-1 px-2 py-0.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-black font-bold rounded text-[10px] transition-all"
            title="Write files to disk output folder"
          >
            <Save size={12} />
            <span>{isWritingDisk ? '...' : 'Save'}</span>
          </button>
          <button
            onClick={handleExportZip}
            disabled={isExporting}
            className="flex items-center space-x-1 px-2 py-0.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded text-[10px] font-semibold"
            title="Download zip archive"
          >
            <Package size={12} />
            <span>{isExporting ? '...' : 'Zip'}</span>
          </button>
          <button
            onClick={handleCopy}
            disabled={!generatedCode}
            className="p-1 text-gray-400 hover:text-white hover:bg-[#2a2f42] rounded transition-colors disabled:opacity-40"
            title="Copy active file content"
          >
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
        <button
          onClick={handleReadDisk}
          disabled={isReadingDisk}
          className="text-cyan-400 hover:text-cyan-300 flex items-center space-x-1 shrink-0 disabled:opacity-50 font-semibold"
          title="Resync the IDE from files on disk (Pull)"
        >
          <RefreshCw size={10} className={isReadingDisk ? 'animate-spin' : ''} />
          <span>Sync</span>
        </button>
      </div>

      {/* File tabs */}
      {files.length > 0 && (
        <div className="relative flex items-center bg-[#0b0d13] border-b border-[#2a2f42] shrink-0">
          <button type="button" onClick={() => scrollTabs('left')} className="px-1 py-1.5 text-gray-400 hover:text-white bg-[#0b0d13] border-r border-[#2a2f42] z-10 shrink-0" title="Scroll left">
            <ChevronLeft size={12} />
          </button>
          <div
            ref={tabsRef}
            onWheel={(e) => { if (tabsRef.current) tabsRef.current.scrollLeft += e.deltaY; }}
            className="flex items-center overflow-x-auto flex-1 px-0.5 select-none"
          >
            {files.map((file) => {
              const isSelected = file.relativePath === (currentFile?.relativePath || files[0].relativePath);
              return (
                <button
                  key={file.relativePath}
                  onClick={() => setSelectedFilePath(file.relativePath)}
                  className={`flex items-center space-x-1 px-2 py-1.5 text-[10px] font-mono border-r border-[#2a2f42] whitespace-nowrap transition-colors shrink-0 ${
                    isSelected ? 'bg-[#161922] text-cyan-300 font-bold border-b-2 border-b-cyan-500' : 'text-gray-400 hover:text-gray-200 hover:bg-[#12141c]'
                  }`}
                  title={file.relativePath}
                >
                  <FolderSearch size={11} className={isSelected ? 'text-cyan-400' : 'text-gray-500'} />
                  <span>{file.relativePath}</span>
                </button>
              );
            })}
          </div>
          <button type="button" onClick={() => scrollTabs('right')} className="px-1 py-1.5 text-gray-400 hover:text-white bg-[#0b0d13] border-l border-[#2a2f42] z-10 shrink-0" title="Scroll right">
            <ChevronRight size={12} />
          </button>
        </div>
      )}

      {/* Code viewer */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {generationError && !isGenerating && (
          <div className="absolute inset-x-0 top-0 z-20 m-2 bg-rose-950/80 border border-rose-500/50 rounded-lg shadow-xl backdrop-blur-sm">
            <div className="px-3 py-2 flex items-start space-x-2">
              <AlertCircle size={15} className="text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold text-rose-300 uppercase">Generation failed</div>
                <div className="text-[10px] text-rose-200/90 mt-0.5 break-words select-text">{generationError}</div>
              </div>
              <button onClick={clearGenerationError} className="p-1 text-rose-300/70 hover:text-white rounded shrink-0" title="Dismiss error">
                <X size={13} />
              </button>
            </div>
            <div className="px-3 pb-2">
              <button onClick={toggleSettings} className="flex items-center space-x-1 px-2 py-1 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/50 text-purple-300 text-[10px] rounded font-semibold">
                <Settings size={11} />
                <span>Open Settings ⚙️</span>
              </button>
            </div>
          </div>
        )}

        {isGenerating ? (
          <div className="h-full flex flex-col items-center justify-center p-4 text-center space-y-2">
            <div className="w-8 h-8 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
            <div className="font-semibold text-cyan-300 text-[11px] tracking-wider">2-PASS GENERATOR IN PROGRESS...</div>
          </div>
        ) : (files.length > 0 || generatedCode) ? (
          <div className="w-full h-full flex flex-col overflow-hidden">
            <div className="px-2 py-1 bg-[#0f1117]/90 text-[10px] font-mono text-cyan-300 border-b border-[#2a2f42] flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-1.5 min-w-0 flex-1 pr-2">
                <FileText size={12} className="text-cyan-400 shrink-0" />
                <select
                  value={currentFile?.relativePath || ''}
                  onChange={(e) => setSelectedFilePath(e.target.value)}
                  className="bg-[#161922] text-cyan-300 font-mono text-[10px] border border-[#2a2f42] rounded px-1.5 py-0.5 focus:outline-none focus:border-cyan-500 cursor-pointer truncate max-w-[200px]"
                  title="Select any file"
                >
                  {files.map((f, idx) => (
                    <option key={f.relativePath} value={f.relativePath} className="bg-[#161922] text-white font-mono">
                      {idx + 1}/{files.length}: {f.relativePath}
                    </option>
                  ))}
                </select>
              </div>
              <span className="shrink-0 text-gray-400">{currentFile?.content ? currentFile.content.length : 0} chars</span>
            </div>
            <div className="flex-1 min-h-0 bg-[#0b0d13]">
              <Editor
                height="100%"
                language={getLanguageFromFilename(currentFile?.relativePath || '')}
                value={currentFile?.content || generatedCode || ''}
                theme="vs-dark"
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  fontSize: 12,
                  lineNumbers: 'on',
                  automaticLayout: true,
                  folding: true,
                  fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace"
                }}
              />
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center p-4 text-center text-gray-500">
            <Code size={28} className="text-gray-600 mb-2" />
            <p className="font-semibold text-[11px] text-gray-400">No artifact yet.</p>
            <p className="text-[10px] max-w-[220px] mt-1 text-gray-500">
              Generate a project (Ctrl+Enter) or verify/paste an artifact in the Verify tab.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
