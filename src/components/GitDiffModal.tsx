import React, { useEffect, useState } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { useIdeStore } from '../store/useIdeStore';
import { defaultOutputDir } from '../engine/paths';
import { apiFetch } from '../services/api';
import { GitCompare, X, GitCommit, RefreshCw, FileText } from 'lucide-react';

interface GitDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GitDiffModal: React.FC<GitDiffModalProps> = ({ isOpen, onClose }) => {
  const { projects, activeProjectId, generatedCode, addLog } = useIdeStore();
  const [gitStatus, setGitStatus] = useState<string>('');
  const [gitDiffRaw, setGitDiffRaw] = useState<string>('');
  const [commitMessage, setCommitMessage] = useState<string>('feat: Update IPL project generated code');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isCommitting, setIsCommitting] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'visual' | 'raw'>('visual');

  const activeProj = projects.find(p => p.id === activeProjectId);
  const outputDir = activeProj?.outputDir || defaultOutputDir(activeProj?.name || 'my_project');

  const fetchGitData = async () => {
    setIsLoading(true);
    try {
      const statusRes = await apiFetch(`/api/git/status?cwd=${encodeURIComponent(outputDir)}`);
      const statusJson = await statusRes.json();
      setGitStatus(statusJson.status || statusJson.error || 'No git status');

      const diffRes = await apiFetch(`/api/git/diff?cwd=${encodeURIComponent(outputDir)}`);
      const diffJson = await diffRes.json();
      setGitDiffRaw(diffJson.diff || 'No pending git changes.');
    } catch (err: any) {
      setGitStatus(`Git Error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchGitData();
    }
  }, [isOpen, outputDir]);

  const handleCommit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commitMessage.trim() || isCommitting) return;

    setIsCommitting(true);
    try {
      const res = await apiFetch('/api/git/commit', {
        method: 'POST',
        body: JSON.stringify({
          cwd: outputDir,
          message: commitMessage.trim()
        })
      });

      const json = await res.json();
      if (res.ok) {
        addLog(`[Git] Commit created: "${commitMessage}"`, 'success');
        fetchGitData();
        setCommitMessage('feat: Update generated project files');
      } else {
        addLog(`[Git Error] ${json.error}`, 'error');
      }
    } catch (err: any) {
      addLog(`[Git Commit Error] ${err.message}`, 'error');
    } finally {
      setIsCommitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
      <div className="bg-[#161922] border border-[#2a2f42] rounded-xl w-full max-w-5xl h-[85vh] shadow-2xl flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-[#2a2f42] flex items-center justify-between bg-[#0f1117] shrink-0">
          <div className="flex items-center space-x-2">
            <GitCompare size={18} className="text-cyan-400" />
            <h2 className="font-bold text-white text-sm">Monaco Git Diff & Commit Manager</h2>
            <span className="text-[10px] text-gray-400 font-mono">({outputDir})</span>
          </div>

          <div className="flex items-center space-x-2">
            <div className="flex bg-[#161922] p-0.5 rounded border border-[#2a2f42]">
              <button
                onClick={() => setActiveTab('visual')}
                className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                  activeTab === 'visual'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Side-by-Side Monaco Diff
              </button>
              <button
                onClick={() => setActiveTab('raw')}
                className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                  activeTab === 'raw'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Git Status & CLI Diff
              </button>
            </div>

            <button
              onClick={fetchGitData}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-[#2a2f42] rounded transition-colors"
              title="Refresh Git status"
            >
              <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-[#2a2f42] rounded transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Main Area */}
        <div className="flex-1 min-h-0 overflow-hidden bg-[#0f1117]">
          {activeTab === 'visual' ? (
            <div className="w-full h-full flex flex-col">
              <div className="h-8 bg-[#12141c] border-b border-[#2a2f42] px-4 flex items-center justify-between text-[11px] font-mono text-gray-400 shrink-0">
                <span className="text-rose-400">🔴 Head (Original specification code)</span>
                <span className="text-emerald-400">🟢 Modified (Generated LLM multi-file artifact)</span>
              </div>
              <div className="flex-1 overflow-hidden">
                <DiffEditor
                  original={activeProj?.code || '// Original specification'}
                  modified={generatedCode || '// Modified generated artifact'}
                  language="ipl"
                  theme="vs-dark"
                  options={{
                    readOnly: true,
                    renderSideBySide: true,
                    fontSize: 12,
                    fontFamily: 'Fira Code, Menlo, Monaco, Consolas, monospace',
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    automaticLayout: true
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="w-full h-full p-4 overflow-y-auto font-mono text-xs space-y-4 text-gray-300 select-text">
              <div>
                <h3 className="font-bold text-cyan-400 mb-1 flex items-center space-x-1">
                  <FileText size={14} />
                  <span>git status output:</span>
                </h3>
                <pre className="bg-[#12141c] border border-[#2a2f42] p-3 rounded text-gray-300 overflow-x-auto">
                  {gitStatus || 'No status available.'}
                </pre>
              </div>

              <div>
                <h3 className="font-bold text-cyan-400 mb-1 flex items-center space-x-1">
                  <GitCompare size={14} />
                  <span>git diff output:</span>
                </h3>
                <pre className="bg-[#12141c] border border-[#2a2f42] p-3 rounded text-emerald-300 overflow-x-auto">
                  {gitDiffRaw || 'No pending git changes.'}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer (Git Commit Form) */}
        <div className="p-3 border-t border-[#2a2f42] bg-[#12141c] shrink-0">
          <form onSubmit={handleCommit} className="flex items-center space-x-2">
            <input
              type="text"
              placeholder="Commit message (e.g. feat: Add user authentication module)..."
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              disabled={isCommitting}
              className="flex-1 bg-[#161922] border border-[#2a2f42] rounded-lg px-3 py-1.5 font-mono text-xs text-white focus:outline-none focus:border-cyan-500 disabled:opacity-50"
            />

            <button
              type="submit"
              disabled={!commitMessage.trim() || isCommitting}
              className="flex items-center space-x-1.5 px-4 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 disabled:opacity-40 text-black font-bold rounded-lg text-xs transition-all shadow"
            >
              {isCommitting ? <RefreshCw size={14} className="animate-spin text-black" /> : <GitCommit size={14} />}
              <span>{isCommitting ? 'Committing...' : 'Stage & Commit'}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
