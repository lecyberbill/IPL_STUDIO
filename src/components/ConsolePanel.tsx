import React, { useState } from 'react';
import { useIdeStore } from '../store/useIdeStore';
import { TerminalPanel } from './TerminalPanel';
import { 
  Terminal as TerminalIcon, 
  Trash2, 
  CheckCircle2, 
  AlertTriangle, 
  Info, 
  XCircle,
  ChevronUp,
  ChevronDown,
  Keyboard,
  Copy,
  Check,
  SquareTerminal
} from 'lucide-react';

export const ConsolePanel: React.FC = () => {
  const { logs, clearLogs, syntaxErrors } = useIdeStore();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'logs' | 'terminal' | 'errors'>('logs');
  const [copied, setCopied] = useState(false);

  const logIcons = {
    info: <Info size={13} className="text-cyan-400 shrink-0 select-none" />,
    success: <CheckCircle2 size={13} className="text-emerald-400 shrink-0 select-none" />,
    warn: <AlertTriangle size={13} className="text-amber-400 shrink-0 select-none" />,
    error: <XCircle size={13} className="text-rose-400 shrink-0 select-none" />
  };

  const handleCopyLogs = () => {
    if (logs.length > 0) {
      const logText = logs.map(l => `[${l.time}] [${l.type.toUpperCase()}] ${l.text}`).join('\n');
      navigator.clipboard.writeText(logText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className={`bg-[#0f1117] border-t border-[#2a2f42] flex flex-col transition-all duration-200 ${
      isCollapsed ? 'h-8' : 'h-64'
    }`}>
      {/* Header bar */}
      <div className="h-8 bg-[#161922] px-4 flex items-center justify-between border-b border-[#2a2f42] select-none">
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => { setActiveTab('logs'); setIsCollapsed(false); }}
            className={`flex items-center space-x-1.5 text-xs font-semibold ${
              activeTab === 'logs' ? 'text-cyan-400' : 'text-gray-400 hover:text-white'
            }`}
          >
            <TerminalIcon size={14} />
            <span>Console de Compilation ({logs.length})</span>
          </button>

          <button 
            onClick={() => { setActiveTab('terminal'); setIsCollapsed(false); }}
            className={`flex items-center space-x-1.5 text-xs font-semibold ${
              activeTab === 'terminal' ? 'text-emerald-400' : 'text-gray-400 hover:text-white'
            }`}
          >
            <SquareTerminal size={14} />
            <span>Terminal Embarqué (Run)</span>
          </button>

          <button 
            onClick={() => { setActiveTab('errors'); setIsCollapsed(false); }}
            className={`flex items-center space-x-1.5 text-xs font-semibold ${
              activeTab === 'errors' ? 'text-rose-400' : 'text-gray-400 hover:text-white'
            }`}
          >
            <AlertTriangle size={14} />
            <span>Erreurs ({syntaxErrors.length})</span>
          </button>
        </div>

        <div className="flex items-center space-x-3 text-xs text-gray-400">
          <div className="flex items-center space-x-1 font-mono text-[10px] text-gray-500 bg-[#0f1117] px-2 py-0.5 rounded border border-[#2a2f42]">
            <Keyboard size={12} className="text-cyan-400" />
            <span>Ctrl + Entrée pour Compiler</span>
          </div>

          {activeTab === 'logs' && (
            <button
              onClick={handleCopyLogs}
              disabled={logs.length === 0}
              className="flex items-center space-x-1 px-2 py-0.5 bg-[#0f1117] hover:bg-[#2a2f42] border border-[#2a2f42] rounded text-xs text-gray-300 transition-colors disabled:opacity-40"
              title="Copier tout le texte des logs"
            >
              {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              <span className="text-[10px] font-mono">{copied ? 'Copié !' : 'Copier Logs'}</span>
            </button>
          )}

          {activeTab === 'logs' && (
            <button
              onClick={clearLogs}
              className="p-1 hover:text-white hover:bg-[#2a2f42] rounded transition-colors"
              title="Effacer les logs"
            >
              <Trash2 size={14} />
            </button>
          )}

          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 hover:text-white hover:bg-[#2a2f42] rounded transition-colors"
            title={isCollapsed ? 'Agrandir le panneau' : 'Réduire le panneau'}
          >
            {isCollapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Body Area */}
      {!isCollapsed && (
        <div className="flex-1 overflow-hidden">
          {activeTab === 'terminal' ? (
            <TerminalPanel />
          ) : activeTab === 'logs' ? (
            <div className="w-full h-full overflow-y-auto p-3 font-mono text-xs space-y-1.5 select-text cursor-text">
              {logs.length > 0 ? (
                logs.map((log) => (
                  <div key={log.id} className="flex items-start space-x-2 text-gray-300 leading-tight select-text">
                    <span className="text-[10px] text-gray-500 shrink-0 select-none font-mono">[{log.time}]</span>
                    {logIcons[log.type]}
                    <span className={`select-text ${
                      log.type === 'error' ? 'text-rose-400' :
                      log.type === 'warn' ? 'text-amber-300' :
                      log.type === 'success' ? 'text-emerald-300 font-semibold' : 'text-gray-300'
                    }`}>
                      {log.text}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-gray-500 italic text-[11px] select-none">Aucun log d'exécution pour le moment.</div>
              )}
            </div>
          ) : (
            <div className="w-full h-full overflow-y-auto p-3 font-mono text-xs space-y-1.5 select-text cursor-text">
              {syntaxErrors.length > 0 ? (
                syntaxErrors.map((err, idx) => (
                  <div key={idx} className="flex items-start space-x-2 text-rose-300 bg-rose-500/10 p-2 rounded border border-rose-500/20 select-text">
                    <AlertTriangle size={14} className="shrink-0 text-rose-400 select-none" />
                    <div className="select-text">
                      <div className="font-bold select-text">Ligne {err.line}, Colonne {err.column}</div>
                      <div className="text-xs text-rose-200 select-text">{err.message}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-emerald-400 flex items-center space-x-2 py-2 font-medium select-none">
                  <CheckCircle2 size={16} />
                  <span>Aucune erreur de syntaxe trouvée dans le code IPL. Clôture des accolades {`{}`} valide.</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
