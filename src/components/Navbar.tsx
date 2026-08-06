import React from 'react';
import { useIdeStore } from '../store/useIdeStore';
import type { TargetLanguage } from '../engine/llmCompiler';
import { 
  Play, 
  Settings, 
  FolderPlus, 
  Sparkles, 
  LayoutTemplate, 
  Code2, 
  GitCompare,
  Download,
  Trash2,
  Layers
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
    deleteProject,
    addLog,
    exportProject,
    customTargets,
    polyglotConfig,
    togglePolyglotModal
  } = useIdeStore();

  return (
    <header className="h-14 bg-[#161922] border-b border-[#2a2f42] px-4 flex items-center justify-between select-none shadow-md z-10">
      {/* Brand & Project Selector */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Sparkles size={18} className="text-black fill-black" />
          </div>
          <div>
            <h1 className="font-bold text-white text-sm tracking-wider flex items-center space-x-1.5">
              <span>IPL STUDIO</span>
              <span className="text-[10px] bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-500/30 font-mono">v1.0</span>
            </h1>
            <p className="text-[10px] text-gray-400 font-mono">Intent Programming Language IDE</p>
          </div>
        </div>

        <div className="h-5 w-[1px] bg-[#2a2f42]" />

        {/* Project Selector */}
        <div className="flex items-center space-x-1.5">
          <select
            value={activeProjectId}
            onChange={(e) => switchProject(e.target.value)}
            className="bg-[#0f1117] border border-[#2a2f42] rounded-md px-3 py-1.5 text-xs text-cyan-300 focus:outline-none focus:border-cyan-500 cursor-pointer font-semibold"
          >
            {projects.map((proj) => (
              <option key={proj.id} value={proj.id} className="bg-[#161922] text-white">
                📂 {proj.name}
              </option>
            ))}
          </select>

          <button
            onClick={toggleProjectModal}
            className="p-1.5 bg-[#0f1117] hover:bg-[#2a2f42] text-gray-300 rounded-md border border-[#2a2f42] transition-colors"
            title="Project Manager & Create New Project"
          >
            <FolderPlus size={15} />
          </button>

          <button
            onClick={() => {
              const activeProj = projects.find(p => p.id === activeProjectId);
              if (projects.length <= 1) {
                addLog('Cannot delete the last remaining project.', 'warn');
                return;
              }
              if (window.confirm(`Are you sure you want to delete project "${activeProj?.name}"?`)) {
                deleteProject(activeProjectId);
                addLog(`Project "${activeProj?.name}" deleted successfully.`, 'info');
              }
            }}
            disabled={projects.length <= 1}
            className="p-1.5 bg-[#0f1117] hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded-md border border-[#2a2f42] hover:border-red-500/40 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Delete Current Project"
          >
            <Trash2 size={15} />
          </button>
        </div>

        <div className="h-5 w-[1px] bg-[#2a2f42]" />

        {/* Editor View Toggle (Monaco Code vs AST Blocks) */}
        <div className="flex bg-[#0f1117] p-0.5 rounded-lg border border-[#2a2f42]">
          <button
            onClick={() => setEditorViewMode('text')}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              editorViewMode === 'text'
                ? 'bg-cyan-500/20 text-cyan-300 font-semibold shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Code2 size={13} />
            <span>IPL Code</span>
          </button>

          <button
            onClick={() => setEditorViewMode('blocks')}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              editorViewMode === 'blocks'
                ? 'bg-cyan-500/20 text-cyan-300 font-semibold shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <LayoutTemplate size={13} />
            <span>AST Blocks</span>
          </button>
        </div>

        <div className="h-5 w-[1px] bg-[#2a2f42]" />

        {/* Target Language Selector */}
        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-400 font-medium">Target:</span>
          <select
            value={targetLang}
            onChange={(e) => {
              const selected = e.target.value as TargetLanguage;
              setTargetLang(selected);
              if (selected === 'polyglot') {
                togglePolyglotModal();
              }
            }}
            className="bg-[#0f1117] border border-[#2a2f42] rounded-md px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 cursor-pointer font-mono"
          >
            <option value="polyglot" className="bg-[#161922]">🌐 Polyglot (Architect's Choice)</option>
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

          {targetLang === 'polyglot' && (
            <button
              onClick={togglePolyglotModal}
              className="flex items-center space-x-1 px-2.5 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 rounded-md text-xs font-semibold transition-all"
              title="Configurer les composants et technologies Polyglottes"
            >
              <Layers size={14} />
              <span>{polyglotConfig.autoDecide ? 'Auto Polyglotte' : `${polyglotConfig.layers.length} Composant(s)`}</span>
            </button>
          )}
        </div>
      </div>

      {/* Right Actions: Git, Export, Compile & Settings */}
      <div className="flex items-center space-x-3">
        <button
          onClick={toggleGitModal}
          className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#0f1117] hover:bg-[#2a2f42] text-gray-300 rounded-lg border border-[#2a2f42] text-xs font-medium transition-colors"
          title="Git Diff & Version Control Modal"
        >
          <GitCompare size={14} className="text-cyan-400" />
          <span>Git Diff</span>
        </button>

        <button
          onClick={() => exportProject()}
          className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#0f1117] hover:bg-[#2a2f42] text-gray-300 rounded-lg border border-[#2a2f42] text-xs font-medium transition-colors"
          title="Export Project Backup JSON"
        >
          <Download size={14} className="text-emerald-400" />
          <span>Export</span>
        </button>

        <button
          onClick={toggleSettings}
          className="p-2 bg-[#0f1117] hover:bg-[#2a2f42] text-gray-300 rounded-lg border border-[#2a2f42] transition-colors"
          title="LLM Engine Settings"
        >
          <Settings size={16} />
        </button>

        {/* Compile Button */}
        <button
          onClick={runCompilation}
          disabled={isCompiling}
          className="flex items-center space-x-2 px-4 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 text-black font-bold rounded-lg text-xs transition-all shadow-lg shadow-cyan-500/20 active:scale-95"
        >
          <Play size={14} className="fill-black" />
          <span>{isCompiling ? 'Compiling...' : 'Compile (Ctrl+Enter)'}</span>
        </button>
      </div>
    </header>
  );
};
