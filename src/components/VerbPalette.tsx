import React, { useState } from 'react';
import type { IPLVerb } from '../engine/iplGrammar';
import { IPL_VERBS } from '../engine/iplGrammar';
import { useIdeStore } from '../store/useIdeStore';
import { 
  PlusCircle, 
  BookOpen, 
  Edit3, 
  Trash2, 
  Search, 
  Send, 
  Radio, 
  Calculator, 
  GitBranch, 
  Repeat, 
  ShieldAlert, 
  CornerDownLeft,
  Layers,
  HelpCircle,
  Plus
} from 'lucide-react';

const verbIcons: Record<string, React.ReactNode> = {
  add: <PlusCircle size={15} className="text-emerald-400" />,
  read: <BookOpen size={15} className="text-sky-400" />,
  set: <Edit3 size={15} className="text-amber-400" />,
  remove: <Trash2 size={15} className="text-rose-400" />,
  search: <Search size={15} className="text-indigo-400" />,
  send: <Send size={15} className="text-purple-400" />,
  listen: <Radio size={15} className="text-cyan-400" />,
  compute: <Calculator size={15} className="text-teal-400" />,
  if: <GitBranch size={15} className="text-yellow-400" />,
  for: <Repeat size={15} className="text-orange-400" />,
  try: <ShieldAlert size={15} className="text-red-400" />,
  return: <CornerDownLeft size={15} className="text-gray-400" />
};

export const VerbPalette: React.FC = () => {
  const { insertVerbSnippet } = useIdeStore();
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const filteredVerbs = IPL_VERBS.filter(verb => {
    const matchesCat = filterCategory === 'all' || verb.category === filterCategory;
    const matchesSearch = verb.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          verb.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const handleDragStart = (e: React.DragEvent, verb: IPLVerb) => {
    e.dataTransfer.setData('text/plain', verb.snippet);
  };

  return (
    <div className="w-full bg-[#161922] flex flex-col h-full select-none">
      {/* Header */}
      <div className="p-3 border-b border-[#2a2f42] flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Layers size={16} className="text-cyan-400" />
          <h2 className="font-semibold text-white text-xs uppercase tracking-wider">Palette des Verbes</h2>
        </div>
        <span className="text-[10px] bg-[#0f1117] text-gray-400 px-2 py-0.5 rounded border border-[#2a2f42] font-mono">
          12 Verbes
        </span>
      </div>

      {/* Search Input */}
      <div className="p-2 border-b border-[#2a2f42]">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2 text-gray-500" />
          <input
            type="text"
            placeholder="Filtrer verbes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#0f1117] border border-[#2a2f42] rounded-md pl-8 pr-3 py-1 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 font-mono"
          />
        </div>
      </div>

      {/* Category Tabs */}
      <div className="grid grid-cols-4 gap-1 p-2 border-b border-[#2a2f42] text-[10px] font-medium">
        {['all', 'data', 'action', 'control'].map((cat) => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            className={`py-1 rounded capitalize transition-colors ${
              filterCategory === cat
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                : 'text-gray-400 hover:bg-[#1e2230]'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Verbs List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {filteredVerbs.map((verb) => (
          <div
            key={verb.id}
            draggable
            onDragStart={(e) => handleDragStart(e, verb)}
            onClick={() => insertVerbSnippet(verb)}
            className="group relative bg-[#0f1117] hover:bg-[#1e2230] border border-[#2a2f42] hover:border-cyan-500/50 rounded-lg p-2.5 cursor-pointer transition-all duration-150 shadow-sm hover:shadow-md hover:shadow-cyan-500/5"
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center space-x-2">
                {verbIcons[verb.name]}
                <span className="font-bold font-mono text-xs text-white group-hover:text-cyan-300">
                  {verb.name}
                </span>
              </div>
              <span className="text-[9px] uppercase px-1.5 py-0.5 rounded font-mono bg-[#161922] text-gray-400 group-hover:text-cyan-400 border border-[#2a2f42]">
                {verb.category}
              </span>
            </div>

            <p className="text-[11px] text-gray-400 line-clamp-2 mb-2 leading-relaxed">
              {verb.description}
            </p>

            <div className="flex items-center justify-between text-[10px] text-gray-500 font-mono pt-1 border-t border-[#1b1f2c]">
              <span className="truncate max-w-[170px] italic">Ex: {verb.example}</span>
              <Plus size={12} className="text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        ))}
      </div>

      {/* Footer Info */}
      <div className="p-2 border-t border-[#2a2f42] text-[10px] text-gray-400 flex items-center justify-between bg-[#0f1117]">
        <div className="flex items-center space-x-1">
          <HelpCircle size={12} className="text-cyan-400" />
          <span>Clic / Glisser pour insérer</span>
        </div>
        <span className="font-mono text-cyan-400">Ctrl+Z actif</span>
      </div>
    </div>
  );
};
