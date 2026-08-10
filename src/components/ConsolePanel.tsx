import React, { useState } from 'react';
import { useIdeStore } from '../store/useIdeStore';
import { TerminalPanel } from './TerminalPanel';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import { Terminal, Trash2, Info, CheckCircle2, AlertTriangle, AlertCircle, ChevronUp, ChevronDown, ListChecks } from 'lucide-react';

export const ConsolePanel: React.FC = () => {
  const { logs, clearLogs, syntaxErrors } = useIdeStore();
  const [activeTab, setActiveTab] = useState<'terminal' | 'diagnostics' | 'logs'>('terminal');
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  const getLogIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />;
      case 'warn':
        return <AlertTriangle size={13} className="text-amber-400 shrink-0" />;
      case 'error':
        return <AlertCircle size={13} className="text-rose-400 shrink-0" />;
      default:
        return <Info size={13} className="text-cyan-400 shrink-0" />;
    }
  };

  return (
    <footer className="bg-[#0f1117] border-t border-[#2a2f42] flex flex-col select-none z-20">
      {/* Console Header Tabs */}
      <div className="h-9 bg-[#161922] px-4 flex items-center justify-between border-b border-[#2a2f42] text-xs">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => { setActiveTab('terminal'); setIsExpanded(true); }}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
              activeTab === 'terminal' && isExpanded
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Terminal size={14} />
            <span>Embedded Terminal (Run)</span>
          </button>

          <button
            onClick={() => { setActiveTab('diagnostics'); setIsExpanded(true); }}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
              activeTab === 'diagnostics' && isExpanded
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <ListChecks size={14} />
            <span>Diagnostics ({syntaxErrors.length})</span>
          </button>

          <button
            onClick={() => { setActiveTab('logs'); setIsExpanded(true); }}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
              activeTab === 'logs' && isExpanded
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Info size={14} />
            <span>IDE System Logs ({logs.length})</span>
          </button>
        </div>

        <div className="flex items-center space-x-3">
          {activeTab === 'logs' && (
            <button
              onClick={clearLogs}
              className="p-1 text-gray-400 hover:text-white hover:bg-[#2a2f42] rounded transition-colors"
              title="Clear IDE Logs"
            >
              <Trash2 size={14} />
            </button>
          )}

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 text-gray-400 hover:text-white hover:bg-[#2a2f42] rounded transition-colors"
            title={isExpanded ? 'Collapse panel' : 'Expand panel'}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {/* Expanded Console Body */}
      {isExpanded && (
        <div className="h-44 bg-[#0b0d13] overflow-hidden">
          {activeTab === 'terminal' ? (
            <TerminalPanel />
          ) : activeTab === 'diagnostics' ? (
            <DiagnosticsPanel />
          ) : (
            <div className="h-full overflow-y-auto p-3 space-y-1.5 font-mono text-xs select-text">
              {logs.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center text-gray-500">
                  <Info size={22} className="text-gray-600 mb-2" />
                  <p className="text-[11px] text-gray-500 max-w-sm">
                    No IDE system activity yet. Generate a project or run a command to see diagnostic logs here.
                  </p>
                </div>
              )}
              {logs.map((log) => (
                <div key={log.id} className="flex items-start space-x-2 text-gray-300 leading-tight">
                  <span className="text-[10px] text-gray-500 shrink-0 font-sans">{log.time}</span>
                  {getLogIcon(log.type)}
                  <span className={`flex-1 ${
                    log.type === 'error' ? 'text-rose-300 font-semibold' :
                    log.type === 'warn' ? 'text-amber-300' :
                    log.type === 'success' ? 'text-emerald-300' : 'text-gray-300'
                  }`}>
                    {log.text}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </footer>
  );
};
