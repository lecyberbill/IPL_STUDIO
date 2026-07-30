import React, { useState, useEffect } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { useIdeStore } from '../store/useIdeStore';
import { GitBranch, GitCommit, GitPullRequest, X, Check, RefreshCw, Split } from 'lucide-react';

interface GitDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GitDiffModal: React.FC<GitDiffModalProps> = ({ isOpen, onClose }) => {
  const { code, addLog } = useIdeStore();
  const [diffMode, setDiffMode] = useState<'ipl' | 'git'>('ipl');
  const [originalCode, setOriginalCode] = useState<string>('');
  const [gitStatus, setGitStatus] = useState<{ branch: string; statusText: string }>({ branch: 'main', statusText: 'Chargement...' });
  const [gitDiffText, setGitDiffText] = useState<string>('');
  const [commitMessage, setCommitMessage] = useState<string>('');
  const [isCommitting, setIsCommitting] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      fetchGitStatus();
      // Code original par défaut pour la comparaison
      setOriginalCode(`// Code IPL Initial (Original)\nadd datacenter {\n  name: "Eu-Central-Datacenter",\n  region: "eu-west-1"\n}\n`);
    }
  }, [isOpen]);

  const fetchGitStatus = async () => {
    try {
      const resStatus = await fetch('/api/git/status');
      const dataStatus = await resStatus.json();
      setGitStatus(dataStatus);

      const resDiff = await fetch('/api/git/diff');
      const dataDiff = await resDiff.json();
      setGitDiffText(dataDiff.diffText || '');
    } catch (err) {
      console.error(err);
    }
  };

  const handleCommit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commitMessage.trim()) return;
    setIsCommitting(true);

    try {
      const res = await fetch('/api/git/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: commitMessage.trim() })
      });
      const data = await res.json();
      if (data.success) {
        addLog(`[Git] Commit réussi : "${commitMessage.trim()}" 🔀`, 'success');
        setCommitMessage('');
        fetchGitStatus();
      } else {
        addLog(`Erreur Git Commit: ${data.error}`, 'error');
      }
    } catch (err: any) {
      addLog(`Erreur Git: ${err.message}`, 'error');
    } finally {
      setIsCommitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
      <div className="bg-[#161922] border border-[#2a2f42] rounded-xl w-full max-w-5xl h-[85vh] shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="px-5 py-3 border-b border-[#2a2f42] flex items-center justify-between bg-[#0f1117]">
          <div className="flex items-center space-x-3">
            <GitBranch size={18} className="text-cyan-400" />
            <h2 className="font-bold text-white text-sm">Visualiseur Git Diff & Contrôle de Version</h2>
            <span className="text-[10px] bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded border border-cyan-500/30 font-mono">
              Branche : {gitStatus.branch}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <div className="flex bg-[#161922] p-1 rounded-lg border border-[#2a2f42]">
              <button
                onClick={() => setDiffMode('ipl')}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-colors flex items-center space-x-1 ${
                  diffMode === 'ipl' ? 'bg-cyan-500 text-black font-bold' : 'text-gray-400 hover:text-white'
                }`}
              >
                <Split size={13} />
                <span>Diff IPL Code</span>
              </button>
              <button
                onClick={() => setDiffMode('git')}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-colors flex items-center space-x-1 ${
                  diffMode === 'git' ? 'bg-cyan-500 text-black font-bold' : 'text-gray-400 hover:text-white'
                }`}
              >
                <GitPullRequest size={13} />
                <span>Git Status / Raw Diff</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-white hover:bg-[#2a2f42] rounded transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Main Diff Area */}
          <div className="flex-1 bg-[#0f1117] flex flex-col overflow-hidden">
            {diffMode === 'ipl' ? (
              <div className="w-full h-full flex flex-col">
                <div className="px-4 py-1.5 bg-[#12141c] border-b border-[#2a2f42] flex justify-between text-xs font-mono text-gray-400">
                  <span>👈 Code Original (Original)</span>
                  <span>👉 Code Actuel Modifié (Working Copy)</span>
                </div>
                <div className="flex-1">
                  <DiffEditor
                    height="100%"
                    language="javascript"
                    theme="vs-dark"
                    original={originalCode}
                    modified={code}
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      fontSize: 12,
                      fontFamily: 'Fira Code, monospace'
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="w-full h-full p-4 overflow-auto font-mono text-xs text-gray-300 leading-relaxed bg-[#0b0d13] select-text">
                <div className="mb-3 text-cyan-400 font-bold border-b border-[#2a2f42] pb-1">
                  $ git status
                </div>
                <pre className="text-emerald-300 mb-4 whitespace-pre-wrap">{gitStatus.statusText}</pre>

                <div className="mb-2 text-purple-400 font-bold border-b border-[#2a2f42] pb-1">
                  $ git diff
                </div>
                <pre className="text-gray-300 whitespace-pre-wrap">{gitDiffText || 'Aucune modification non comitée.'}</pre>
              </div>
            )}
          </div>

          {/* Right Commit Sidebar */}
          <div className="w-80 bg-[#161922] border-l border-[#2a2f42] p-4 flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-white text-xs uppercase tracking-wider mb-3 flex items-center space-x-1.5">
                <GitCommit size={15} className="text-cyan-400" />
                <span>Nouveau Commit Git</span>
              </h3>

              <form onSubmit={handleCommit} className="space-y-3">
                <div>
                  <label className="text-[11px] text-gray-400 mb-1 block font-mono">Message du Commit :</label>
                  <textarea
                    rows={4}
                    placeholder="Ex: feat: ajout verbe compute et matérialisation disque..."
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    className="w-full bg-[#0f1117] border border-[#2a2f42] rounded-lg p-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 font-mono resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!commitMessage.trim() || isCommitting}
                  className="w-full flex items-center justify-center space-x-1.5 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-bold rounded-lg text-xs transition-all disabled:opacity-40 shadow"
                >
                  {isCommitting ? (
                    <RefreshCw size={14} className="animate-spin text-black" />
                  ) : (
                    <Check size={14} />
                  )}
                  <span>{isCommitting ? 'Commit...' : 'Git Commit (All)'}</span>
                </button>
              </form>
            </div>

            {/* Footer Summary */}
            <div className="pt-3 border-t border-[#2a2f42] text-[10px] font-mono text-gray-500 space-y-1">
              <div>• Auto Stage (`git add .`)</div>
              <div>• Comparateur côte-à-côte Monaco</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
