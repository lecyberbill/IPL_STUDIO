import React, { useState } from 'react';
import { useIdeStore } from '../store/useIdeStore';
import type { TargetLanguage, FormFactor } from '../engine/llmGenerator';
import { defaultOutputDir } from '../engine/paths';
import { apiFetch } from '../services/api';
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
  Layers,
  GraduationCap,
  Globe,
  Square
} from 'lucide-react';

export const Navbar: React.FC = () => {
  const { 
    targetLang, 
    setTargetLang, 
    runGeneration, 
    isGenerating, 
    editorViewMode, 
    setEditorViewMode,
    toggleSettings,
    toggleProjectModal,
    toggleGitModal,
    toggleTutorial,
    projects,
    activeProjectId,
    switchProject,
    deleteProject,
    addLog,
    exportProject,
    customTargets,
    polyglotConfig,
    togglePolyglotModal,
    formFactor,
    setFormFactor
  } = useIdeStore();

  const [isServing, setIsServing] = useState(false);
  const [serveUrl, setServeUrl] = useState('');

  const toggleServe = async () => {
    const proj = projects.find(p => p.id === activeProjectId);
    const outputDir = proj?.outputDir || defaultOutputDir(proj?.name || 'my_project');

    if (isServing) {
      try {
        await apiFetch('/api/serve-stop', { method: 'POST', body: JSON.stringify({ outputDir }) });
        addLog(`[Serve] Static server stopped.`, 'info');
      } catch (e: any) {
        addLog(`[Serve] Stop failed: ${e.message}`, 'error');
      }
      setIsServing(false);
      setServeUrl('');
      return;
    }

    try {
      const res = await apiFetch('/api/serve', { method: 'POST', body: JSON.stringify({ outputDir }) });
      const data = await res.json();
      if (data.url) {
        setServeUrl(data.url);
        setIsServing(true);
        addLog(`[Serve] Serving "${outputDir}" at ${data.url}`, 'success');
        window.open(data.url, '_blank');
      } else {
        addLog(`[Serve] Failed: ${data.error || 'unknown error'}`, 'error');
      }
    } catch (e: any) {
      addLog(`[Serve] Failed: ${e.message}`, 'error');
    }
  };

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
              <span className="text-[10px] bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-500/30 font-mono">v1.4.0</span>
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
              title="Configure Polyglot components and technologies"
            >
              <Layers size={14} />
              <span>{polyglotConfig.autoDecide ? 'Auto Polyglot' : `${polyglotConfig.layers.length} Component(s)`}</span>
            </button>
          )}

          <div className="h-5 w-[1px] bg-[#2a2f42]" />

          {/* Execution Form Factor Selector (P4): pins the generated app to CLI / web / library */}
          <div className="flex items-center space-x-2">
            <span className="text-xs text-gray-400 font-medium">Forme:</span>
            <select
              value={formFactor}
              onChange={(e) => setFormFactor(e.target.value as FormFactor)}
              className="bg-[#0f1117] border border-[#2a2f42] rounded-md px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 cursor-pointer font-mono"
              title="Execution form: pin the generated app to a CLI / web / library so the model does not drift to a web app for a console spec"
            >
              <option value="cli" className="bg-[#161922]">🖥️ CLI autonome</option>
              <option value="web" className="bg-[#161922]">🌐 Web app</option>
              <option value="gui" className="bg-[#161922]">🪟 Appli avec UI (bureau / jeu)</option>
              <option value="server" className="bg-[#161922]">🔌 Serveur / API</option>
              <option value="library" className="bg-[#161922]">📦 Bibliothèque</option>
            </select>
          </div>

          {/* Serve / Stop toggle: preview the generated web app from the IDE */}
          <button
            onClick={toggleServe}
            className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
              isServing
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                : 'bg-[#0f1117] hover:bg-[#2a2f42] text-gray-300 border border-[#2a2f42]'
            }`}
            title={isServing ? `Stop the static server (${serveUrl})` : 'Serve the generated files over HTTP (loopback) and open the app in a new tab'}
          >
            {isServing ? <Square size={13} className="text-emerald-400" /> : <Globe size={13} className="text-cyan-400" />}
            <span>{isServing ? 'Stop' : 'Serve'}</span>
          </button>
        </div>
      </div>

      {/* Right Actions: Git, Export, Generate & Settings */}
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
          onClick={toggleTutorial}
          className="flex items-center space-x-1.5 px-3 py-1.5 bg-cyan-950/40 hover:bg-cyan-900/50 text-cyan-300 rounded-lg border border-cyan-500/40 text-xs font-semibold transition-all shadow-sm shadow-cyan-950/40"
          title="Learn IPL with the interactive step-by-step tutorial"
        >
          <GraduationCap size={15} className="text-cyan-400" />
          <span>IPL Tutorial</span>
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

        {/* Generate Button */}
        <button
          onClick={runGeneration}
          disabled={isGenerating}
          className="flex items-center space-x-2 px-4 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 text-black font-bold rounded-lg text-xs transition-all shadow-lg shadow-cyan-500/20 active:scale-95"
        >
          <Play size={14} className="fill-current" />
          <span>{isGenerating ? 'Generating...' : 'Generate (Ctrl+Enter)'}</span>
        </button>
      </div>
    </header>
  );
};
