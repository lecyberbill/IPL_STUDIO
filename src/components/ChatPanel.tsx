import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useIdeStore } from '../store/useIdeStore';
import { welcomeChatMessage } from '../store/defaults';
import { parseMultiFileXml, downloadProjectZip } from '../engine/artifactGenerator';
import { extractArtifactMentions, filterMentionCandidates } from '../engine/artifactMentions';
import { parseChatCommand, filterCommands, allCommandMetas, expandCustomCommand } from '../engine/chatCommands';
import type { ChatMessage } from '../store/types';
import { Send, Bot, User, RefreshCw, FolderCheck, FileCode } from 'lucide-react';
import { MarkdownViewer } from './MarkdownViewer';

export type { ChatMessage };

export const ChatPanel: React.FC = () => {
  const { requestLLMCorrection, isGenerating, addLog, projects, activeProjectId, appendChatMessage, generatedCode, customCommands } = useIdeStore();
  const [inputPrompt, setInputPrompt] = useState('');
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStart, setMentionStart] = useState(-1);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [commandIndex, setCommandIndex] = useState(0);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const commandMetas = useMemo(() => allCommandMetas(customCommands), [customCommands]);
  const commandCandidates = useMemo(
    () => (commandOpen ? filterCommands(commandQuery, commandMetas) : []),
    [commandOpen, commandQuery, commandMetas]
  );

  // Artifact files available for `@` mentions.
  const artifactPaths = useMemo(() => parseMultiFileXml(generatedCode || '').map(f => f.relativePath), [generatedCode]);
  const candidates = useMemo(
    () => (mentionOpen ? filterMentionCandidates(mentionQuery, artifactPaths) : []),
    [mentionOpen, mentionQuery, artifactPaths]
  );

  /** Opens/updates the `@` autocomplete based on the text before the cursor. */
  const updateMention = (value: string, cursor: number) => {
    const before = value.slice(0, cursor);
    const at = before.lastIndexOf('@');
    if (at === -1) { setMentionOpen(false); return; }
    const frag = before.slice(at + 1);
    if (!/^[\w./-]*$/.test(frag)) { setMentionOpen(false); return; }
    setMentionStart(at);
    setMentionQuery(frag);
    setMentionIndex(0);
    setMentionOpen(true);
  };

  const applyMention = (path: string) => {
    const before = inputPrompt.slice(0, mentionStart);
    const after = inputPrompt.slice(mentionStart + 1 + mentionQuery.length);
    setInputPrompt(`${before}@${path} ${after}`);
    setMentionOpen(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  /** Opens/closes the `/command` autocomplete (commands must lead the message). */
  const updateCommand = (value: string) => {
    const m = value.match(/^\/([a-z-]*)$/i);
    if (!m) { setCommandOpen(false); return; }
    setCommandQuery(m[1].toLowerCase());
    setCommandIndex(0);
    setCommandOpen(true);
  };
  const applyCommand = (id: string) => {
    setInputPrompt(`/${id} `);
    setCommandOpen(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  /** Runs a built-in action command (the store, via getState). */
  const runActionCommand = async (id: string, args: string): Promise<string> => {
    const s = useIdeStore.getState();
    switch (id) {
      case 'help':
        return 'Available commands:\n' + commandMetas.map(c => `- \`${c.usage}\` — ${c.description}`).join('\n');
      case 'verify':
        s.verifyCurrentArtifact();
        return `Verification: ${useIdeStore.getState().verificationResult?.summary ?? '(no result)'}`;
      case 'generate':
        await s.runGeneration();
        return 'Generation finished — see the Artifact tab.';
      case 'save':
        await s.writeArtifactToDisk();
        return 'Artifact saved to the project output folder.';
      case 'export': {
        const p = s.projects.find(x => x.id === s.activeProjectId);
        await downloadProjectZip(p?.name || 'ipl_project', s.targetLang, s.generatedCode, s.code);
        return 'Artifact exported as .zip.';
      }
      case 'new':
        s.createProject(args || 'New Project');
        return `Created project "${args || 'New Project'}".`;
      case 'clear':
        s.clearChat();
        return 'Chat cleared.';
      default:
        return `Unknown command: /${id}. Type /help.`;
    }
  };

  // Per-project, persisted chat history (survives switches + reloads).
  const activeProj = projects.find(p => p.id === activeProjectId);
  const messages: ChatMessage[] = useMemo(
    () => (activeProj?.chatMessages && activeProj.chatMessages.length > 0 ? activeProj.chatMessages : [welcomeChatMessage()]),
    [activeProj?.chatMessages]
  );

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPrompt.trim() || isGenerating) return;

    const userText = inputPrompt.trim();
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text: userText,
      timestamp: new Date().toLocaleTimeString()
    };

    appendChatMessage(userMsg);
    setInputPrompt('');

    addLog(`[LLM Chat] User request: "${userText}"`, 'info');

    // Micro-command? `/command` runs an action or expands a custom macro.
    const cmd = parseChatCommand(userText);
    if (cmd) {
      const meta = commandMetas.find(m => m.id === cmd.id);
      const reply = async (): Promise<{ text: string; codeChanged?: boolean }> => {
        if (meta?.kind === 'prompt') {
          const custom = customCommands.find(c => c.id === cmd.id);
          const effective = expandCustomCommand(custom?.instruction || '', cmd.args);
          const history = messages.map(m => ({ role: m.sender, content: m.text }));
          const focus = extractArtifactMentions(effective, artifactPaths);
          const { textReply, codeChanged } = await requestLLMCorrection(effective, history, focus);
          return { text: textReply, codeChanged };
        }
        return { text: await runActionCommand(cmd.id, cmd.args) };
      };
      let res: { text: string; codeChanged?: boolean } = { text: '' };
      try { res = await reply(); } catch (e: any) { res = { text: `Command failed: ${e.message}` }; }
      appendChatMessage({ id: `reply-${Date.now()}`, sender: 'assistant', text: res.text, codeChanged: res.codeChanged, timestamp: new Date().toLocaleTimeString() });
      return;
    }

    try {
      // Pass the prior turns so a short reply like "oui" has its context (the
      // assistant's previous question/plan) — the chat is multi-turn, not stateless.
      const history = messages.map(m => ({ role: m.sender, content: m.text }));
      // Resolve `@file` mentions → explicit focus files for the model.
      const focusFiles = extractArtifactMentions(userText, artifactPaths);
      const { textReply, codeChanged } = await requestLLMCorrection(userText, history, focusFiles);

      const botReply: ChatMessage = {
        id: `reply-${Date.now()}`,
        sender: 'assistant',
        text: textReply,
        codeChanged,
        timestamp: new Date().toLocaleTimeString()
      };
      appendChatMessage(botReply);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'assistant',
        text: `Error processing request: ${err.message}`,
        timestamp: new Date().toLocaleTimeString()
      };
      appendChatMessage(errorMsg);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // `/command` autocomplete owns the arrows / Enter / Escape while open.
    if (commandOpen && commandCandidates.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setCommandIndex(i => Math.min(i + 1, commandCandidates.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setCommandIndex(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); applyCommand(commandCandidates[commandIndex].id); return; }
      if (e.key === 'Escape') { e.preventDefault(); setCommandOpen(false); return; }
    }
    // `@` autocomplete owns the arrows / Enter / Escape while open.
    if (mentionOpen && candidates.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => Math.min(i + 1, candidates.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); applyMention(candidates[mentionIndex]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setMentionOpen(false); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (inputPrompt.trim() && !isGenerating) {
        handleSend(e as unknown as React.FormEvent);
      }
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#12141c] text-gray-200 select-none">
      {/* Header */}
      <div className="px-3 py-2 bg-[#161922] border-b border-[#2a2f42] flex items-center justify-between text-xs shrink-0">
        <div className="flex items-center space-x-2 font-semibold text-cyan-400">
          <Bot size={16} />
          <span>LLM Architect Assistant</span>
        </div>
        <span className="text-[10px] bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded border border-cyan-500/30 font-mono">
          Refactoring & Q&A Active
        </span>
      </div>

      {/* Messages Thread */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 font-sans text-xs select-text">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start space-x-2 ${
              msg.sender === 'user' ? 'flex-row-reverse space-x-reverse' : ''
            }`}
          >
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 shadow-md select-none ${
                msg.sender === 'user'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gradient-to-tr from-cyan-500 to-blue-600 text-black font-bold'
              }`}
            >
              {msg.sender === 'user' ? <User size={14} /> : <Bot size={14} />}
            </div>

            <div
              className={`max-w-[85%] rounded-xl p-3 text-xs leading-relaxed shadow-sm ${
                msg.sender === 'user'
                  ? 'bg-purple-600/20 border border-purple-500/40 text-purple-100 rounded-tr-none'
                  : 'bg-[#161922] border border-[#2a2f42] text-gray-200 rounded-tl-none'
              }`}
            >
              <div className="flex items-center justify-between mb-1 opacity-70 text-[10px] select-none">
                <span className="font-semibold">{msg.sender === 'user' ? 'You' : 'LLM Architect'}</span>
                <span>{msg.timestamp}</span>
              </div>
              <MarkdownViewer content={msg.text} />

              {msg.codeChanged && (
                <div className="mt-2 pt-2 border-t border-[#2a2f42] flex items-center space-x-1.5 text-[11px] text-emerald-400 font-mono font-semibold select-none">
                  <FolderCheck size={14} />
                  <span>Project files updated in Project Files tab!</span>
                </div>
              )}
            </div>
          </div>
        ))}

        {isGenerating && (
          <div className="flex items-start space-x-2 select-none">
            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 text-black font-bold flex items-center justify-center shrink-0 shadow-md">
              <Bot size={14} />
            </div>
            <div className="max-w-[85%] rounded-xl p-3 bg-[#161922] border border-[#2a2f42] text-xs space-y-2">
              <div className="flex items-center space-x-2 text-cyan-400">
                <RefreshCw size={13} className="animate-spin" />
                <span>LLM Architect is thinking...</span>
              </div>
              <div className="space-y-1.5">
                <div className="h-2.5 w-3/4 rounded bg-[#1e2230] animate-pulse" />
                <div className="h-2.5 w-1/2 rounded bg-[#1e2230] animate-pulse" />
              </div>
            </div>
          </div>
        )}

        <div ref={chatBottomRef} />
      </div>

      {/* Input Footer Form */}
      <form onSubmit={handleSend} className="p-2.5 border-t border-[#2a2f42] bg-[#0f1117] flex flex-col space-y-1.5 shrink-0 relative">
        {/* `/command` autocomplete */}
        {commandOpen && commandCandidates.length > 0 && (
          <div className="absolute bottom-[100%] left-2.5 mb-1 w-80 max-h-56 overflow-y-auto bg-[#161922] border border-cyan-500/40 rounded-lg shadow-2xl z-30">
            <div className="px-2 py-1 text-[9px] text-gray-500 font-mono border-b border-[#2a2f42]">Commands</div>
            {commandCandidates.map((c, i) => (
              <button
                type="button"
                key={c.id}
                onMouseDown={(e) => { e.preventDefault(); applyCommand(c.id); }}
                className={`w-full text-left px-2 py-1.5 text-[11px] flex flex-col transition-colors ${
                  i === commandIndex ? 'bg-cyan-500/20' : 'hover:bg-[#2a2f42]'
                }`}
              >
                <span className="font-mono text-cyan-300">{c.usage}{c.kind === 'prompt' ? ' · custom' : ''}</span>
                <span className="text-[10px] text-gray-400 truncate">{c.description}</span>
              </button>
            ))}
          </div>
        )}

        {/* `@file` autocomplete */}
        {mentionOpen && candidates.length > 0 && (
          <div className="absolute bottom-[100%] left-2.5 mb-1 w-72 max-h-48 overflow-y-auto bg-[#161922] border border-cyan-500/40 rounded-lg shadow-2xl z-30">
            <div className="px-2 py-1 text-[9px] text-gray-500 font-mono border-b border-[#2a2f42]">Reference an artifact file</div>
            {candidates.map((c, i) => (
              <button
                type="button"
                key={c}
                onMouseDown={(e) => { e.preventDefault(); applyMention(c); }}
                className={`w-full text-left px-2 py-1.5 text-[11px] font-mono flex items-center space-x-1.5 transition-colors ${
                  i === mentionIndex ? 'bg-cyan-500/20 text-cyan-300' : 'text-gray-300 hover:bg-[#2a2f42]'
                }`}
              >
                <FileCode size={12} className="shrink-0 opacity-70" />
                <span className="truncate">@{c}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end space-x-2">
          <textarea
            ref={textareaRef}
            rows={2}
            placeholder="Ask LLM Architect... (type @ to reference an artifact file)"
            value={inputPrompt}
            onChange={(e) => { setInputPrompt(e.target.value); updateCommand(e.target.value); updateMention(e.target.value, e.target.selectionStart ?? e.target.value.length); }}
            onKeyDown={handleKeyDown}
            disabled={isGenerating}
            className="flex-1 bg-[#161922] border border-[#2a2f42] rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 disabled:opacity-50 font-sans resize-none min-h-[42px] max-h-[140px] scrollbar-thin select-text"
          />

          <button
            type="submit"
            disabled={!inputPrompt.trim() || isGenerating}
            className="px-3.5 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-40 text-black font-bold rounded-lg text-xs transition-all shadow flex items-center space-x-1 shrink-0 select-none h-[42px]"
          >
            <Send size={13} />
            <span>Send</span>
          </button>
        </div>
        <div className="flex items-center justify-between text-[9px] text-gray-500 font-mono px-1">
          <span>@ = référencer un fichier · Shift+Enter = nouvelle ligne</span>
          <span>Enter = envoyer</span>
        </div>
      </form>
    </div>
  );
};
