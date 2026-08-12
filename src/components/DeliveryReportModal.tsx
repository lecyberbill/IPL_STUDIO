import React, { useState } from 'react';
import { useIdeStore } from '../store/useIdeStore';
import { summarizeConsolidation, buildDeliveryFixPrompt } from '../engine/consolidationAgent';
import { CheckCircle2, AlertTriangle, AlertCircle, Search, Wrench, X, FileSearch, ClipboardList, Copy, Check } from 'lucide-react';

interface DeliveryReportModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * P2 — full delivery report in a popup. The bottom console is height-constrained,
 * so the Delivery tab offers an expand action that renders the same report (token
 * budget, found/fixed/remaining, issues, raw text) in a large overlay.
 */
export const DeliveryReportModal: React.FC<DeliveryReportModalProps> = ({ open, onClose }) => {
  const { consolidationResult, runUsage, setActivePanelTab, setSelectedFilePath, addLog, targetLang } = useIdeStore();
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  if (!open || !consolidationResult) return null;

  const result = consolidationResult;
  const { found, fixed, remaining, warnings } = summarizeConsolidation(result);
  const isClean = found === 0 && remaining === 0;
  const hasActionable = remaining > 0 || warnings.length > 0;

  const navigate = (file: string) => {
    setActivePanelTab('files');
    setSelectedFilePath(file);
    addLog(`Delivery: opened "${file}" in the generated-files viewer.`, 'info');
    onClose();
  };

  const copyFixPrompt = async () => {
    if (!hasActionable) return;
    const prompt = buildDeliveryFixPrompt(result.confirmedIssues, warnings, targetLang);
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedPrompt(true);
      addLog('Delivery: correction prompt copied — paste it in the LLM Chat to fix the remaining issues.', 'info');
      setTimeout(() => setCopiedPrompt(false), 2000);
    } catch {
      addLog('Delivery: could not copy the prompt to the clipboard.', 'warn');
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6 select-none"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[min(900px,95vw)] h-[min(80vh,780px)] bg-[#12141c] border border-[#2a2f42] rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Modal header */}
        <div className="px-4 py-2.5 border-b border-[#2a2f42] bg-[#161922] flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3 font-mono text-[11px] text-cyan-300">
          <ClipboardList size={14} />
          <span className="font-bold tracking-wide">CONSOLIDATION DELIVERY REPORT</span>
          <button
            onClick={copyFixPrompt}
            disabled={!hasActionable}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-[10px] font-semibold border transition-colors ${
              copiedPrompt
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : hasActionable
                  ? 'bg-amber-500/10 hover:bg-amber-500/25 border-amber-500/30 text-amber-300'
                  : 'bg-transparent border-[#2a2f42] text-gray-600 cursor-not-allowed'
            }`}
            title={hasActionable ? 'Copy a ready-to-paste repair prompt (paste it in the LLM Chat)' : 'Nothing to fix'}
          >
            {copiedPrompt ? <Check size={12} /> : <Copy size={12} />}
            <span>{copiedPrompt ? 'Prompt copié' : 'Copier le prompt de correction'}</span>
          </button>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-white hover:bg-[#2a2f42] rounded transition-colors"
          title="Close report"
        >
          <X size={16} />
        </button>
      </div>

        {/* Token-economy budget */}
        {runUsage && (
          <div className="px-4 py-2 bg-[#0f1117]/70 border-b border-[#2a2f42] font-mono text-[11px] text-gray-400 flex flex-wrap items-center gap-x-2 select-text">
            <span className="text-cyan-400">spec {runUsage.specTokens} tok</span>
            <span>→</span>
            <span>génération <strong className="text-gray-200">{runUsage.generation.inputTokens + runUsage.generation.outputTokens}</strong>
              <span className="text-gray-500"> ({runUsage.generation.inputTokens} in / {runUsage.generation.outputTokens} out)</span>
            </span>
            <span>+</span>
            <span>consolidation <strong className="text-gray-200">{runUsage.consolidation.inputTokens + runUsage.consolidation.outputTokens}</strong>
              <span className="text-gray-500"> ({runUsage.consolidation.inputTokens} in / {runUsage.consolidation.outputTokens} out)</span>
            </span>
            <span>+</span>
            <span>réparation <strong className="text-gray-200">{runUsage.repair.inputTokens + runUsage.repair.outputTokens}</strong></span>
            {runUsage.repairPasses > 0 && <span className="text-amber-400">· {runUsage.repairPasses} pass(es)</span>}
            {runUsage.clarificationRoundtrips > 0 && <span className="text-purple-400">· {runUsage.clarificationRoundtrips} clarification(s)</span>}
          </div>
        )}

        {/* Found / Fixed / Remaining summary */}
        <div className="grid grid-cols-3 gap-3 px-4 py-3 border-b border-[#2a2f42] shrink-0">
          <div className="flex items-center space-x-2.5 px-3 py-2 rounded-lg bg-sky-500/5 border border-sky-500/20">
            <Search size={16} className="text-sky-400 shrink-0" />
            <div>
              <div className="text-lg font-bold font-mono text-sky-300 leading-none">{found}</div>
              <div className="text-[9px] uppercase tracking-wide text-gray-500 mt-1">trouvé</div>
            </div>
          </div>
          <div className="flex items-center space-x-2.5 px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
            <Wrench size={16} className="text-emerald-400 shrink-0" />
            <div>
              <div className="text-lg font-bold font-mono text-emerald-300 leading-none">{fixed}</div>
              <div className="text-[9px] uppercase tracking-wide text-gray-500 mt-1">corrigé</div>
            </div>
          </div>
          <div className="flex items-center space-x-2.5 px-3 py-2 rounded-lg bg-rose-500/5 border border-rose-500/20">
            <AlertCircle size={16} className="text-rose-400 shrink-0" />
            <div>
              <div className="text-lg font-bold font-mono text-rose-300 leading-none">{remaining}</div>
              <div className="text-[9px] uppercase tracking-wide text-gray-500 mt-1">restant</div>
            </div>
          </div>
        </div>

        {/* Scrollable detail */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 font-mono text-xs select-text">
          {isClean ? (
            <div className="flex items-center space-x-2 px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
              <span className="text-emerald-300">No confirmed defects found — ready for human testing.</span>
            </div>
          ) : (
            <>
              {remaining > 0 && (
                <div>
                  <div className="text-[9px] uppercase tracking-wide text-rose-400/80 mb-1">Restant · à corriger ({remaining})</div>
                  <div className="space-y-1.5">
                    {result.confirmedIssues.map((c, i) => (
                      <button
                        key={`${c.kind}:${c.file}:${c.message}:${i}`}
                        onClick={() => navigate(c.file)}
                        className="w-full text-left flex items-start space-x-2.5 px-3 py-2 rounded-lg cursor-pointer border transition-all bg-rose-500/5 border-rose-500/20 hover:bg-rose-500/15"
                        title={`Open "${c.file}" in the Files viewer`}
                      >
                        {c.kind === 'static'
                          ? <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
                          : <AlertCircle size={14} className="text-rose-400 shrink-0 mt-0.5" />}
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-semibold text-rose-300">{c.file}</div>
                          <div className="text-gray-300 leading-snug break-words">{c.message}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {warnings.length > 0 && (
                <div>
                  <div className="text-[9px] uppercase tracking-wide text-amber-400/80 mb-1">Avertissements du reviewer · non bloquants ({warnings.length})</div>
                  <div className="space-y-1.5">
                    {warnings.map((w, i) => (
                      <button
                        key={`${w.file}:${w.message}:${i}`}
                        onClick={() => navigate(w.file)}
                        className="w-full text-left flex items-start space-x-2.5 px-3 py-2 rounded-lg cursor-pointer border transition-all bg-amber-500/5 border-amber-500/20 hover:bg-amber-500/15"
                        title={`Open "${w.file}" in the Files viewer`}
                      >
                        <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-semibold text-amber-300">{w.file}</div>
                          <div className="text-gray-300 leading-snug break-words">{w.message}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Full raw report */}
          <div>
            <div className="text-[9px] uppercase tracking-wide text-cyan-400/80 mb-1">Rapport brut</div>
            <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-gray-300 bg-[#0b0d13] border border-[#2a2f42] rounded-lg p-3">
              {result.report || 'No report text.'}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-[#2a2f42] bg-[#161922] flex items-center justify-between font-mono text-[10px] shrink-0">
          <span className="text-gray-500 flex items-center space-x-1.5">
            <FileSearch size={12} className="text-cyan-400" />
            <span>{result.files.length} file(s) delivered</span>
          </span>
          <span className="text-gray-500">
            auto-fix: {result.passesUsed} pass(es){result.changed ? ' · files modified' : ' · no change'}
          </span>
        </div>
      </div>
    </div>
  );
};
