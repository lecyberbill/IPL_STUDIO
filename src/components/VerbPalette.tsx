import React, { useState } from 'react';
import { IPL_VERBS, IPL_INTENT_TYPES } from '../engine/iplGrammar';
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
  Type,
  Plus,
  Hash,
  ToggleLeft,
  Key,
  Calendar,
  ListOrdered,
  List,
  HelpCircle
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

const typeIcons: Record<string, React.ReactNode> = {
  'type-text': <Type size={14} className="text-cyan-400" />,
  'type-number': <Hash size={14} className="text-amber-400" />,
  'type-boolean': <ToggleLeft size={14} className="text-emerald-400" />,
  'type-id': <Key size={14} className="text-purple-400" />,
  'type-date': <Calendar size={14} className="text-pink-400" />,
  'type-options': <ListOrdered size={14} className="text-indigo-400" />,
  'type-list': <List size={14} className="text-sky-400" />
};

export const VerbPalette: React.FC = () => {
  const { insertVerbSnippet, insertSnippetText } = useIdeStore();
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const filteredVerbs = IPL_VERBS.filter(verb => {
    if (filterCategory === 'types') return false;
    const matchesCat = filterCategory === 'all' || filterCategory === 'verbs' || verb.category === filterCategory;
    const matchesSearch = verb.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          verb.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const filteredTypes = IPL_INTENT_TYPES.filter(typeObj => {
    if (filterCategory !== 'all' && filterCategory !== 'types') return false;
    const matchesSearch = typeObj.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          typeObj.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const handleDragStart = (e: React.DragEvent, snippetText: string) => {
    e.dataTransfer.setData('text/plain', snippetText);
  };

  return (
    <div className="w-full bg-[#161922] flex flex-col h-full select-none">
      {/* Header */}
      <div className="p-3 border-b border-[#2a2f42] flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Layers size={16} className="text-cyan-400" />
          <h2 className="font-semibold text-white text-xs uppercase tracking-wider">IPL Vocab & Verbs</h2>
        </div>
        <span className="text-[10px] bg-[#0f1117] text-gray-400 px-2 py-0.5 rounded border border-[#2a2f42] font-mono">
          12 Verbs + 7 Types
        </span>
      </div>

      {/* Search & Category Filter */}
      <div className="p-2.5 space-y-2 border-b border-[#2a2f42] bg-[#12141c]">
        <input
          type="text"
          placeholder="Search verbs or intent types..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-[#161922] border border-[#2a2f42] rounded px-2.5 py-1 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500"
        />

        {/* Quick Horizontal Type Chips Bar */}
        <div className="flex items-center space-x-1 overflow-x-auto scrollbar-none py-0.5">
          <span className="text-[9px] text-gray-500 font-semibold uppercase shrink-0 mr-1">Types:</span>
          {IPL_INTENT_TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => insertSnippetText(t.snippet, t.name)}
              className="px-1.5 py-0.5 bg-[#161922] hover:bg-cyan-500/20 hover:text-cyan-300 border border-[#2a2f42] hover:border-cyan-500/40 rounded text-[10px] font-mono text-cyan-400 shrink-0 transition-colors"
              title={`${t.description} (Target: ${t.targetMapping})`}
            >
              {t.name}
            </button>
          ))}
        </div>

        {/* Category Badges */}
        <div className="flex items-center justify-between text-[10px] pt-1">
          {['all', 'verbs', 'types', 'data', 'action', 'control', 'flow'].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-1.5 py-0.5 rounded capitalize transition-colors ${
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

      {/* Cards List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {/* Intent Types Cards Section */}
        {filteredTypes.length > 0 && (
          <div className="space-y-1.5 mb-3">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1">
              Human Intent Types ({filteredTypes.length})
            </div>
            {filteredTypes.map((t) => (
              <div
                key={t.id}
                draggable
                onDragStart={(e) => handleDragStart(e, t.snippet)}
                onClick={() => insertSnippetText(t.snippet, t.name)}
                className="group p-2 bg-[#12141c] hover:bg-[#1a1e2b] border border-[#2a2f42] hover:border-cyan-500/40 rounded-lg cursor-pointer transition-all duration-200 shadow-sm flex items-center justify-between"
              >
                <div className="flex items-center space-x-2">
                  {typeIcons[t.id]}
                  <div>
                    <span className="font-bold text-xs text-cyan-300 font-mono">{t.name}</span>
                    <p className="text-[10px] text-gray-400 line-clamp-1">{t.description}</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="text-[9px] font-mono px-1.5 py-0.5 bg-cyan-500/10 text-cyan-400 rounded border border-cyan-500/30 group-hover:bg-cyan-500 group-hover:text-black transition-colors shrink-0"
                >
                  + Add
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Verbs Cards Section */}
        {filteredVerbs.length > 0 && (
          <div className="space-y-1.5">
            {filteredTypes.length > 0 && (
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1 pt-1">
                IPL Action Verbs ({filteredVerbs.length})
              </div>
            )}
            {filteredVerbs.map((verb) => (
              <div
                key={verb.id}
                draggable
                onDragStart={(e) => handleDragStart(e, verb.snippet)}
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

                <p className="text-[11px] text-gray-400 mb-2 leading-relaxed">{verb.description}</p>

                <div className="flex items-center justify-between pt-1 border-t border-[#2a2f42]/50">
                  <span className="text-[10px] font-mono text-gray-500 truncate max-w-[170px]" title={verb.example}>
                    {verb.example}
                  </span>

                  <button
                    type="button"
                    className="flex items-center space-x-1 text-[10px] text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 px-2 py-0.5 rounded border border-cyan-500/30 transition-colors font-mono"
                  >
                    <Plus size={10} />
                    <span>Insert</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {filteredTypes.length === 0 && filteredVerbs.length === 0 && (
          <div className="text-center py-6 text-xs text-gray-500">
            No verbs or types matching your search.
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
