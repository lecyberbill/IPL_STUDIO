import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { useIdeStore } from '../store/useIdeStore';
import { defaultOutputDir } from '../engine/paths';
import { isCommandAllowed } from '../engine/security';
import { apiFetch } from '../services/api';
import { Play, Terminal as TerminalIcon, Trash2, RefreshCw, Bot, ShieldAlert } from 'lucide-react';

export const TerminalPanel: React.FC = () => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermInstance = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [commandInput, setCommandInput] = useState('');
  const [clarificationInput, setClarificationInput] = useState('');
  const [pendingConfirmCommand, setPendingConfirmCommand] = useState<string | null>(null);

  const { projects, activeProjectId, targetLang, writeArtifactToDisk, autoDebugAndFix, answerClarification, pendingClarification, addLog } = useIdeStore();
  const activeProject = projects.find(p => p.id === activeProjectId);
  const outputDir = activeProject?.outputDir || defaultOutputDir(activeProject?.name || 'my_project');

  useEffect(() => {
    let isMounted = true;
    let timerId: any = null;

    if (!terminalRef.current) return;

    // Explicit cleanup of the container element
    terminalRef.current.innerHTML = '';

    const term = new Terminal({
      theme: {
        background: '#0f1117',
        foreground: '#f8fafc',
        cursor: '#06b6d4',
        selectionBackground: '#1e293b'
      },
      fontFamily: 'Fira Code, Menlo, Monaco, Consolas, monospace',
      fontSize: 12,
      cursorBlink: true,
      rows: 10
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    timerId = setTimeout(() => {
      if (!isMounted || !terminalRef.current) return;
      try {
        term.open(terminalRef.current);
        xtermInstance.current = term;
        fitAddonRef.current = fitAddon;

        term.writeln('\x1b[1;36m=== IPL Studio Embedded Terminal v1.3.0 ===\x1b[0m');
        term.writeln(`\x1b[90mWorking Directory: ${outputDir}\x1b[0m\n`);

        try {
          fitAddon.fit();
        } catch (_) {}
      } catch (err) {
        // Ignore xterm async initialization warning
      }
    }, 50);

    const handleResize = () => {
      try {
        fitAddon.fit();
      } catch (err) {
        // Ignore exceptions on resize
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      isMounted = false;
      if (timerId) clearTimeout(timerId);
      window.removeEventListener('resize', handleResize);
      try {
        term.dispose();
      } catch (err) {}
    };
  }, []);

  const runProjectCommand = async (customCmd?: string, confirmed = false) => {
    if (isRunning) return;

    let cmdToRun = customCmd || commandInput.trim();
    if (!cmdToRun) {
      if (targetLang === 'rust') cmdToRun = 'cargo run';
      else if (targetLang === 'python') cmdToRun = 'python main.py';
      else if (targetLang === 'javascript') cmdToRun = 'node index.js';
      else if (targetLang === 'go') cmdToRun = 'go run main.go';
      else if (targetLang === 'cpp') cmdToRun = 'g++ -std=c++20 main.cpp -o main && ./main';
      else if (targetLang === 'html') cmdToRun = 'python -m http.server 8000';
      else cmdToRun = 'python main.py';
    }

    // Allow-list: commands outside the recognized set need explicit approval.
    if (!confirmed && !isCommandAllowed(cmdToRun)) {
      setPendingConfirmCommand(cmdToRun);
      return;
    }

    setIsRunning(true);

    const term = xtermInstance.current;
    if (term) {
      term.clear();
      term.writeln('\x1b[1;34m[Disk] Writing project artifact files to disk...\x1b[0m');
    }

    await writeArtifactToDisk();

    if (term) {
      term.writeln(`\x1b[1;32m$ ${cmdToRun}\x1b[0m`);
      term.writeln(`\x1b[90mExecuting inside ${outputDir}...\x1b[0m\n`);
    }

    try {
      const response = await apiFetch('/api/run-command', {
        method: 'POST',
        body: JSON.stringify({
          command: cmdToRun,
          cwd: outputDir
        })
      });

      if (response.status === 403) {
        const errData = await response.json();
        term?.writeln(`\r\n\x1b[1;31m[Blocked by server policy: ${errData.error}]\x1b[0m`);
        addLog(`Command blocked by server policy: ${errData.error}`, 'error');
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const textChunk = decoder.decode(value, { stream: true });
          term?.write(textChunk.replace(/\n/g, '\r\n'));
        }
      }
      addLog(`[Terminal] Command "${cmdToRun}" completed.`, 'success');
    } catch (err: any) {
      term?.writeln(`\r\n\x1b[1;31m[Terminal Error: ${err.message}]\x1b[0m`);
      addLog(`Terminal Error: ${err.message}`, 'error');
    } finally {
      setIsRunning(false);
    }
  };

  const handleAgentAutoFix = async () => {
    if (isRunning) return;
    setIsRunning(true);
    const term = xtermInstance.current;
    if (term) {
      term.clear();
      term.writeln('\x1b[1;35m🤖 Autonomous Coder Agent Mode Triggered!\x1b[0m');
      term.writeln('\x1b[90mLaunching Auto-Debug & Self-Healing loop...\x1b[0m\n');
    }
    
    await autoDebugAndFix(commandInput.trim() || undefined);
    setIsRunning(false);
  };

  const clearTerminal = () => {
    xtermInstance.current?.clear();
  };

  const handleAnswerClarification = async (e: React.FormEvent) => {
    e.preventDefault();
    const answer = clarificationInput.trim();
    if (!answer || !pendingClarification || isRunning) return;
    setClarificationInput('');
    setIsRunning(true);
    await answerClarification(answer);
    setIsRunning(false);
  };

  return (
    <div className="flex flex-col h-full bg-[#0f1117] text-white select-none">
      {/* Terminal Toolbar */}
      <div className="h-8 bg-[#161922] border-b border-[#2a2f42] px-3 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2">
          <TerminalIcon size={14} className="text-cyan-400" />
          <span className="font-semibold text-gray-300">Embedded Terminal</span>
          <span className="text-[10px] text-gray-500 font-mono hidden sm:inline">({outputDir})</span>
        </div>

        <div className="flex items-center space-x-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runProjectCommand();
            }}
            className="flex items-center space-x-1"
          >
            <input
              type="text"
              placeholder="e.g. cargo run, python main.py..."
              value={commandInput}
              onChange={(e) => setCommandInput(e.target.value)}
              className="bg-[#0f1117] border border-[#2a2f42] rounded px-2 py-0.5 font-mono text-[11px] text-cyan-300 w-44 focus:outline-none focus:border-cyan-500"
            />
          </form>

          <button
            onClick={() => runProjectCommand()}
            disabled={isRunning}
            className="flex items-center space-x-1 px-2.5 py-0.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-40 text-black font-bold rounded text-[11px] transition-all shadow"
            title="Write files to disk and run project in terminal"
          >
            {isRunning ? <RefreshCw size={12} className="animate-spin text-black" /> : <Play size={12} className="fill-black" />}
            <span>{isRunning ? 'Running...' : '▶ Run'}</span>
          </button>

          <button
            onClick={handleAgentAutoFix}
            disabled={isRunning}
            className="flex items-center space-x-1 px-2.5 py-0.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-40 text-white font-bold rounded text-[11px] transition-all shadow"
            title="Trigger autonomous self-healing agent to auto-debug & fix build/runtime errors"
          >
            {isRunning ? <RefreshCw size={12} className="animate-spin text-white" /> : <Bot size={12} />}
            <span>🤖 Auto-Fix (Agent)</span>
          </button>

          <button
            onClick={clearTerminal}
            className="p-1 text-gray-400 hover:text-white hover:bg-[#2a2f42] rounded transition-colors"
            title="Clear terminal"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Command approval — the command is not in the recognized allow-list */}
      {pendingConfirmCommand && (
        <div className="px-3 py-2 border-b border-[#2a2f42] bg-[#1a1410]">
          <div className="text-[11px] text-orange-300 font-semibold mb-1 flex items-center gap-1">
            <ShieldAlert size={12} /> Command requires your approval
          </div>
          <div className="text-[11px] text-gray-300 font-mono mb-2 break-all">$ {pendingConfirmCommand}</div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const cmd = pendingConfirmCommand;
                setPendingConfirmCommand(null);
                runProjectCommand(cmd, true);
              }}
              disabled={isRunning}
              className="px-3 py-1 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-400 hover:to-red-500 text-black font-bold rounded text-[11px] transition-all shadow"
            >
              Allow once
            </button>
            <button
              onClick={() => setPendingConfirmCommand(null)}
              className="px-3 py-1 bg-[#161922] border border-[#2a2f42] hover:bg-[#1e2230] text-gray-300 font-semibold rounded text-[11px] transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Clarification prompt — the agent paused because the LLM needs a precision */}
      {pendingClarification && (
        <div className="px-3 py-2 border-b border-[#2a2f42] bg-[#141a26]">
          <div className="text-[11px] text-amber-300 font-semibold mb-1 flex items-center gap-1">
            <Bot size={12} /> ❓ Agent needs a precision (round {pendingClarification.attempt})
          </div>
          <div className="text-[11px] text-gray-300 mb-2">{pendingClarification.question}</div>
          <form onSubmit={handleAnswerClarification} className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Answer the agent to unblock the repair..."
              value={clarificationInput}
              onChange={(e) => setClarificationInput(e.target.value)}
              className="flex-1 bg-[#0f1117] border border-amber-500/40 rounded px-2 py-1 font-mono text-[11px] text-amber-200 focus:outline-none focus:border-amber-400"
            />
            <button
              type="submit"
              disabled={isRunning}
              className="px-3 py-1 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 disabled:opacity-40 text-black font-bold rounded text-[11px] transition-all shadow"
            >
              {isRunning ? 'Repairing...' : 'Send'}
            </button>
          </form>
        </div>
      )}

      {/* Xterm Render Area */}
      <div className="flex-1 p-2 overflow-hidden bg-[#0f1117]">
        <div ref={terminalRef} className="w-full h-full" />
      </div>
    </div>
  );
};
