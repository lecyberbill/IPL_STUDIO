import React from 'react';
import { useIdeStore } from '../store/useIdeStore';
import type { TargetLanguage } from '../engine/llmCompiler';
import { 
  Zap, 
  Code2, 
  Boxes, 
  Settings, 
  FolderOpen,
  Plus,
  Download,
  GitBranch
} from 'lucide-react';

export const Navbar: React.FC = () => {
  const { 
    targetLang, 
    setTargetLang, 
    runCompilation, 
    isCompiling, 
    editorViewMode, 
    setEditorViewMode,
    toggleSettings,
    toggleProjectModal,
    toggleGitModal,
    projects,
    activeProjectId,
    switchProject,
    exportProject,
    customTargets
  } = useIdeStore();

  return (
    <header className="h-14 bg-[#161922] border-b border-[#2a2f42] px-4 flex items-center justify-between text-sm select-none z-20">
      {/* Brand & Project Selector */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center font-bold text-white shadow-lg shadow-cyan-500/20">
            IPL
          </div>
          <div>
            <h1 className="font-bold text-white tracking-wide text-base leading-none">IPL Studio</h1>
            <span className="text-[10px] text-cyan-400 font-mono">v1.0 Atelier IDE</span>
          </div>
        </div>

        <div className="h-5 w-[1px] bg-[#2a2f42]" />

        {/* Active Project Dropdown & Manager trigger */}
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-2 bg-[#0f1117] border border-[#2a2f42] rounded-md px-2 py-1">
            <FolderOpen size={14} className="text-cyan-400" />
            <select 
              value={activeProjectId} 
              onChange={(e) => switchProject(e.target.value)}
              className="bg-transparent text-gray-200 text-xs focus:outline-none cursor-pointer font-medium max-w-[180px] truncate"
            >
              {projects.map((proj) => (
                <option key={proj.id} value={proj.id} className="bg-[#161922]">
                  {proj.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={toggleProjectModal}
            className="flex items-center space-x-1 px-2.5 py-1.5 bg-[#0f1117] hover:bg-[#2a2f42] text-gray-300 rounded-md border border-[#2a2f42] text-xs font-medium transition-colors"
            title="Gérer les projets (Créer, Supprimer, Importer)"
          >
            <Plus size={13} className="text-cyan-400" />
            <span>Gérer Projets</span>
          </button>

          <button
            onClick={() => exportProject()}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-[#2a2f42] rounded-md transition-colors"
            title="Télécharger le fichier .ipl"
          >
            <Download size={15} />
          </button>
        </div>
      </div>

      {/* Center Controls: View Mode & Target Lang */}
      <div className="flex items-center space-x-3">
        {/* Toggle Mode Texuel / Blocs */}
        <div className="flex bg-[#0f1117] p-1 rounded-lg border border-[#2a2f42]">
          <button
            onClick={() => setEditorViewMode('text')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
              editorViewMode === 'text' 
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shadow-sm' 
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Code2 size={14} />
            <span>Texte (Monaco)</span>
          </button>
          <button
            onClick={() => setEditorViewMode('blocks')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
              editorViewMode === 'blocks' 
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shadow-sm' 
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Boxes size={14} />
            <span>Blocs AST</span>
          </button>
        </div>

        <div className="h-5 w-[1px] bg-[#2a2f42]" />

        {/* Sélecteur de Cible */}
        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-400 font-medium">Cible:</span>
          <select
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value as TargetLanguage)}
            className="bg-[#0f1117] border border-[#2a2f42] rounded-md px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 cursor-pointer font-mono"
          >
            <option value="polyglot" className="bg-[#161922]">🌐 Polyglotte (Choix de l'Architecte)</option>
            <option value="rust" className="bg-[#161922]">🦀 Rust (.rs)</option>
            <option value="python" className="bg-[#161922]">🐍 Python 3 (.py)</option>
            <option value="javascript" className="bg-[#161922]">⚡ JavaScript / Node (.js)</option>
            <option value="go" className="bg-[#161922]">🐹 Go (.go)</option>
            <option value="cpp" className="bg-[#161922]">⚙️ C++ 20 (.cpp)</option>
            <option value="html" className="bg-[#161922]">🌐 HTML5 / CSS App (.html)</option>
            <option value="pll" className="bg-[#161922]">🧩 PLL v2 Core (.pll)</option>
            {customTargets.map((ct) => (
              <option key={ct.id} value={ct.id} className="bg-[#161922]">
                {ct.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Right Action: Git, Compile & Settings */}
      <div className="flex items-center space-x-3">
        <button
          onClick={toggleGitModal}
          className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#0f1117] hover:bg-[#2a2f42] text-gray-300 rounded-lg border border-[#2a2f42] text-xs font-medium transition-colors"
          title="Visualiseur Git Diff & Commits"
        >
          <GitBranch size={14} className="text-cyan-400" />
          <span>Git Diff</span>
        </button>

        <button
          onClick={runCompilation}
          disabled={isCompiling}
          className={`flex items-center space-x-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all shadow-md ${
            isCompiling
              ? 'bg-cyan-900/50 text-cyan-300 border border-cyan-500/30 cursor-wait'
              : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-cyan-500/20 active:scale-95'
          }`}
        >
          <Zap size={15} className={isCompiling ? 'animate-bounce text-yellow-300' : 'fill-current'} />
          <span>{isCompiling ? 'Compilation...' : '⚡ Compiler & Exécuter'}</span>
        </button>

        <button
          onClick={toggleSettings}
          className="p-2 text-gray-400 hover:text-white hover:bg-[#2a2f42] rounded-lg transition-colors"
          title="Paramètres LLM & API"
        >
          <Settings size={18} />
        </button>
      </div>
    </header>
  );
};
