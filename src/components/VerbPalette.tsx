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
          <h2 className="font-semibold text-white text-xs uppercase tracking-wider">IPL Verb Palette</h2>
        </div>
        <span className="text-[10px] bg-[#0f1117] text-gray-400 px-2 py-0.5 rounded border border-[#2a2f42] font-mono">
          12 Verbs
        </span>
      </div>

      {/* Search & Category Filter */}
      <div className="p-2.5 space-y-2 border-b border-[#2a2f42] bg-[#12141c]">
        <input
          type="text"
          placeholder="Search verb..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-[#161922] border border-[#2a2f42] rounded px-2.5 py-1 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500"
        />

        <div className="flex items-center justify-between text-[11px]">
          {['all', 'data', 'action', 'control', 'flow'].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-2 py-0.5 rounded capitalize transition-colors ${
                filterCategory === cat
                  ? 'bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/30'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Verbs Cards List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {filteredVerbs.map((verb) => (
          <div
            key={verb.id}
            draggable
            onDragStart={(e) => handleDragStart(e, verb)}
            onClick={() => insertVerbSnippet(verb)}
            className="group p-2.5 bg-[#12141c] hover:bg-[#1a1e2b] border border-[#2a2f42] hover:border-cyan-500/40 rounded-lg cursor-pointer transition-all duration-200 shadow-sm flex flex-col justify-between"
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center space-x-2">
                {verbIcons[verb.id]}
                <span className="font-bold text-xs text-white font-mono">{verb.name}</span>
              </div>
              <span className="text-[9px] uppercase px-1.5 py-0.2 bg-[#161922] text-gray-400 rounded border border-[#2a2f42]">
                {verb.category}
              </span>
            </div>

            <p className="text-[11px] text-gray-400 leading-tight mb-2 group-hover:text-gray-300">
              {verb.description}
            </p>

            <div className="flex items-center justify-between pt-1 border-t border-[#1e2333] text-[10px]">
              <span className="font-mono text-cyan-400/80 truncate max-w-[170px]">{verb.example}</span>
              <span className="text-gray-500 group-hover:text-cyan-300 flex items-center font-sans">
                <Plus size={10} className="mr-0.5" /> Insert
              </span>
            </div>
          </div>
        ))}

        {filteredVerbs.length === 0 && (
          <div className="text-center py-6 text-xs text-gray-500">
            No verbs matching your filter.
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="p-2 border-t border-[#2a2f42] text-[10px] text-gray-400 flex items-center justify-between bg-[#0f1117]">
        <div className="flex items-center space-x-1">
          <HelpCircle size={12} className="text-cyan-400" />
          <span>Click / Drag to insert</span>
        </div>
        <span className="font-mono text-cyan-400">Ctrl+Z Active</span>
      </div>
    </div>
  );
};
