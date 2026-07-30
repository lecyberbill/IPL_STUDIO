import React, { useState } from 'react';
import { VerbPalette } from './VerbPalette';
import { SourceFileTree } from './SourceFileTree';
import { Layers, FolderGit2 } from 'lucide-react';

export const LeftSidebar: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'verbs' | 'sources'>('verbs');

  return (
    <aside className="w-64 bg-[#161922] border-r border-[#2a2f42] flex flex-col h-full select-none shrink-0">
      {/* Header Tabs */}
      <div className="h-10 border-b border-[#2a2f42] px-2 flex items-center justify-between bg-[#0f1117] shrink-0">
        <div className="flex items-center space-x-1 w-full">
          <button
            onClick={() => setActiveTab('verbs')}
            className={`flex-1 flex items-center justify-center space-x-1.5 py-1 rounded-md text-xs font-semibold transition-all ${
              activeTab === 'verbs'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Layers size={13} />
            <span>🧩 Verbes</span>
          </button>

          <button
            onClick={() => setActiveTab('sources')}
            className={`flex-1 flex items-center justify-center space-x-1.5 py-1 rounded-md text-xs font-semibold transition-all ${
              activeTab === 'sources'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <FolderGit2 size={13} />
            <span>📂 Fichiers .ipl</span>
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'verbs' ? <VerbPalette /> : <SourceFileTree />}
      </div>
    </aside>
  );
};
