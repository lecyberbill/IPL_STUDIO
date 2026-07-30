import React, { useState } from 'react';
import { useIdeStore } from '../store/useIdeStore';
import { Settings, X, Server, Key, ShieldCheck, Plus, Trash2, Code2 } from 'lucide-react';

export const SettingsModal: React.FC = () => {
  const { 
    isSettingsOpen, 
    toggleSettings, 
    llmConfig, 
    setLLMConfig, 
    addLog,
    customTargets,
    addCustomTarget,
    deleteCustomTarget
  } = useIdeStore();

  const [newTargetName, setNewTargetName] = useState('');
  const [newTargetExt, setNewTargetExt] = useState('');
  const [newTargetPrompt, setNewTargetPrompt] = useState('');
  const [isAddingTarget, setIsAddingTarget] = useState(false);

  if (!isSettingsOpen) return null;

  const handleAddTarget = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTargetName.trim() || !newTargetExt.trim()) return;

    addCustomTarget({
      name: newTargetName.trim(),
      extension: newTargetExt.trim().replace(/^\./, ''),
      promptInstructions: newTargetPrompt.trim() || `Génère un projet ${newTargetName} multi-fichiers complet.`
    });

    setNewTargetName('');
    setNewTargetExt('');
    setNewTargetPrompt('');
    setIsAddingTarget(false);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
      <div className="bg-[#161922] border border-[#2a2f42] rounded-xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-[#2a2f42] flex items-center justify-between bg-[#0f1117] shrink-0">
          <div className="flex items-center space-x-2.5">
            <Settings size={18} className="text-cyan-400" />
            <h2 className="font-bold text-white text-sm">Paramètres Moteur & Cibles de Compilation Extensibles</h2>
          </div>
          <button
            onClick={toggleSettings}
            className="p-1 text-gray-400 hover:text-white hover:bg-[#2a2f42] rounded transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-5 text-xs text-gray-300 font-sans flex-1 overflow-y-auto">
          {/* Mode Selector */}
          <div>
            <label className="block text-gray-400 font-semibold mb-2 uppercase text-[10px] tracking-wider">
              Mode de Connexion du Moteur LLM
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setLLMConfig({ mode: 'local' })}
                className={`p-3 rounded-lg border flex flex-col items-start transition-all ${
                  llmConfig.mode === 'local'
                    ? 'bg-cyan-500/10 border-cyan-500 text-cyan-300 shadow-md'
                    : 'bg-[#0f1117] border-[#2a2f42] text-gray-400 hover:border-gray-600'
                }`}
              >
                <div className="flex items-center space-x-2 font-bold mb-1">
                  <Server size={15} />
                  <span>100% Local (Ollama)</span>
                </div>
                <p className="text-[10px] opacity-80">Execution locale hors-ligne sans fuite de code.</p>
              </button>

              <button
                type="button"
                onClick={() => setLLMConfig({ mode: 'external' })}
                className={`p-3 rounded-lg border flex flex-col items-start transition-all ${
                  llmConfig.mode === 'external'
                    ? 'bg-purple-500/10 border-purple-500 text-purple-300 shadow-md'
                    : 'bg-[#0f1117] border-[#2a2f42] text-gray-400 hover:border-gray-600'
                }`}
              >
                <div className="flex items-center space-x-2 font-bold mb-1">
                  <Key size={15} />
                  <span>API Externe (Cloud)</span>
                </div>
                <p className="text-[10px] opacity-80">Utilise des endpoints OpenAI / DeepSeek distants.</p>
              </button>
            </div>
          </div>

          {/* Config Fields for Local / Cloud */}
          {llmConfig.mode === 'local' ? (
            <div className="space-y-3 bg-[#0f1117] p-3.5 rounded-lg border border-[#2a2f42]">
              <div>
                <label className="block font-medium text-gray-300 mb-1">Endpoint Ollama Local</label>
                <input
                  type="text"
                  value={llmConfig.localEndpoint}
                  onChange={(e) => setLLMConfig({ localEndpoint: e.target.value })}
                  className="w-full bg-[#161922] border border-[#2a2f42] rounded px-3 py-1.5 font-mono text-cyan-300 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block font-medium text-gray-300 mb-1">Modèle Ollama (ex: llama3, mistral, codellama)</label>
                <input
                  type="text"
                  value={llmConfig.model}
                  onChange={(e) => setLLMConfig({ model: e.target.value })}
                  className="w-full bg-[#161922] border border-[#2a2f42] rounded px-3 py-1.5 font-mono text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3 bg-[#0f1117] p-3.5 rounded-lg border border-[#2a2f42]">
              <div>
                <label className="block font-medium text-gray-300 mb-1">URL d'API Distante (OpenAI / DeepSeek Compatible)</label>
                <input
                  type="text"
                  value={llmConfig.externalEndpoint}
                  onChange={(e) => setLLMConfig({ externalEndpoint: e.target.value })}
                  className="w-full bg-[#161922] border border-[#2a2f42] rounded px-3 py-1.5 font-mono text-purple-300 focus:outline-none focus:border-purple-500"
                  placeholder="https://api.deepseek.com"
                />
              </div>

              <div>
                <label className="block font-medium text-gray-300 mb-1">Nom de la Variable d'Environnement (Sans Clé en Dur)</label>
                <input
                  type="text"
                  value={llmConfig.apiKeyName}
                  onChange={(e) => setLLMConfig({ apiKeyName: e.target.value, customApiKey: '' })}
                  className="w-full bg-[#161922] border border-[#2a2f42] rounded px-3 py-1.5 font-mono text-amber-300 focus:outline-none focus:border-purple-500"
                  placeholder="VITE_DP_API_KEY"
                />
                <div className="mt-1.5 flex items-start space-x-1.5 text-[10px] text-amber-400/90 leading-relaxed">
                  <ShieldCheck size={14} className="shrink-0 mt-0.5" />
                  <span>Sécurité : Seul le NOM de la variable d'environnement (ex: <code>VITE_DP_API_KEY</code>) est conservé.</span>
                </div>
              </div>
            </div>
          )}

          {/* Section : Cibles de Compilation Extensibles Custom */}
          <div className="pt-2 border-t border-[#2a2f42]">
            <div className="flex items-center justify-between mb-3">
              <label className="block text-cyan-400 font-semibold uppercase text-[10px] tracking-wider flex items-center space-x-1">
                <Code2 size={13} />
                <span>Cibles de Compilation Extensibles ({customTargets.length})</span>
              </label>

              <button
                type="button"
                onClick={() => setIsAddingTarget(!isAddingTarget)}
                className="flex items-center space-x-1 px-2.5 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 rounded text-xs transition-colors"
              >
                <Plus size={13} />
                <span>Nouvelle Cible</span>
              </button>
            </div>

            {/* Form Add Custom Target */}
            {isAddingTarget && (
              <form onSubmit={handleAddTarget} className="bg-[#0f1117] p-3.5 rounded-lg border border-cyan-500/40 space-y-3 mb-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-0.5">Nom de la Cible (ex: Java 21)</label>
                    <input
                      type="text"
                      placeholder="☕ Java 21 Spring Boot"
                      value={newTargetName}
                      onChange={(e) => setNewTargetName(e.target.value)}
                      className="w-full bg-[#161922] border border-[#2a2f42] rounded px-2.5 py-1 font-mono text-white text-xs focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-0.5">Extension Fichier (ex: java)</label>
                    <input
                      type="text"
                      placeholder="java"
                      value={newTargetExt}
                      onChange={(e) => setNewTargetExt(e.target.value)}
                      className="w-full bg-[#161922] border border-[#2a2f42] rounded px-2.5 py-1 font-mono text-cyan-300 text-xs focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-gray-400 mb-0.5">Consignes Prompt LLM pour cette cible :</label>
                  <textarea
                    rows={2}
                    placeholder="Instructions spécifiques envoyées à l'Architecte LLM pour générer ce langage..."
                    value={newTargetPrompt}
                    onChange={(e) => setNewTargetPrompt(e.target.value)}
                    className="w-full bg-[#161922] border border-[#2a2f42] rounded p-2 font-mono text-xs text-gray-200 focus:outline-none focus:border-cyan-500 resize-none"
                  />
                </div>

                <div className="flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingTarget(false)}
                    className="px-3 py-1 bg-[#2a2f42] text-gray-300 rounded text-xs"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded text-xs"
                  >
                    Ajouter la Cible
                  </button>
                </div>
              </form>
            )}

            {/* Custom Targets List */}
            <div className="space-y-2">
              {customTargets.map((target) => (
                <div
                  key={target.id}
                  className="bg-[#0f1117] p-2.5 rounded-lg border border-[#2a2f42] flex items-center justify-between text-xs"
                >
                  <div className="truncate pr-2">
                    <span className="font-bold text-white font-mono">{target.name}</span>
                    <span className="text-[10px] text-cyan-400 font-mono ml-2">(.{target.extension})</span>
                    <p className="text-[10px] text-gray-500 truncate mt-0.5">{target.promptInstructions}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => deleteCustomTarget(target.id)}
                    className="p-1.5 text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                    title="Supprimer la cible custom"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-[#2a2f42] bg-[#0f1117] flex justify-end shrink-0">
          <button
            type="button"
            onClick={() => {
              addLog(`Configuration du moteur LLM mise à jour (${llmConfig.mode.toUpperCase()})`, 'info');
              toggleSettings();
            }}
            className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs transition-all shadow-md"
          >
            Enregistrer les modifications
          </button>
        </div>
      </div>
    </div>
  );
};
