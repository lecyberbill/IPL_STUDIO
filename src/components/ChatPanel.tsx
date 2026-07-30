import React, { useState, useRef, useEffect } from 'react';
import { useIdeStore } from '../store/useIdeStore';
import { Bot, User, Send, Sparkles, RefreshCw } from 'lucide-react';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  time: string;
}

export const ChatPanel: React.FC = () => {
  const { requestLLMCorrection, isCompiling } = useIdeStore();
  const [inputMsg, setInputMsg] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init-1',
      sender: 'assistant',
      text: 'Bonjour ! Je suis votre Architecte LLM IPL v1.0. Demandez-moi n\'importe quelle modification, correction d\'erreur, refactorisation ou ajout de fonctionnalité sur les fichiers de votre projet.',
      time: new Date().toLocaleTimeString()
    }
  ]);

  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isCompiling]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMsg.trim() || isCompiling) return;

    const userText = inputMsg.trim();
    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: userText,
      time: new Date().toLocaleTimeString()
    };

    setMessages(prev => [...prev, userMsg]);
    setInputMsg('');

    // Ajouter une bulle de réflexion
    const assistantMsgId = `ast-${Date.now()}`;
    setMessages(prev => [
      ...prev,
      {
        id: assistantMsgId,
        sender: 'assistant',
        text: '🧠 Réflexion et modification des fichiers du projet en cours...',
        time: new Date().toLocaleTimeString()
      }
    ]);

    await requestLLMCorrection(userText);

    // Mettre à jour la bulle de l'assistant une fois terminé
    setMessages(prev =>
      prev.map(m =>
        m.id === assistantMsgId
          ? {
              ...m,
              text: `✅ Corrections et modifications appliquées avec succès sur l'ensemble des fichiers du projet ! Le projet mis à jour a été matérialisé sur le disque.`
            }
          : m
      )
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#12141c] text-white select-none">
      {/* Header Info */}
      <div className="bg-[#0f1117] px-3 py-2 border-b border-[#2a2f42] flex items-center justify-between text-xs shrink-0">
        <div className="flex items-center space-x-2">
          <Bot size={15} className="text-purple-400" />
          <span className="font-semibold text-gray-200">Chat Architecte & Correcteur LLM</span>
        </div>
        <span className="text-[10px] text-gray-500 font-mono">Modèle Actif</span>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 p-3 overflow-y-auto space-y-3 font-sans text-xs select-text">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start space-x-2 ${
              msg.sender === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            {msg.sender === 'assistant' && (
              <div className="w-6 h-6 rounded-full bg-purple-600/30 border border-purple-500/40 flex items-center justify-center shrink-0 mt-0.5">
                <Bot size={13} className="text-purple-300" />
              </div>
            )}

            <div
              className={`max-w-[85%] rounded-xl p-3 text-xs leading-relaxed shadow ${
                msg.sender === 'user'
                  ? 'bg-cyan-600 text-white rounded-tr-none'
                  : 'bg-[#161922] border border-[#2a2f42] text-gray-200 rounded-tl-none'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.text}</div>
              <div className="text-[9px] text-gray-400 mt-1 text-right font-mono">{msg.time}</div>
            </div>

            {msg.sender === 'user' && (
              <div className="w-6 h-6 rounded-full bg-cyan-600/30 border border-cyan-500/40 flex items-center justify-center shrink-0 mt-0.5">
                <User size={13} className="text-cyan-300" />
              </div>
            )}
          </div>
        ))}
        {isCompiling && (
          <div className="flex items-center space-x-2 text-purple-400 text-xs italic bg-purple-500/10 p-2 rounded-lg border border-purple-500/20">
            <Sparkles size={14} className="animate-spin text-purple-400 shrink-0" />
            <span>L'Architecte réécrit et matérialise les fichiers...</span>
          </div>
        )}
        <div ref={chatBottomRef} />
      </div>

      {/* Input Chat Bar */}
      <div className="p-2.5 bg-[#0f1117] border-t border-[#2a2f42] shrink-0">
        <form onSubmit={handleSend} className="flex items-center space-x-2">
          <input
            type="text"
            placeholder="Posez une question ou demandez une modification au LLM..."
            value={inputMsg}
            onChange={(e) => setInputMsg(e.target.value)}
            disabled={isCompiling}
            className="flex-1 bg-[#161922] border border-[#2a2f42] rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
          />
          <button
            type="submit"
            disabled={!inputMsg.trim() || isCompiling}
            className="p-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 text-white rounded-lg transition-all shadow"
            title="Envoyer la consigne"
          >
            {isCompiling ? <RefreshCw size={14} className="animate-spin text-white" /> : <Send size={14} />}
          </button>
        </form>
      </div>
    </div>
  );
};
