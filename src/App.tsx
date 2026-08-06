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
import { useIdeStore } from './store/useIdeStore';

export const App: React.FC = () => {
  const { 
    editorViewMode, 
    runCompilation, 
    isGitModalOpen, 
    toggleGitModal,
    setLeftSidebarWidth,
    setRightSidebarWidth
  } = useIdeStore();

  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);

  // Gérer le redimensionnement interactif des colonnes au glisser de la souris
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

  // Écouteur global du raccourci clavier Ctrl + Entrée (ou Cmd + Entrée) pour lancer la compilation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        runCompilation();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [runCompilation]);

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0f1117] text-gray-100 overflow-hidden font-sans select-none">
      {/* 1. Barre de Contrôle Supérieure */}
      <Navbar />

      {/* 2. Espace de Travail Central (Panneaux Redimensionnables) */}
      <main className="flex-1 flex flex-row overflow-hidden relative">
        {/* Panneau Gauche : Palette Verbes et Arborescence .ipl */}
        <LeftSidebar />

        {/* Poignée de Redimensionnement Colonne 1 (Gauche) */}
        <div
          onMouseDown={() => setIsResizingLeft(true)}
          onDoubleClick={() => setLeftSidebarWidth(280)}
          className={`w-1.5 hover:w-2 bg-[#161922] hover:bg-cyan-500/60 cursor-col-resize z-30 transition-all shrink-0 border-r border-[#2a2f42] ${
            isResizingLeft ? 'bg-cyan-500 w-2' : ''
          }`}
          title="Faire glisser pour redimensionner la colonne gauche (Double-clic pour réinitialiser)"
        />

        {/* Zone Centrale : Éditeur Monaco ou Blocs AST */}
        <section className="flex-1 flex flex-col h-full overflow-hidden bg-[#12141c] min-w-0">
          {editorViewMode === 'text' ? <IplMonacoEditor /> : <BlockViewEditor />}
        </section>

        {/* Poignée de Redimensionnement Colonne 3 (Droite) */}
        <div
          onMouseDown={() => setIsResizingRight(true)}
          onDoubleClick={() => setRightSidebarWidth(520)}
          className={`w-1.5 hover:w-2 bg-[#161922] hover:bg-cyan-500/60 cursor-col-resize z-30 transition-all shrink-0 border-l border-[#2a2f42] ${
            isResizingRight ? 'bg-cyan-500 w-2' : ''
          }`}
          title="Faire glisser pour redimensionner la colonne droite (Double-clic pour réinitialiser)"
        />

        {/* Panneau Droit : Inspecteur de Cible & Chat LLM */}
        <TargetInspector />
      </main>

      {/* 3. Console Bas de Page & Terminal Embarqué */}
      <ConsolePanel />

      {/* 4. Modals */}
      <SettingsModal />
      <ProjectModal />
      <PolyglotModal />
      <GitDiffModal isOpen={isGitModalOpen} onClose={toggleGitModal} />
    </div>
  );
};

export default App;
