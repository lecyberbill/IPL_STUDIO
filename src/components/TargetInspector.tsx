import React, { useState, useEffect } from 'react';
import { useIdeStore } from '../store/useIdeStore';
import { downloadProjectZip, buildProjectArtifact } from '../engine/artifactGenerator';
import { ChatPanel } from './ChatPanel';
import { 
  Copy, 
  Check, 
  Code, 
  Sparkles,
  FileCode2,
  Package,
  FolderTree,
  FileText,
  HardDrive,
  Save,
  MessageSquare,
  Folder
} from 'lucide-react';

export const TargetInspector: React.FC = () => {
  const { 
    compiledCode, 
    targetLang, 
    isCompiling, 
    code, 
    projects, 
    activeProjectId, 
    writeArtifactToDisk,
    customTargets
  } = useIdeStore();

  const [activePanelTab, setActivePanelTab] = useState<'files' | 'chat'>('files');
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isWritingDisk, setIsWritingDisk] = useState(false);
  const [selectedFilePath, setSelectedFilePath] = useState<string>('');

  const activeProject = projects.find(p => p.id === activeProjectId);
  const outputDir = activeProject?.outputDir || `d:/image_to_text/IPL/output/${activeProject?.name.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'mon_projet'}`;

  // Extraire les fichiers de l'artefact multi-fichiers
  const artifact = buildProjectArtifact(
    activeProject?.name || 'projet_ipl',
    targetLang,
    compiledCode,
    code
  );

  const files = artifact.files;
  const currentFile = files.find(f => f.relativePath === selectedFilePath) || files[0] || { relativePath: 'code.txt', content: compiledCode };

  useEffect(() => {
    if (files.length > 0 && (!selectedFilePath || !files.some(f => f.relativePath === selectedFilePath))) {
      setSelectedFilePath(files[0].relativePath);
    }
  }, [compiledCode, targetLang, files]);

  const handleCopy = () => {
    const textToCopy = currentFile ? currentFile.content : compiledCode;
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleExportZip = async () => {
    if (!compiledCode) return;
    setIsExporting(true);
    try {
      await downloadProjectZip(
        activeProject?.name || 'projet_ipl',
        targetLang,
        compiledCode,
        code
      );
    } catch (e) {
      console.error(e);
    } finally {
      setIsExporting(false);
    }
  };

  const handleWriteDisk = async () => {
    if (!compiledCode) return;
    setIsWritingDisk(true);
    try {
      await writeArtifactToDisk();
    } catch (e) {
      console.error(e);
    } finally {
      setIsWritingDisk(false);
    }
  };

  const customTargetObj = customTargets.find(ct => ct.id === targetLang);
  const activeTargetDisplayName = customTargetObj ? customTargetObj.name : ({
    polyglot: '🌐 Polyglotte (Choix de l\'Architecte LLM)',
    rust: '🦀 Rust High-Performance (.rs)',
    python: '🐍 Python 3 Code (.py)',
    javascript: '⚡ JavaScript ES6 (.js)',
    go: '🐹 Go Language (.go)',
    cpp: '⚙️ C++ 20 Code (.cpp)',
    html: '🌐 HTML5 Web Page (.html)',
    pll: '🧩 PLL v2 Low Level (.pll)'
  }[targetLang] || targetLang.toUpperCase());

  return (
    <aside className="w-[480px] bg-[#161922] border-l border-[#2a2f42] flex flex-col h-full select-none">
      {/* Panel Header Tabs */}
      <div className="h-10 border-b border-[#2a2f42] px-3 flex items-center justify-between shrink-0 bg-[#0f1117]">
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setActivePanelTab('files')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
              activePanelTab === 'files'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Folder size={14} />
            <span>📂 Fichiers Projet ({files.length})</span>
          </button>

          <button
            onClick={() => setActivePanelTab('chat')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
              activePanelTab === 'chat'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <MessageSquare size={14} />
            <span>💬 Chat LLM</span>
          </button>
        </div>

        <div className="flex items-center space-x-1.5">
          {activePanelTab === 'files' && compiledCode && (
            <>
              <button
                onClick={handleWriteDisk}
                disabled={isWritingDisk}
                className="flex items-center space-x-1 px-2.5 py-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded text-[11px] font-semibold shadow transition-all"
                title={`Matérialiser physiquement les fichiers dans ${outputDir}`}
              >
                <Save size={13} />
                <span>{isWritingDisk ? 'Écriture...' : 'Écrire sur Disque'}</span>
              </button>

              <button
                onClick={handleExportZip}
                disabled={isExporting}
                className="flex items-center space-x-1 px-2.5 py-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded text-[11px] font-semibold shadow transition-all"
                title="Télécharger l'artefact projet (.zip)"
              >
                <Package size={13} />
                <span>{isExporting ? 'Zip...' : 'Export .zip'}</span>
              </button>
            </>
          )}

          {activePanelTab === 'files' && (
            <button
              onClick={handleCopy}
              disabled={!compiledCode}
              className="p-1 text-gray-400 hover:text-white hover:bg-[#2a2f42] rounded transition-colors disabled:opacity-40"
              title="Copier le contenu du fichier sélectionné"
            >
              {copied ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
            </button>
          )}
        </div>
      </div>

      {/* Main Tab Body */}
      {activePanelTab === 'chat' ? (
        <ChatPanel />
      ) : (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Target Info Sub-header */}
          <div className="bg-[#0f1117] px-3 py-1.5 border-b border-[#2a2f42] flex items-center justify-between text-[11px] font-mono shrink-0">
            <div className="flex items-center space-x-1.5 text-cyan-400">
              <FileCode2 size={13} />
              <span>{activeTargetDisplayName}</span>
            </div>
            <span className="text-gray-500">
              {isCompiling ? 'Génération en cours...' : files.length > 0 ? `${files.length} fichier(s)` : 'En attente'}
            </span>
          </div>

          {/* Physical Folder Location Sub-header */}
          <div className="bg-[#12141c] px-3 py-1 border-b border-[#2a2f42]/60 flex items-center justify-between text-[10px] font-mono text-gray-400 shrink-0">
            <div className="flex items-center space-x-1.5 truncate">
              <HardDrive size={12} className="text-amber-400 shrink-0" />
              <span className="text-gray-500">Disque Local :</span>
              <span className="text-amber-300/90 truncate font-semibold">{outputDir}</span>
            </div>
          </div>

          {/* File Selector Bar (Multi-File Tabs/Selector) */}
          {files.length > 0 && !isCompiling && (
            <div className="bg-[#0f1117] border-b border-[#2a2f42] p-1.5 flex items-center space-x-1 overflow-x-auto scrollbar-thin shrink-0">
              <div className="flex items-center space-x-1 text-gray-400 px-2 text-[10px]">
                <FolderTree size={12} className="text-cyan-400 shrink-0" />
                <span>Fichiers :</span>
              </div>
              {files.map((file) => {
                const isSelected = file.relativePath === currentFile?.relativePath;
                return (
                  <button
                    key={file.relativePath}
                    onClick={() => setSelectedFilePath(file.relativePath)}
                    className={`px-2.5 py-1 rounded text-[11px] font-mono shrink-0 flex items-center space-x-1 transition-all ${
                      isSelected
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm font-semibold'
                        : 'bg-[#161922] text-gray-400 border border-[#2a2f42] hover:text-white'
                    }`}
                  >
                    <FileText size={11} className={isSelected ? 'text-cyan-400' : 'text-gray-500'} />
                    <span>{file.relativePath}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Files Content Area */}
          <div className="flex-1 min-h-0 bg-[#12141c] overflow-hidden relative flex flex-col">
            {isCompiling ? (
              compiledCode ? (
                <div className="w-full h-full flex flex-col overflow-hidden">
                  <div className="px-3 py-1 bg-purple-500/20 text-[10px] font-mono text-purple-300 border-b border-purple-500/40 flex items-center justify-between shrink-0 animate-pulse">
                    <span className="flex items-center space-x-1.5 font-bold">
                      <Sparkles size={12} className="animate-spin text-purple-400" />
                      <span>🧠 Réflexion & Génération LLM en direct (Streaming)...</span>
                    </span>
                    <span>{compiledCode.length} caractères générés</span>
                  </div>
                  <pre className="flex-1 min-h-0 p-4 overflow-auto font-mono text-xs text-purple-200 leading-relaxed select-text whitespace-pre-wrap bg-[#0b0d13]">
                    <code>{compiledCode}</code>
                  </pre>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-400">
                  <Sparkles size={32} className="text-purple-400 animate-spin mb-3" />
                  <p className="text-xs font-semibold text-white">🧠 Le LLM génère et matérialise le projet...</p>
                  <p className="text-[11px] text-purple-400 mt-1">Réécriture et matérialisation sur disque ({targetLang.toUpperCase()})</p>
                </div>
              )
            ) : (files.length > 0 || compiledCode) ? (
              <div className="w-full h-full flex flex-col overflow-hidden">
                <div className="px-3 py-1 bg-[#0f1117]/90 text-[10px] font-mono text-cyan-300 border-b border-[#2a2f42] flex justify-between shrink-0">
                  <span>📄 Fichier actif : <strong className="text-white">{currentFile?.relativePath}</strong></span>
                  <span>{currentFile?.content ? currentFile.content.length : 0} caractères</span>
                </div>
                <pre className="flex-1 min-h-0 p-4 overflow-auto font-mono text-xs text-gray-200 leading-relaxed select-text whitespace-pre-wrap bg-[#0b0d13]">
                  <code>{currentFile?.content || compiledCode}</code>
                </pre>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-500">
                <Code size={36} className="text-gray-600 mb-2" />
                <p className="text-xs font-medium text-gray-400">Aucun projet généré</p>
                <p className="text-[11px] text-gray-600 mt-1 max-w-[280px]">
                  Cliquez sur <strong className="text-cyan-400">⚡ Compiler & Exécuter</strong> pour générer l'arborescence et afficher le contenu de chaque fichier.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer Info */}
      <div className="p-2 border-t border-[#2a2f42] text-[10px] text-gray-400 bg-[#0f1117] flex items-center justify-between shrink-0">
        <span>Matérialisation Automatique sur Disque</span>
        <span className="text-cyan-400 font-mono">IPL v1.0 -&gt; {targetLang}</span>
      </div>
    </aside>
  );
};
