import React, { useState } from 'react';
import { useIdeStore } from '../store/useIdeStore';
import { exportContractPrompt } from '../engine/exportContract';
import { ShieldCheck, Play, Copy, Check } from 'lucide-react';

type FormOpt = '' | 'cli' | 'web' | 'gui' | 'server' | 'library' | 'batch';
const FORM_OPTS: FormOpt[] = ['', 'cli', 'web', 'gui', 'server', 'library', 'batch'];

/**
 * Pure IDE — verify ANY artifact (ours, another model's, a human's, pasted from
 * anywhere) against an IPL contract, WITHOUT generating. This is the (b) pivot:
 * IPL is the contract you check artifacts against, not a generator promise.
 */
export const VerifyPanel: React.FC = () => {
  const { code, generatedCode, verificationResult, verifyArtifactInput } = useIdeStore();
  const [artifact, setArtifact] = useState<string>(generatedCode || '');
  const [spec, setSpec] = useState<string>(code || '');
  const [path, setPath] = useState<string>('main.js');
  const [form, setForm] = useState<FormOpt>('');
  const [copied, setCopied] = useState<boolean>(false);

  const run = () => verifyArtifactInput(artifact, spec, { formFactor: form || undefined, path });

  /** IPL as an input: copy the contract as a portable prompt for ANY model. */
  const copyContract = async () => {
    try {
      await navigator.clipboard.writeText(exportContractPrompt(spec));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  const v = verificationResult;
  const pct = (c?: { preserved: number; total: number }) => (c ? (c.total === 0 ? 'n/a' : `${c.preserved}/${c.total}`) : 'n/a');

  return (
    <div className="h-full overflow-y-auto p-3 space-y-2 font-mono text-[11px] text-gray-300 select-text">
      <div className="flex items-center space-x-2 text-cyan-300 font-semibold">
        <ShieldCheck size={14} />
        <span>Verify an artifact against an IPL contract (no generation)</span>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <label className="space-y-1">
          <span className="text-gray-400">Artifact — paste <code>&lt;file path="..."&gt;</code> blocks, or a single file (with the path below)</span>
          <textarea
            value={artifact}
            onChange={e => setArtifact(e.target.value)}
            spellCheck={false}
            placeholder={'<file path="src/app.js">\n...\n</file>\n\n— or —\n\nconsole.log("raw single-file content");'}
            className="w-full h-28 bg-[#0b0d13] border border-[#2a2f42] rounded p-2 text-[11px] text-gray-200 outline-none focus:border-cyan-500/50 resize-y"
          />
        </label>

        <label className="space-y-1">
          <span className="text-gray-400">Contract — the IPL spec the artifact must satisfy</span>
          <textarea
            value={spec}
            onChange={e => setSpec(e.target.value)}
            spellCheck={false}
            placeholder={'add entity Product { sku: text, price: number }\nlisten event on "x" { send receipt to screen { format: "json", sku: p.sku, price: p.price } }'}
            className="w-full h-28 bg-[#0b0d13] border border-[#2a2f42] rounded p-2 text-[11px] text-gray-200 outline-none focus:border-cyan-500/50 resize-y"
          />
        </label>
      </div>

      <div className="flex items-center space-x-2">
        <input
          value={path}
          onChange={e => setPath(e.target.value)}
          placeholder="single-file path"
          title="Used only when the artifact has no <file> tags"
          className="w-40 bg-[#0b0d13] border border-[#2a2f42] rounded px-2 py-1 text-[11px] text-gray-200 outline-none focus:border-cyan-500/50"
        />
        <select
          value={form}
          onChange={e => setForm(e.target.value as FormOpt)}
          title="Execution form (enables the deterministic form gate)"
          className="bg-[#0b0d13] border border-[#2a2f42] rounded px-2 py-1 text-[11px] text-gray-200 outline-none focus:border-cyan-500/50"
        >
          {FORM_OPTS.map(o => <option key={o} value={o}>{o || 'form: (none)'}</option>)}
        </select>
        <button
          onClick={run}
          className="flex items-center space-x-1 px-3 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 text-[11px] font-semibold border border-cyan-500/40 transition-colors"
        >
          <Play size={12} />
          <span>Verify</span>
        </button>
        <button
          onClick={() => { setArtifact(generatedCode || ''); setSpec(code || ''); }}
          className="px-2 py-1 rounded text-gray-400 hover:text-white hover:bg-[#2a2f42] text-[11px] transition-colors"
          title="Load the current project artifact + spec"
        >
          Load current
        </button>
        <button
          onClick={copyContract}
          className="flex items-center space-x-1 px-2 py-1 rounded text-gray-400 hover:text-white hover:bg-[#2a2f42] text-[11px] transition-colors"
          title="Copy the contract as a portable prompt, to drive any external model (IPL as an input)"
        >
          {copied ? <Check size={12} className="text-emerald-300" /> : <Copy size={12} />}
          <span>{copied ? 'Copied' : 'Copy contract prompt'}</span>
        </button>
      </div>

      {v && (
        <div className="border-t border-[#2a2f42] pt-2 space-y-1">
          <div className={v.verdict === 'pass' ? 'text-emerald-300' : v.verdict === 'warn' ? 'text-amber-300' : 'text-rose-300'}>
            <strong>{v.verdict.toUpperCase()}</strong> — {v.summary}
          </div>
          <div className="text-gray-400">
            Files: {v.fileCount} · Gates: {v.gates.length} · Semantic: {v.semantic?.score ?? 'n/a'}
            {v.parity ? ` · Parity: ${v.parity.ok ? 'ok' : v.parity.issues.length + ' issue(s)'}` : ''}
          </div>
          {v.semantic && (
            <div className="text-gray-400">
              Semantic breakdown — identity {pct(v.semantic.identity)} · types {pct(v.semantic.types)} · formulas {pct(v.semantic.formulas)} · keys {pct(v.semantic.outputKeys)} · control-flow {pct(v.semantic.controlFlow)}
            </div>
          )}
          {v.gates.length > 0 && (
            <ul className="text-rose-300/90 list-disc list-inside space-y-0.5">
              {v.gates.map((g, i) => (
                <li key={i}>[{g.gate}] {g.file}: {g.message}</li>
              ))}
            </ul>
          )}
          {v.parity && !v.parity.ok && (
            <ul className="text-amber-300/90 list-disc list-inside">
              {v.parity.issues.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          )}
          {v.derivedOracle && (
            <div className="text-gray-500">
              Derived oracle (from the contract): {JSON.stringify(v.derivedOracle)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
