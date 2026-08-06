import React, { useState } from 'react';
import { useIdeStore } from '../store/useIdeStore';
import { X, Plus, Trash2, Layers, Cpu, Sparkles, Check } from 'lucide-react';
import type { PolyglotLayer } from '../store/useIdeStore';

const PRESET_ROLES = [
  'Backend API',
  'Frontend UI',
  'Base de données / Stockage',
  'Service Worker / Tâche Fond',
  'Outil CLI / Executable',
  'DevOps / Conteneur'
];

const PRESET_TECHS = [
  'Python 3 (FastAPI / Flask)',
  'Node.js (Express / Fastify)',
  'HTML5 / JavaScript (Vanilla / Tailwind)',
  'React (Vite)',
  'Go (Gin / net/http)',
  'Rust (Axum / Tokio)',
  'C++ 20',
  'SQLite / PostgreSQL',
  'Docker & Docker Compose'
];

export const PolyglotModal: React.FC = () => {
  const { 
    isPolyglotModalOpen, 
    togglePolyglotModal, 
    polyglotConfig, 
    setPolyglotConfig 
  } = useIdeStore();

  const [autoDecide, setAutoDecide] = useState(polyglotConfig.autoDecide);
  const [layers, setLayers] = useState<PolyglotLayer[]>(polyglotConfig.layers);

  if (!isPolyglotModalOpen) return null;

  const handleAddLayer = () => {
    const newLayer: PolyglotLayer = {
      id: `layer-${Date.now()}`,
      role: 'Backend API',
      tech: 'Python 3 (FastAPI / Flask)'
    };
    setLayers(prev => [...prev, newLayer]);
  };

  const handleRemoveLayer = (id: string) => {
    if (layers.length <= 1) return;
    setLayers(prev => prev.filter(l => l.id !== id));
  };

  const handleUpdateLayer = (id: string, field: 'role' | 'tech', value: string) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
  };

  const handleSave = () => {
    setPolyglotConfig({
      autoDecide,
      layers
    });
    togglePolyglotModal();
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#161922] border border-[#2a2f42] rounded-xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-[#0f1117] border-b border-[#2a2f42] flex items-center justify-between">
          <div className="flex items-center space-x-2 text-cyan-400 font-bold text-sm">
            <Layers size={18} />
            <span>🌐 Configuration Polyglotte Multi-Stacks</span>
          </div>
          <button
            onClick={togglePolyglotModal}
            className="text-gray-400 hover:text-white p-1 rounded-md transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs text-gray-300 flex-1">
          {/* Auto Mode Switch */}
          <div className="bg-[#0f1117] p-4 rounded-lg border border-[#2a2f42] flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center space-x-2 font-semibold text-white">
                <Sparkles size={15} className="text-yellow-400" />
                <span>Décision Automatique par le Modèle LLM</span>
              </div>
              <p className="text-[11px] text-gray-400">
                Laisse l'Architecte LLM analyser votre spécification IPL et choisir la stack optimale.
              </p>
            </div>

            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={autoDecide}
                onChange={(e) => setAutoDecide(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
            </label>
          </div>

          {/* Manual Stack Layers Pairing */}
          {!autoDecide && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5 font-semibold text-cyan-300">
                  <Cpu size={14} />
                  <span>Couples de Composants Cibles (Rôle ➔ Technologie)</span>
                </div>
                <button
                  type="button"
                  onClick={handleAddLayer}
                  className="flex items-center space-x-1 px-2.5 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 rounded text-[11px] font-semibold transition-all"
                >
                  <Plus size={13} />
                  <span>Ajouter un composant</span>
                </button>
              </div>

              <div className="space-y-2.5">
                {layers.map((layer, index) => (
                  <div 
                    key={layer.id}
                    className="p-3 bg-[#0f1117] border border-[#2a2f42] rounded-lg flex items-center space-x-2 text-xs"
                  >
                    <span className="w-5 h-5 rounded bg-[#161922] text-gray-400 flex items-center justify-center font-mono font-bold text-[10px] shrink-0">
                      {index + 1}
                    </span>

                    {/* Role Select/Input */}
                    <div className="flex-1 space-y-1">
                      <label className="text-[10px] text-gray-400 font-mono block">Rôle du Composant</label>
                      <input
                        type="text"
                        list={`roles-${layer.id}`}
                        value={layer.role}
                        onChange={(e) => handleUpdateLayer(layer.id, 'role', e.target.value)}
                        placeholder="Ex: Backend API, Frontend UI..."
                        className="w-full bg-[#161922] border border-[#2a2f42] rounded px-2.5 py-1 text-white text-xs focus:outline-none focus:border-cyan-500 font-mono"
                      />
                      <datalist id={`roles-${layer.id}`}>
                        {PRESET_ROLES.map(r => <option key={r} value={r} />)}
                      </datalist>
                    </div>

                    <span className="text-gray-500 font-bold shrink-0 pt-3">➔</span>

                    {/* Tech Select/Input */}
                    <div className="flex-1 space-y-1">
                      <label className="text-[10px] text-gray-400 font-mono block">Technologie Cible</label>
                      <input
                        type="text"
                        list={`techs-${layer.id}`}
                        value={layer.tech}
                        onChange={(e) => handleUpdateLayer(layer.id, 'tech', e.target.value)}
                        placeholder="Ex: Python (FastAPI), HTML5/JS..."
                        className="w-full bg-[#161922] border border-[#2a2f42] rounded px-2.5 py-1 text-cyan-300 text-xs focus:outline-none focus:border-cyan-500 font-mono"
                      />
                      <datalist id={`techs-${layer.id}`}>
                        {PRESET_TECHS.map(t => <option key={t} value={t} />)}
                      </datalist>
                    </div>

                    {/* Delete button */}
                    <button
                      type="button"
                      onClick={() => handleRemoveLayer(layer.id)}
                      disabled={layers.length <= 1}
                      className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors disabled:opacity-30 shrink-0 mt-3"
                      title="Supprimer ce composant"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#0f1117] border-t border-[#2a2f42] flex items-center justify-between">
          <span className="text-[10px] text-gray-500 font-mono">
            {autoDecide ? 'Mode Automatique Actif' : `${layers.length} composant(s) configuré(s)`}
          </span>
          <button
            onClick={handleSave}
            className="flex items-center space-x-1.5 px-4 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-bold rounded-lg text-xs transition-all shadow"
          >
            <Check size={14} />
            <span>Enregistrer la Stack Polyglotte</span>
          </button>
        </div>
      </div>
    </div>
  );
};
