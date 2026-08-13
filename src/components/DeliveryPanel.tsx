import React, { useState } from 'react';
import { useIdeStore } from '../store/useIdeStore';
import { summarizeConsolidation, buildDeliveryFixPrompt } from '../engine/consolidationAgent';
import type { ConsolidationResult } from '../engine/consolidationAgent';
import { defaultOutputDir } from '../engine/paths';
import { apiFetch } from '../services/api';
import { DeliveryReportModal } from './DeliveryReportModal';
import { CheckCircle2, AlertTriangle, AlertCircle, Search, Wrench, ClipboardList, ChevronDown, ChevronUp, FileSearch, PackageCheck, Maximize2, Copy, Check } from 'lucide-react';

const EMPTY: ConsolidationResult = {
  files: [],
  staticIssues: [],
  jsonIssues: [],
  reviewIssues: [],
  confirmedIssues: [],
  passesUsed: 0,
  changed: false,
  report: ''
};

/**
 * P1 delivery panel — makes the consolidation agent's report visible in the
 * product: what the machine found, what it auto-fixed, and what still needs
 * human judgment. Each remaining issue jumps to its file in the Files viewer.
 */
export const DeliveryPanel: React.FC = () => {
  const { consolidationResult, setActivePanelTab, setSelectedFilePath, addLog, consolidationEnabled, runUsage, targetLang, smokeResult } = useIdeStore();
  const [showReport, setShowReport] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [installingTool, setInstallingTool] = useState<string | null>(null);
  const [installMsg, setInstallMsg] = useState('');

  const result = consolidationResult ?? EMPTY;
  const { found, fixed, remaining, warnings } = summarizeConsolidation(result);

  const hasReport = consolidationResult !== null;
  const isClean = hasReport && found === 0 && remaining === 0;
  const hasActionable = remaining > 0 || warnings.length > 0;

  const navigate = (file: string) => {
    setActivePanelTab('files');
    setSelectedFilePath(file);
    addLog(`Delivery: opened "${file}" in the generated-files viewer.`, 'info');
  };

  /** Runs a toolchain install command AFTER an explicit user confirmation. */
  const installTool = async (tool: string, installCommand: string) => {
    const confirmed = window.confirm(
      `Il me manque "${tool}" pour vérifier l'exécution de votre application.\n\nCommande d'installation proposée :\n${installCommand}\n\nInstaller cet outil système maintenant ?`
    );
    if (!confirmed) return;
    setInstallingTool(tool);
    setInstallMsg('');
    try {
      const proj = useIdeStore.getState().projects.find(p => p.id === useIdeStore.getState().activeProjectId);
      const outputDir = proj?.outputDir || defaultOutputDir(proj?.name || 'my_project');
      const response = await apiFetch('/api/run-command', {
        method: 'POST',
        body: JSON.stringify({ command: installCommand, cwd: outputDir })
      });
      const text = await response.text();
      if (response.status === 403) {
        setInstallMsg(`⛔ Install blocked by security: ${text}`);
      } else {
        setInstallMsg(text.slice(0, 400) || '(install finished)');
        addLog(`[Smoke] Toolchain install: ${tool}`, response.status === 200 ? 'success' : 'warn');
      }
    } catch (err: any) {
      setInstallMsg(`Install failed: ${err.message}`);
    } finally {
      setInstallingTool(null);
    }
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

  if (!hasReport) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 select-text">
        <PackageCheck size={24} className="text-gray-600 mb-2" />
        <p className="text-[11px] font-mono text-gray-400 max-w-md leading-relaxed">
          No delivery report yet.
        </p>
        <p className="text-[11px] font-mono text-gray-500 max-w-md leading-relaxed mt-1">
          Press <strong className="text-cyan-400">Generate (Ctrl+Enter)</strong> — the consolidation
          agent reviews the artifact before it is handed to you and publishes its
          found / fixed / remaining report here.
          {!consolidationEnabled && ' Enable "Consolidation agent" in Settings ⚙️ to activate the gate.'}
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-1.5 border-b border-[#2a2f42] flex items-center justify-between bg-[#161922]/60">
        <div className="flex items-center space-x-1.5 text-[10px] font-mono text-cyan-300">
          <ClipboardList size={13} />
          <span>CONSOLIDATION DELIVERY REPORT</span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={copyFixPrompt}
            disabled={!hasActionable}
            className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors ${
              copiedPrompt
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : hasActionable
                  ? 'bg-amber-500/10 hover:bg-amber-500/25 border-amber-500/30 text-amber-300'
                  : 'bg-transparent border-[#2a2f42] text-gray-600 cursor-not-allowed'
            }`}
            title={hasActionable ? 'Copy a ready-to-paste repair prompt (paste it in the LLM Chat)' : 'Nothing to fix — no remaining issues'}
          >
            {copiedPrompt ? <Check size={11} /> : <Copy size={11} />}
            <span>{copiedPrompt ? 'Copié' : 'Copier le prompt'}</span>
          </button>
          <button
            onClick={() => setShowReport(!showReport)}
            className="flex items-center space-x-1 text-[10px] font-mono text-gray-400 hover:text-white transition-colors"
            title="Toggle the raw report text"
          >
            <span>{showReport ? 'Hide raw report' : 'Show raw report'}</span>
            {showReport ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          <button
            onClick={() => setReportOpen(true)}
            className="flex items-center space-x-1 px-2 py-0.5 rounded bg-cyan-500/10 hover:bg-cyan-500/25 text-cyan-300 text-[10px] font-semibold border border-cyan-500/30 transition-colors"
            title="Open the full delivery report in a popup"
          >
            <Maximize2 size={11} />
            <span>Rapport</span>
          </button>
        </div>
      </div>

      <DeliveryReportModal open={reportOpen} onClose={() => setReportOpen(false)} />

      {/* Runtime smoke test (deterministic syntax + bounded execution) */}
      {smokeResult && (
        <div className={`px-3 py-1.5 border-b border-[#2a2f42] font-mono text-[10px] flex items-center space-x-2 select-text ${smokeResult.passed ? 'bg-emerald-500/5' : 'bg-rose-500/10'}`}>
          <span className={smokeResult.passed ? 'text-emerald-300' : 'text-rose-300'}>
            {smokeResult.passed ? '✅' : '⛔'} Smoke test: {smokeResult.files.filter(f => f.ok).length}/{smokeResult.files.length} syntax OK
            {smokeResult.execution && (smokeResult.execution.ok ? ' · exécution OK' : ` · exécution: ${smokeResult.execution.error || 'failed'}`)}
          </span>
          {!smokeResult.passed && !smokeResult.missingTools?.length && (
            <span className="text-rose-300/90 truncate">
              {smokeResult.files.filter(f => !f.ok).map(f => `${f.file}: ${(f.error || 'syntax error').split('\n')[0]}`).join(' · ')}
            </span>
          )}
        </div>
      )}

      {/* Missing toolchains — install offer (explicit user confirmation) */}
      {smokeResult?.missingTools && smokeResult.missingTools.length > 0 && (
        <div className="px-3 py-1.5 border-b border-[#2a2f42] bg-amber-500/10 font-mono text-[10px] select-text space-y-1">
          <div className="text-amber-300">
            Il me manque <strong>{smokeResult.missingTools.map(m => m.tool).join(', ')}</strong> pour vérifier l'exécution de votre app.
          </div>
          <div className="flex items-center space-x-2">
            {smokeResult.missingTools.map((m) => (
              <button
                key={m.tool}
                onClick={() => installTool(m.tool, m.installCommand)}
                disabled={installingTool !== null}
                className="flex items-center space-x-1 px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-[10px] font-semibold border border-amber-500/40 transition-colors disabled:opacity-50"
                title={`Installer ${m.tool}: ${m.installCommand}`}
              >
                <Wrench size={10} />
                <span>{installingTool === m.tool ? 'Installation...' : `Installer ${m.tool}`}</span>
              </button>
            ))}
          </div>
          {installMsg && <div className="text-amber-200/90 whitespace-pre-wrap break-words">{installMsg}</div>}
        </div>
      )}

      {/* Token-economy budget (P2): what the run spent to prepare the terrain. */}
      {runUsage && (
        <div className="px-3 py-1.5 bg-[#0f1117]/60 border-b border-[#2a2f42] font-mono text-[10px] text-gray-400 select-text flex items-center justify-between space-x-2">
          <span className="truncate">
            <span className="text-cyan-400">spec {runUsage.specTokens} tok</span>
            {' → '}génération <span className="text-gray-200">{runUsage.generation.inputTokens + runUsage.generation.outputTokens}</span>
            {' + '}consolidation <span className="text-gray-200">{runUsage.consolidation.inputTokens + runUsage.consolidation.outputTokens}</span>
            {' + '}réparation <span className="text-gray-200">{runUsage.repair.inputTokens + runUsage.repair.outputTokens}</span>
            {runUsage.repairPasses > 0 && <span className="text-amber-400"> · {runUsage.repairPasses} pass(es) réparation</span>}
            {runUsage.clarificationRoundtrips > 0 && <span className="text-purple-400"> · {runUsage.clarificationRoundtrips} clarification(s)</span>}
          </span>
        </div>
      )}

      {/* Found / Fixed / Remaining summary */}
      <div className="grid grid-cols-3 gap-2 px-3 py-2 border-b border-[#2a2f42]">
        <div className="flex items-center space-x-2 px-2 py-1.5 rounded-md bg-sky-500/5 border border-sky-500/20">
          <Search size={14} className="text-sky-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-base font-bold font-mono text-sky-300 leading-none">{found}</div>
            <div className="text-[9px] uppercase tracking-wide text-gray-500 mt-0.5">trouvé</div>
          </div>
        </div>
        <div className="flex items-center space-x-2 px-2 py-1.5 rounded-md bg-emerald-500/5 border border-emerald-500/20">
          <Wrench size={14} className="text-emerald-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-base font-bold font-mono text-emerald-300 leading-none">{fixed}</div>
            <div className="text-[9px] uppercase tracking-wide text-gray-500 mt-0.5">corrigé</div>
          </div>
        </div>
        <div className="flex items-center space-x-2 px-2 py-1.5 rounded-md bg-rose-500/5 border border-rose-500/20">
          <AlertCircle size={14} className="text-rose-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-base font-bold font-mono text-rose-300 leading-none">{remaining}</div>
            <div className="text-[9px] uppercase tracking-wide text-gray-500 mt-0.5">restant</div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1 font-mono text-[11px] select-text">
        {isClean ? (
          <div className="flex items-center space-x-2 px-2 py-1.5 rounded-md bg-emerald-500/5 border border-emerald-500/20">
            <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
            <span className="text-emerald-300">No confirmed defects found — ready for human testing.</span>
          </div>
        ) : (
          <>
            {remaining > 0 && (
              <div className="space-y-1">
                <div className="text-[9px] uppercase tracking-wide text-rose-400/80 px-1">
                  Restant · à corriger ({remaining})
                </div>
                {result.confirmedIssues.map((c, i) => (
                  <button
                    key={`${c.kind}:${c.file}:${c.message}:${i}`}
                    onClick={() => navigate(c.file)}
                    className="w-full text-left flex items-start space-x-2 px-2 py-1.5 rounded-md cursor-pointer border transition-all bg-rose-500/5 border-rose-500/20 hover:bg-rose-500/15"
                    title={`Open "${c.file}" in the Files viewer`}
                  >
                    {c.kind === 'static'
                      ? <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
                      : <AlertCircle size={13} className="text-rose-400 shrink-0 mt-0.5" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-semibold text-rose-300 truncate">{c.file}</div>
                      <div className="text-gray-300 leading-snug break-words">{c.message}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {warnings.length > 0 && (
              <div className="space-y-1 pt-2">
                <div className="text-[9px] uppercase tracking-wide text-amber-400/80 px-1">
                  Avertissements du reviewer · non bloquants ({warnings.length})
                </div>
                {warnings.map((w, i) => (
                  <button
                    key={`${w.file}:${w.message}:${i}`}
                    onClick={() => navigate(w.file)}
                    className="w-full text-left flex items-start space-x-2 px-2 py-1.5 rounded-md cursor-pointer border transition-all bg-amber-500/5 border-amber-500/20 hover:bg-amber-500/15"
                    title={`Open "${w.file}" in the Files viewer`}
                  >
                    <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-semibold text-amber-300 truncate">{w.file}</div>
                      <div className="text-gray-300 leading-snug break-words">{w.message}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {showReport && (
          <div className="pt-2">
            <pre className="whitespace-pre-wrap break-words text-[10px] leading-relaxed text-gray-400 bg-[#0b0d13] border border-[#2a2f42] rounded-md p-2">
              {result.report || 'No report text.'}
            </pre>
          </div>
        )}
      </div>

      <div className="px-3 py-1.5 border-t border-[#2a2f42] flex items-center justify-between text-[10px] font-mono">
        <span className="text-gray-500 flex items-center space-x-1.5">
          <FileSearch size={12} className="text-cyan-400" />
          <span>{result.files.length} file(s) delivered</span>
        </span>
        <span className="text-gray-500">
          auto-fix: {result.passesUsed} pass(es){result.changed ? ' · files modified' : ' · no change'}
        </span>
      </div>
    </div>
  );
};
