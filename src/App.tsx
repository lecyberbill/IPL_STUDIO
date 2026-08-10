import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { LeftSidebar } from './components/LeftSidebar';
import { IplMonacoEditor } from './components/IplMonacoEditor';
import { BlockViewEditor } from './components/BlockViewEditor';
import { TargetInspector } from './components/TargetInspector';
import { ConsolePanel } from './components/ConsolePanel';
import { SettingsModal } from './components/SettingsModal';
import { ProjectModal } from './components/ProjectModal';
import { GitDiffModal } from './components/GitDiffModal';
import { PolyglotModal } from './components/PolyglotModal';
import { TutorialModal } from './tutorial';
import { WelcomeModal } from './components/WelcomeModal';
import { useIdeStore } from './store/useIdeStore';

export const App: React.FC = () => {
  const { 
    editorViewMode, 
    runGeneration, 
    isGitModalOpen, 
    toggleGitModal,
    isTutorialOpen,
    toggleTutorial,
    setLeftSidebarWidth,
    setRightSidebarWidth
  } = useIdeStore();

  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);

  // Handle interactive column resizing on mouse drag
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingLeft) {
        setLeftSidebarWidth(e.clientX);
      } else if (isResizingRight) {
        const newWidth = window.innerWidth - e.clientX;
        setRightSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizingLeft(false);
      setIsResizingRight(false);
    };

    if (isResizingLeft || isResizingRight) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingLeft, isResizingRight, setLeftSidebarWidth, setRightSidebarWidth]);

  // Global listener for the Ctrl + Enter (or Cmd + Enter) keyboard shortcut to trigger generation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        runGeneration();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [runGeneration]);

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0f1117] text-gray-100 overflow-hidden font-sans select-none">
      {/* 1. Top Control Bar */}
      <Navbar />

      {/* 2. Central Workspace (Resizable Panels) */}
      <main className="flex-1 flex flex-row overflow-hidden relative">
        {/* Left Panel: Verb Palette & .ipl Tree */}
        <LeftSidebar />

        {/* Resize Handle Column 1 (Left) */}
        <div
          onMouseDown={() => setIsResizingLeft(true)}
          onDoubleClick={() => setLeftSidebarWidth(280)}
          className={`w-1.5 hover:w-2 bg-[#161922] hover:bg-cyan-500/60 cursor-col-resize z-30 transition-all shrink-0 border-r border-[#2a2f42] ${
            isResizingLeft ? 'bg-cyan-500 w-2' : ''
          }`}
          title="Drag to resize the left column (Double-click to reset)"
        />

        {/* Central Zone: Monaco Editor or AST Blocks */}
        <section className="flex-1 flex flex-col h-full overflow-hidden bg-[#12141c] min-w-0">
          {editorViewMode === 'text' ? <IplMonacoEditor /> : <BlockViewEditor />}
        </section>

        {/* Resize Handle Column 3 (Right) */}
        <div
          onMouseDown={() => setIsResizingRight(true)}
          onDoubleClick={() => setRightSidebarWidth(520)}
          className={`w-1.5 hover:w-2 bg-[#161922] hover:bg-cyan-500/60 cursor-col-resize z-30 transition-all shrink-0 border-l border-[#2a2f42] ${
            isResizingRight ? 'bg-cyan-500 w-2' : ''
          }`}
          title="Drag to resize the right column (Double-click to reset)"
        />

        {/* Right Panel: Target Inspector & LLM Chat */}
        <TargetInspector />
      </main>

      {/* 3. Bottom Console & Embedded Terminal */}
      <ConsolePanel />

      {/* 4. Modals */}
      <SettingsModal />
      <ProjectModal />
      <PolyglotModal />
      <GitDiffModal isOpen={isGitModalOpen} onClose={toggleGitModal} />
      <TutorialModal isOpen={isTutorialOpen} onClose={toggleTutorial} />

      {/* First-run onboarding (auto-dismissed permanently once seen) */}
      <WelcomeModal />
    </div>
  );
};

export default App;
