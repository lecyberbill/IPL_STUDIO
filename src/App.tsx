import React, { useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { LeftSidebar } from './components/LeftSidebar';
import { IplMonacoEditor } from './components/IplMonacoEditor';
import { BlockViewEditor } from './components/BlockViewEditor';
import { TargetInspector } from './components/TargetInspector';
import { ConsolePanel } from './components/ConsolePanel';
import { SettingsModal } from './components/SettingsModal';
import { ProjectModal } from './components/ProjectModal';
import { GitDiffModal } from './components/GitDiffModal';
import { useIdeStore } from './store/useIdeStore';

export const App: React.FC = () => {
  const { editorViewMode, runCompilation, isGitModalOpen, toggleGitModal } = useIdeStore();

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

      {/* 2. Espace de Travail Central (Panneaux) */}
      <main className="flex-1 flex flex-row overflow-hidden relative">
        {/* Panneau Gauche avec Onglets : Palette Verbes et Arborescence .ipl */}
        <LeftSidebar />

        {/* Zone Centrale : Éditeur Monaco ou Blocs AST */}
        <section className="flex-1 flex flex-col h-full overflow-hidden bg-[#12141c]">
          {editorViewMode === 'text' ? <IplMonacoEditor /> : <BlockViewEditor />}
        </section>

        {/* Panneau Droit : Inspecteur de Cible & Chat LLM */}
        <TargetInspector />
      </main>

      {/* 3. Console Bas de Page & Terminal Embarqué */}
      <ConsolePanel />

      {/* 4. Modals */}
      <SettingsModal />
      <ProjectModal />
      <GitDiffModal isOpen={isGitModalOpen} onClose={toggleGitModal} />
    </div>
  );
};

export default App;
