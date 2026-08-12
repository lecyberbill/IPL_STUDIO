import React, { useState, useRef, useEffect } from 'react';
import { useIdeStore } from '../store/useIdeStore';
import { Send, Bot, User, RefreshCw, FolderCheck } from 'lucide-react';
import { MarkdownViewer } from './MarkdownViewer';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  codeChanged?: boolean;
  timestamp: string;
}

export const ChatPanel: React.FC = () => {
  const { requestLLMCorrection, isGenerating, addLog } = useIdeStore();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: 'Hello! I am your LLM Architect. Ask me general questions or instruct me to add features, refactor code, or fix errors in your project files.',
      timestamp: new Date().toLocaleTimeString()
    }
  ]);
  const [inputPrompt, setInputPrompt] = useState('');
  const chatBottomRef = useRef<HTMLDivElement>(null);

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

    setMessages(prev => [...prev, userMsg]);
    setInputPrompt('');

    addLog(`[LLM Chat] User request: "${userText}"`, 'info');

    try {
      const { textReply, codeChanged } = await requestLLMCorrection(userText);

      const botReply: ChatMessage = {
        id: `reply-${Date.now()}`,
        sender: 'assistant',
        text: textReply,
        codeChanged,
        timestamp: new Date().toLocaleTimeString()
      };
      setMessages(prev => [...prev, botReply]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'assistant',
        text: `Error processing request: ${err.message}`,
        timestamp: new Date().toLocaleTimeString()
      };
      setMessages(prev => [...prev, errorMsg]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
      <form onSubmit={handleSend} className="p-2.5 border-t border-[#2a2f42] bg-[#0f1117] flex flex-col space-y-1.5 shrink-0">
        <div className="flex items-end space-x-2">
          <textarea
            rows={2}
            placeholder="Ask LLM Architect a question or instruct code changes..."
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
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
          <span>Shift+Enter = nouvelle ligne</span>
          <span>Enter = envoyer</span>
        </div>
      </form>
    </div>
  );
};
