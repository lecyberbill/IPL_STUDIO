import React from 'react';
import { VerbPalette } from './VerbPalette';
import { SourceFileTree } from './SourceFileTree';
import { ArtifactFilesPanel } from './ArtifactFilesPanel';
import { useIdeStore } from '../store/useIdeStore';
import { Layers, FolderGit2, Package } from 'lucide-react';

/**
 * Left sidebar — the toolbox. Single place for FILES: the .ipl SOURCES (the
 * contract) and the generated ARTIFACT. The right sidebar is Chat only. The
 * active tab lives in the store so other panels (Delivery) can jump to it.
 */
export const LeftSidebar: React.FC = () => {
  const { leftSidebarWidth, leftPanelTab, setLeftPanelTab } = useIdeStore();
  const tab = (t: 'verbs' | 'sources' | 'artifact') =>
    `flex-1 flex items-center justify-center space-x-1 py-1 rounded-md text-xs font-semibold transition-all ${
      leftPanelTab === t ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm' : 'text-gray-400 hover:text-white'
    }`;

  return (
    <aside
      style={{ width: `${leftSidebarWidth}px` }}
      className="bg-[#161922] border-r border-[#2a2f42] flex flex-col h-full select-none shrink-0"
    >
      {/* Header Tabs */}
      <div className="h-10 border-b border-[#2a2f42] px-2 flex items-center justify-between bg-[#0f1117] shrink-0">
        <div className="flex items-center space-x-1 w-full">
          {/* Files first (the contract + the artifact); IPL the language (verbs) last — it is a means, not the centre. */}
          <button onClick={() => setLeftPanelTab('sources')} className={tab('sources')} title="The .ipl SOURCES — the contract">
            <FolderGit2 size={13} />
            <span>Sources</span>
          </button>
          <button onClick={() => setLeftPanelTab('artifact')} className={tab('artifact')} title="The generated/imported ARTIFACT">
            <Package size={13} />
            <span>Artifact</span>
          </button>
          <button onClick={() => setLeftPanelTab('verbs')} className={tab('verbs')} title="IPL verb palette (a means, not the centre)">
            <Layers size={13} />
            <span>Verbs</span>
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {leftPanelTab === 'verbs' ? <VerbPalette /> : leftPanelTab === 'sources' ? <SourceFileTree /> : <ArtifactFilesPanel />}
      </div>
    </aside>
  );
};
