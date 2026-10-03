import React from 'react';
import { useIdeStore } from '../store/useIdeStore';
import { ChatPanel } from './ChatPanel';

/**
 * Right sidebar — now **Chat only**. The file views (IPL sources + generated
 * artifact) were consolidated into the LEFT sidebar, so there is a single place
 * for files. Left = the toolbox (verbs + files), right = the assistant.
 */
export const TargetInspector: React.FC = () => {
  const { rightSidebarWidth } = useIdeStore();
  return (
    <aside
      style={{ width: `${rightSidebarWidth}px` }}
      className="bg-[#161922] border-l border-[#2a2f42] flex flex-col h-full select-none shrink-0"
    >
      <ChatPanel />
    </aside>
  );
};
