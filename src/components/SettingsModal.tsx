import React, { useState } from 'react';
import { useIdeStore } from '../store/useIdeStore';
import { Settings, X, Server, Key, ShieldCheck, Plus, Trash2, Code2, Cpu, RefreshCw } from 'lucide-react';

interface ProviderPreset {
  id: string;
  name: string;
  endpoint: string;
  apiKeyName: string;
  models: string[];
}

const CLOUD_PROVIDERS: ProviderPreset[] = [
  {
    id: 'google-gemini',
    name: '✨ Google Gemini API',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKeyName: 'GEMINI_API_KEY',
    models: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro']
  },
  {
    id: 'deepseek',
    name: '🐳 DeepSeek Cloud',
    endpoint: 'https://api.deepseek.com',
    apiKeyName: 'DEEPSEEK_API_KEY',
    models: ['deepseek-chat', 'deepseek-reasoner']
  },
  {
    id: 'openai',
    name: '⚡ OpenAI Cloud',
    endpoint: 'https://api.openai.com',
    apiKeyName: 'OPENAI_API_KEY',
    models: ['gpt-4o', 'gpt-4o-mini', 'o1-preview', 'o3-mini']
  },
  {
    id: 'openrouter',
    name: '🌐 OpenRouter (Multi-Models)',
    endpoint: 'https://openrouter.ai/api/v1',
    apiKeyName: 'OPENROUTER_API_KEY',
    models: [
      'google/gemini-2.0-flash-lite-001',
      'deepseek/deepseek-chat',
      'anthropic/claude-3.5-sonnet',
      'meta-llama/llama-3.3-70b-instruct'
    ]
  },
  {
    id: 'groq',
    name: '🚀 Groq Cloud (Ultra-Fast)',
    endpoint: 'https://api.groq.com/openai',
    apiKeyName: 'GROQ_API_KEY',
    models: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768', 'gemma2-9b-it']
  },
  {
    id: 'mistral',
    name: '🇫🇷 Mistral AI',
    endpoint: 'https://api.mistral.ai',
    apiKeyName: 'MISTRAL_API_KEY',
    models: ['mistral-large-latest', 'mistral-small-latest', 'codestral-latest']
  },
  {
    id: 'custom',
    name: '⚙️ Mode Manuel / Endpoint Personnalisé',
    endpoint: '',
    apiKeyName: '',
    models: []
  }
];

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

  const [selectedProviderId, setSelectedProviderId] = useState<string>(() => {
    const matched = CLOUD_PROVIDERS.find(p => p.endpoint && llmConfig.externalEndpoint?.includes(p.endpoint.replace('https://', '')));
    return matched ? matched.id : 'custom';
  });

  const [liveFetchedModels, setLiveFetchedModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);

  if (!isSettingsOpen) return null;

  const currentProvider = CLOUD_PROVIDERS.find(p => p.id === selectedProviderId) || CLOUD_PROVIDERS[CLOUD_PROVIDERS.length - 1];

  const handleSelectProvider = (providerId: string) => {
    setSelectedProviderId(providerId);
    const provider = CLOUD_PROVIDERS.find(p => p.id === providerId);
    if (provider && provider.id !== 'custom') {
      setLLMConfig({
        externalEndpoint: provider.endpoint,
        apiKeyName: provider.apiKeyName,
        model: provider.models[0] || llmConfig.model
      });
    }
  };

  const handleFetchLiveModels = async () => {
    const apiKey = llmConfig.customApiKey || (import.meta.env[llmConfig.apiKeyName] as string);
    const endpoint = llmConfig.externalEndpoint;
    if (!endpoint) return;

    setIsFetchingModels(true);
    try {
      const baseUrl = endpoint.replace(/\/+$/, '').replace(/\/v1$/, '').replace(/\/v1\/chat\/completions$/, '');
      const response = await fetch(`${baseUrl}/v1/models`, {
        headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}
      });
      if (response.ok) {
        const data = await response.json();
        const modelList = (data.data || data.models || []).map((m: any) => m.id || m.name).filter(Boolean);
        if (modelList.length > 0) {
          setLiveFetchedModels(modelList);
          addLog(`Récupéré ${modelList.length} modèle(s) en direct depuis ${baseUrl} !`, 'success');
        } else {
          addLog(`Aucun modèle renvoyé par l'endpoint ${baseUrl}.`, 'warn');
        }
      } else {
        addLog(`Erreur ${response.status} lors de la récupération des modèles depuis ${baseUrl}`, 'warn');
      }
    } catch (err: any) {
      addLog(`Impossible de contacter ${endpoint}: ${err.message}`, 'error');
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleAddTarget = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTargetName.trim() || !newTargetExt.trim()) return;

    addCustomTarget({
      name: newTargetName.trim(),
      extension: newTargetExt.trim().replace(/^\./, ''),
      promptInstructions: newTargetPrompt.trim() || `Generate a complete multi-file ${newTargetName} project.`
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
            <h2 className="font-bold text-white text-sm">LLM Engine Connection & Extensible Targets</h2>
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
              LLM Engine Connection Mode
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setLLMConfig({ mode: 'local' })}
                className={`p-2.5 rounded-lg border flex flex-col items-start transition-all ${
                  llmConfig.mode === 'local'
                    ? 'bg-cyan-500/10 border-cyan-500 text-cyan-300 shadow-md'
                    : 'bg-[#0f1117] border-[#2a2f42] text-gray-400 hover:border-gray-600'
                }`}
              >
                <div className="flex items-center space-x-1.5 font-bold mb-1">
                  <Server size={14} />
                  <span>Ollama Local</span>
                </div>
                <p className="text-[10px] opacity-80 leading-tight">Port 11434 (Native Ollama API)</p>
              </button>

              <button
                type="button"
                onClick={() => setLLMConfig({ mode: 'lmstudio' })}
                className={`p-2.5 rounded-lg border flex flex-col items-start transition-all ${
                  llmConfig.mode === 'lmstudio'
                    ? 'bg-emerald-500/10 border-emerald-500 text-emerald-300 shadow-md'
                    : 'bg-[#0f1117] border-[#2a2f42] text-gray-400 hover:border-gray-600'
                }`}
              >
                <div className="flex items-center space-x-1.5 font-bold mb-1">
                  <Cpu size={14} />
                  <span>LM Studio</span>
                </div>
                <p className="text-[10px] opacity-80 leading-tight">Port 1234 (Local OpenAI Server)</p>
              </button>

              <button
                type="button"
                onClick={() => setLLMConfig({ mode: 'external' })}
                className={`p-2.5 rounded-lg border flex flex-col items-start transition-all ${
                  llmConfig.mode === 'external'
                    ? 'bg-purple-500/10 border-purple-500 text-purple-300 shadow-md'
                    : 'bg-[#0f1117] border-[#2a2f42] text-gray-400 hover:border-gray-600'
                }`}
              >
                <div className="flex items-center space-x-1.5 font-bold mb-1">
                  <Key size={14} />
                  <span>Cloud API</span>
                </div>
                <p className="text-[10px] opacity-80 leading-tight">DeepSeek / OpenAI / Remote</p>
              </button>
            </div>
          </div>

          {/* Config Fields according to selected mode */}
          {llmConfig.mode === 'local' && (
            <div className="space-y-3 bg-[#0f1117] p-3.5 rounded-lg border border-[#2a2f42]">
              <div>
                <label className="block font-medium text-gray-300 mb-1">Local Ollama Endpoint</label>
                <input
                  type="text"
                  value={llmConfig.localEndpoint}
                  onChange={(e) => setLLMConfig({ localEndpoint: e.target.value })}
                  className="w-full bg-[#161922] border border-[#2a2f42] rounded px-3 py-1.5 font-mono text-cyan-300 focus:outline-none focus:border-cyan-500"
                  placeholder="http://localhost:11434"
                />
              </div>

              <div>
                <label className="block font-medium text-gray-300 mb-1">Ollama Model Name (e.g. llama3, mistral, qwen2.5-coder)</label>
                <input
                  type="text"
                  value={llmConfig.model}
                  onChange={(e) => setLLMConfig({ model: e.target.value })}
                  className="w-full bg-[#161922] border border-[#2a2f42] rounded px-3 py-1.5 font-mono text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          )}

          {llmConfig.mode === 'lmstudio' && (
            <div className="space-y-3 bg-[#0f1117] p-3.5 rounded-lg border border-emerald-500/30">
              <div>
                <label className="block font-medium text-gray-300 mb-1">LM Studio Local Server Endpoint</label>
                <input
                  type="text"
                  value={llmConfig.lmStudioEndpoint || 'http://localhost:1234'}
                  onChange={(e) => setLLMConfig({ lmStudioEndpoint: e.target.value })}
                  className="w-full bg-[#161922] border border-[#2a2f42] rounded px-3 py-1.5 font-mono text-emerald-300 focus:outline-none focus:border-emerald-500"
                  placeholder="http://localhost:1234"
                />
              </div>

              <div>
                <label className="block font-medium text-gray-300 mb-1">Loaded Model Identifier (or leave "local-model")</label>
                <input
                  type="text"
                  value={llmConfig.model}
                  onChange={(e) => setLLMConfig({ model: e.target.value })}
                  className="w-full bg-[#161922] border border-[#2a2f42] rounded px-3 py-1.5 font-mono text-white focus:outline-none focus:border-emerald-500"
                  placeholder="local-model"
                />
              </div>

              <div className="mt-1 flex items-start space-x-1.5 text-[10px] text-emerald-400/90 leading-relaxed">
                <Cpu size={14} className="shrink-0 mt-0.5" />
                <span>Zero configuration API Key needed. Make sure "Local Server" is started in LM Studio.</span>
              </div>
            </div>
          )}

          {llmConfig.mode === 'external' && (
            <div className="space-y-3.5 bg-[#0f1117] p-4 rounded-lg border border-purple-500/30">
              {/* 1. Choix du Fournisseur Cloud (Prédéterminé ou Manuel) */}
              <div>
                <label className="block font-medium text-purple-300 mb-1">
                  Fournisseur Cloud API (Adresse pré-configurée)
                </label>
                <select
                  value={selectedProviderId}
                  onChange={(e) => handleSelectProvider(e.target.value)}
                  className="w-full bg-[#161922] border border-[#2a2f42] rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500 cursor-pointer font-mono"
                >
                  {CLOUD_PROVIDERS.map((provider) => (
                    <option key={provider.id} value={provider.id} className="bg-[#161922] text-white">
                      {provider.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Endpoint Remote URL (Rempli automatiquement ou Manuel) */}
              <div>
                <label className="block font-medium text-gray-300 mb-1">
                  Remote API Endpoint (URL Serveur)
                </label>
                <input
                  type="text"
                  value={llmConfig.externalEndpoint}
                  onChange={(e) => {
                    setLLMConfig({ externalEndpoint: e.target.value });
                    if (selectedProviderId !== 'custom') setSelectedProviderId('custom');
                  }}
                  className="w-full bg-[#161922] border border-[#2a2f42] rounded px-3 py-1.5 font-mono text-purple-300 focus:outline-none focus:border-purple-500 text-xs"
                  placeholder="https://generativelanguage.googleapis.com/v1beta/openai"
                />
              </div>

              {/* 3. Choix du Modèle (Dropdown + Option Manuelle + Récupération en direct) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-medium text-gray-300">Modèle Cible</label>
                  <button
                    type="button"
                    onClick={handleFetchLiveModels}
                    disabled={isFetchingModels}
                    className="flex items-center space-x-1 text-[10px] text-cyan-400 hover:text-cyan-300 disabled:opacity-50 transition-colors"
                    title="Interroger l'endpoint /v1/models pour charger la liste disponible"
                  >
                    <RefreshCw size={11} className={isFetchingModels ? 'animate-spin' : ''} />
                    <span>{isFetchingModels ? 'Chargement...' : 'Récupérer modèles en direct'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {/* Select prédéfini / récupéré */}
                  <select
                    value={llmConfig.model}
                    onChange={(e) => setLLMConfig({ model: e.target.value })}
                    className="bg-[#161922] border border-[#2a2f42] rounded px-3 py-1.5 font-mono text-xs text-white focus:outline-none focus:border-purple-500 cursor-pointer"
                  >
                    <optgroup label="📋 Modèles Recommandés" className="bg-[#161922] text-gray-400 font-bold">
                      {(currentProvider.models.length > 0 ? currentProvider.models : [llmConfig.model]).map((m) => (
                        <option key={m} value={m} className="bg-[#161922] text-white">
                          {m}
                        </option>
                      ))}
                    </optgroup>

                    {liveFetchedModels.length > 0 && (
                      <optgroup label="🌐 Modèles Découverts en Direct" className="bg-[#161922] text-cyan-400 font-bold">
                        {liveFetchedModels.map((lm) => (
                          <option key={lm} value={lm} className="bg-[#161922] text-white">
                            {lm}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>

                  {/* Champ d'entrée manuel libre */}
                  <input
                    type="text"
                    value={llmConfig.model}
                    onChange={(e) => setLLMConfig({ model: e.target.value })}
                    className="bg-[#161922] border border-[#2a2f42] rounded px-3 py-1.5 font-mono text-xs text-white focus:outline-none focus:border-purple-500"
                    placeholder="Saisissez un modèle personnalisé..."
                  />
                </div>
              </div>

              {/* 4. Clé d'API Directe */}
              <div>
                <label className="block font-medium text-gray-300 mb-1">
                  Clé d'API Directe (Optionnel — Collez directement votre clé ici)
                </label>
                <input
                  type="password"
                  value={llmConfig.customApiKey || ''}
                  onChange={(e) => setLLMConfig({ customApiKey: e.target.value })}
                  className="w-full bg-[#161922] border border-[#2a2f42] rounded px-3 py-1.5 font-mono text-cyan-300 focus:outline-none focus:border-purple-500 text-xs"
                  placeholder="AIzaSy... ou sk-..."
                />
              </div>

              {/* 5. Variable d'Environnement */}
              <div>
                <label className="block font-medium text-gray-300 mb-1">
                  Nom de Variable d'Environnement (ex: GEMINI_API_KEY)
                </label>
                <input
                  type="text"
                  value={llmConfig.apiKeyName}
                  onChange={(e) => setLLMConfig({ apiKeyName: e.target.value })}
                  className="w-full bg-[#161922] border border-[#2a2f42] rounded px-3 py-1.5 font-mono text-amber-300 focus:outline-none focus:border-purple-500 text-xs"
                  placeholder="GEMINI_API_KEY"
                />
                <div className="mt-1.5 flex items-start space-x-1.5 text-[10px] text-amber-400/90 leading-relaxed">
                  <ShieldCheck size={14} className="shrink-0 mt-0.5" />
                  <span>Saisissez votre clé directement ci-dessus OU définissez votre variable dans votre fichier <code>.env</code>.</span>
                </div>
              </div>
            </div>
          )}

          {/* Section: Custom Extensible Generation Targets */}
          <div className="pt-2 border-t border-[#2a2f42]">
            <div className="flex items-center justify-between mb-3">
              <label className="block text-cyan-400 font-semibold uppercase text-[10px] tracking-wider flex items-center space-x-1">
                <Code2 size={13} />
                <span>Custom Extensible Targets ({customTargets.length})</span>
              </label>

              <button
                type="button"
                onClick={() => setIsAddingTarget(!isAddingTarget)}
                className="flex items-center space-x-1 px-2.5 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 rounded text-xs transition-colors"
              >
                <Plus size={13} />
                <span>New Target</span>
              </button>
            </div>

            {/* Form Add Custom Target */}
            {isAddingTarget && (
              <form onSubmit={handleAddTarget} className="bg-[#0f1117] p-3.5 rounded-lg border border-cyan-500/40 space-y-3 mb-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-0.5">Target Name (e.g. Java 21)</label>
                    <input
                      type="text"
                      placeholder="☕ Java 21 Spring Boot"
                      value={newTargetName}
                      onChange={(e) => setNewTargetName(e.target.value)}
                      className="w-full bg-[#161922] border border-[#2a2f42] rounded px-2.5 py-1 font-mono text-white text-xs focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-0.5">Extension (e.g. java)</label>
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
                  <label className="block text-[10px] text-gray-400 mb-0.5">Custom LLM Prompt Instructions for this target:</label>
                  <textarea
                    rows={2}
                    placeholder="Specific instructions sent to LLM Architect for generating this target language..."
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
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded text-xs"
                  >
                    Add Target
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
                    title="Delete custom target"
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
              addLog(`LLM Engine settings updated (${llmConfig.mode.toUpperCase()})`, 'info');
              toggleSettings();
            }}
            className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs transition-all shadow-md"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};
