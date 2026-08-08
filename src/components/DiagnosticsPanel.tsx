import React, { useState } from 'react';
import { useIdeStore } from '../store/useIdeStore';
import { applySingleQuickFix } from '../engine/iplQuickFix';
import type { SyntaxErrorItem } from '../engine/iplGrammar';
import { AlertTriangle, Info, Zap } from 'lucide-react';

type SeverityFilter = 'all' | 'warning' | 'info';

const SEVERITY_FILTERS: Array<{ key: SeverityFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'warning', label: 'Warnings' },
  { key: 'info', label: 'Info' }
];

/**
 * Phase 6 — dedicated advisory diagnostics panel. Filters by severity, jumps to
 * the offending line in Monaco, and lets every diagnostic that carries a
 * quick-fix be applied directly from the panel.
 */
export const DiagnosticsPanel: React.FC = () => {
  const { syntaxErrors, code, setCode, editorInstance, addLog } = useIdeStore();
  const [filter, setFilter] = useState<SeverityFilter>('all');

  const editor = editorInstance;

  const jumpTo = (d: SyntaxErrorItem) => {
    if (!editor) return;
    const position = { lineNumber: d.line, column: d.column };
    editor.setPosition(position);
    editor.revealPositionInCenter(position);
    editor.focus();
  };

  const applyFix = (d: SyntaxErrorItem) => {
    if (!d.fix) return;
    const fixed = applySingleQuickFix(code, d);
    if (fixed && fixed !== code) {
      setCode(fixed);
      addLog(`Quick-fix applied from panel: ${d.fix.label}.`, 'success');
    }
  };

  const visible = syntaxErrors.filter(d => filter === 'all' || d.severity === filter);
  const fixableCount = syntaxErrors.filter(d => d.fix).length;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#2a2f42]">
        <div className="flex items-center space-x-1">
          {SEVERITY_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-2.5 py-0.5 rounded text-[10px] font-semibold transition-all ${
                filter === f.key
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="text-[10px] font-mono text-gray-500">
          {visible.length}/{syntaxErrors.length} shown · {fixableCount} fixable
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-xs text-gray-500 font-mono">
          No advisory diagnostics for the active file.
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-2 space-y-1 font-mono text-[11px] select-text">
          {visible.map((d, i) => {
            const isWarning = d.severity === 'warning';
            const fix = d.fix;
            return (
              <div
                key={`${d.line}:${d.column}:${i}`}
                onClick={() => jumpTo(d)}
                className={`flex items-start space-x-2 px-2 py-1.5 rounded-md cursor-pointer transition-all border ${
                  isWarning
                    ? 'bg-amber-500/5 border-amber-500/20 hover:bg-amber-500/15'
                    : 'bg-sky-500/5 border-sky-500/20 hover:bg-sky-500/15'
                }`}
                title="Click to jump to line"
              >
                {isWarning
                  ? <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
                  : <Info size={13} className="text-sky-400 shrink-0 mt-0.5" />}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className={`text-[10px] font-semibold ${isWarning ? 'text-amber-300' : 'text-sky-300'}`}>
                      L{d.line}:{d.column}
                    </span>
                    <span className="text-[9px] uppercase tracking-wide text-gray-500">
                      {isWarning ? 'warning' : 'info'}
                    </span>
                  </div>
                  <div className="text-gray-300 leading-snug break-words">{d.message}</div>
                </div>

                {fix && (
                  <button
                    onClick={(e) => { e.stopPropagation(); applyFix(d); }}
                    className="flex items-center space-x-1 px-2 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-300 text-[10px] font-semibold border border-emerald-500/30 shrink-0"
                    title={`Apply: ${fix.label}`}
                  >
                    <Zap size={10} />
                    <span>Fix</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
