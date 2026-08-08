// [WFGY] Zone: SAFE | λ: 0.3 | Fallbacks: 0 | Action: Create IPL Interactive Tutorial Modal Component

import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { 
  CheckCircle2, 
  XCircle, 
  HelpCircle, 
  Eye, 
  ArrowRight, 
  ArrowLeft, 
  RotateCcw, 
  Sparkles, 
  X, 
  Code2, 
  Award,
  ChevronRight,
  GraduationCap,
  Play
} from 'lucide-react';
import { IPL_TUTORIAL_LESSONS, type TutorialLesson } from './iplTutorialLessons';
import { useIdeStore } from '../store/useIdeStore';

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TutorialModal: React.FC<TutorialModalProps> = ({ isOpen, onClose }) => {
  const { setCode } = useIdeStore();

  const [currentLessonIndex, setCurrentLessonIndex] = useState<number>(() => {
    const saved = localStorage.getItem('ipl_tutorial_current_lesson');
    return saved ? parseInt(saved, 10) : 0;
  });

  const [completedLessons, setCompletedLessons] = useState<number[]>(() => {
    const saved = localStorage.getItem('ipl_tutorial_completed_lessons');
    return saved ? JSON.parse(saved) : [];
  });

  const lesson: TutorialLesson = IPL_TUTORIAL_LESSONS[currentLessonIndex] || IPL_TUTORIAL_LESSONS[0];
  const [userCode, setUserCode] = useState<string>(lesson.initialCode);
  const [showHint, setShowHint] = useState<boolean>(false);
  const [validationResults, setValidationResults] = useState<{ id: string; passed: boolean }[]>([]);
  const [hasValidated, setHasValidated] = useState<boolean>(false);
  const [isAllPassed, setIsAllPassed] = useState<boolean>(false);
  const [injectedSuccess, setInjectedSuccess] = useState<boolean>(false);

  // Mettre à jour le code utilisateur lors du changement de leçon
  useEffect(() => {
    setUserCode(lesson.initialCode);
    setShowHint(false);
    setHasValidated(false);
    setIsAllPassed(false);
    setValidationResults([]);
    localStorage.setItem('ipl_tutorial_current_lesson', currentLessonIndex.toString());
  }, [currentLessonIndex, lesson]);

  if (!isOpen) return null;

  // Valider les objectifs de la leçon en cours
  const handleValidate = () => {
    const results = lesson.objectives.map(obj => ({
      id: obj.id,
      passed: obj.check(userCode)
    }));
    
    setValidationResults(results);
    setHasValidated(true);

    const allPassed = results.every(r => r.passed);
    setIsAllPassed(allPassed);

    if (allPassed) {
      if (!completedLessons.includes(lesson.id)) {
        const updated = [...completedLessons, lesson.id];
        setCompletedLessons(updated);
        localStorage.setItem('ipl_tutorial_completed_lessons', JSON.stringify(updated));
      }
    }
  };

  // Réinitialiser le code de l'exercice
  const handleReset = () => {
    setUserCode(lesson.initialCode);
    setHasValidated(false);
    setIsAllPassed(false);
    setValidationResults([]);
    setShowHint(false);
  };

  // Remplacer le code par la solution
  const handleRevealSolution = () => {
    setUserCode(lesson.solution);
  };

  // Charger le code d'exercice dans l'éditeur principal d'IPL Studio
  const handleInjectIntoStudio = () => {
    setCode(userCode);
    setInjectedSuccess(true);
    setTimeout(() => {
      setInjectedSuccess(false);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200 select-none">
      <div className="bg-[#131622] border border-[#2a2f45] rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden text-gray-100">
        
        {/* Header Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#24283b] bg-[#171a29]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-cyan-400">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold bg-gradient-to-r from-cyan-400 via-sky-300 to-indigo-400 bg-clip-text text-transparent">
                  Tutoriel Interactif IPL
                </h2>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  {completedLessons.length} / {IPL_TUTORIAL_LESSONS.length} terminés
                </span>
              </div>
              <p className="text-xs text-gray-400">Apprenez à concevoir des spécifications d'intention en pas-à-pas</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corps Principal */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Navigation Latérale Gauche (Liste des Leçons) */}
          <div className="w-72 bg-[#0f111a] border-r border-[#24283b] flex flex-col shrink-0 overflow-y-auto">
            <div className="p-3 border-b border-[#24283b] text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Parcours de Formation
            </div>
            <div className="p-2 space-y-1">
              {IPL_TUTORIAL_LESSONS.map((l, idx) => {
                const isSelected = idx === currentLessonIndex;
                const isDone = completedLessons.includes(l.id);

                return (
                  <button
                    key={l.id}
                    onClick={() => setCurrentLessonIndex(idx)}
                    className={`w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all ${
                      isSelected 
                        ? 'bg-gradient-to-r from-cyan-950/60 to-indigo-950/40 border border-cyan-500/40 text-cyan-300' 
                        : 'hover:bg-[#1a1d2e] text-gray-300'
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {isDone ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center text-[10px] ${
                          isSelected ? 'border-cyan-400 text-cyan-400 font-bold' : 'border-gray-600 text-gray-500'
                        }`}>
                          {l.id}
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold truncate flex items-center justify-between">
                        <span>{l.title}</span>
                      </div>
                      <div className="text-[11px] text-gray-500 truncate mt-0.5">
                        {l.category} • {l.estimatedTime}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Encadré d'encouragement si tout est validé */}
            {completedLessons.length === IPL_TUTORIAL_LESSONS.length && (
              <div className="m-3 p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-lg text-emerald-300 text-xs flex items-center gap-2">
                <Award className="w-5 h-5 shrink-0 text-emerald-400" />
                <span>Bravo ! Vous avez terminé la formation complète sur IPL.</span>
              </div>
            )}
          </div>

          {/* Panneau Central & Droit (Contenu de la leçon + Éditeur d'exercice) */}
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            
            {/* Colonne Explications Théoriques */}
            <div className="w-full md:w-1/2 p-6 overflow-y-auto border-r border-[#24283b] space-y-5 bg-[#141724]">
              <div>
                <div className="flex items-center gap-2 text-xs font-medium text-cyan-400 mb-1">
                  <span>{lesson.category}</span>
                  <span>•</span>
                  <span className="px-2 py-0.5 bg-gray-800 rounded text-gray-300">{lesson.difficulty}</span>
                </div>
                <h3 className="text-xl font-bold text-white">{lesson.title}</h3>
                <p className="text-xs text-gray-400 mt-1">{lesson.subtitle}</p>
              </div>

              {/* Contenu Markdown / Explication */}
              <div className="prose prose-invert prose-xs max-w-none text-gray-300 space-y-3 leading-relaxed">
                {lesson.explanation.split('\n\n').map((paragraph, i) => {
                  if (paragraph.startsWith('### ')) {
                    return <h4 key={i} className="text-sm font-semibold text-cyan-300 mt-3">{paragraph.replace('### ', '')}</h4>;
                  }
                  if (paragraph.startsWith('```ipl')) {
                    const codeBlock = paragraph.replace(/```ipl|```/g, '').trim();
                    return (
                      <pre key={i} className="bg-[#0b0d14] p-3 rounded-lg border border-[#24283b] text-cyan-200 text-xs font-mono overflow-x-auto">
                        <code>{codeBlock}</code>
                      </pre>
                    );
                  }
                  return <p key={i}>{paragraph}</p>;
                })}
              </div>

              {/* Objectifs de la Leçon */}
              <div className="bg-[#0f111a] border border-[#24283b] rounded-lg p-4 space-y-2">
                <div className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                  <span>Objectifs à valider :</span>
                </div>
                <div className="space-y-1.5">
                  {lesson.objectives.map((obj) => {
                    const res = validationResults.find(r => r.id === obj.id);
                    const isPassed = res ? res.passed : false;

                    return (
                      <div key={obj.id} className="flex items-center gap-2 text-xs">
                        {hasValidated ? (
                          isPassed ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                          )
                        ) : (
                          <div className="w-3.5 h-3.5 rounded-full border border-gray-600 shrink-0" />
                        )}
                        <span className={hasValidated ? (isPassed ? 'text-emerald-300' : 'text-rose-300') : 'text-gray-400'}>
                          {obj.description}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Accordéon Indice / Solution */}
              <div className="space-y-2 pt-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowHint(!showHint)}
                    className="flex-1 px-3 py-1.5 bg-[#1b1f30] hover:bg-[#23283e] border border-[#2a2f45] rounded-lg text-xs font-medium text-amber-300 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>{showHint ? 'Masquer l\'indice' : 'Besoin d\'un indice ?'}</span>
                  </button>

                  <button
                    onClick={handleRevealSolution}
                    className="px-3 py-1.5 bg-[#1b1f30] hover:bg-[#23283e] border border-[#2a2f45] rounded-lg text-xs font-medium text-gray-400 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Voir la solution</span>
                  </button>
                </div>

                {showHint && (
                  <div className="p-3 bg-amber-950/30 border border-amber-500/30 rounded-lg text-xs text-amber-200">
                    💡 <strong>Indice :</strong> {lesson.hint}
                  </div>
                )}
              </div>
            </div>

            {/* Colonne Éditeur de Code Interactif */}
            <div className="w-full md:w-1/2 flex flex-col h-full bg-[#0b0d14]">
              <div className="px-4 py-2 border-b border-[#24283b] bg-[#121420] flex items-center justify-between text-xs text-gray-400">
                <div className="flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-cyan-400" />
                  <span className="font-mono text-cyan-300">exercice_leçon_{lesson.id}.ipl</span>
                </div>

                <button
                  onClick={handleReset}
                  className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors"
                  title="Réinitialiser le code de l'exercice"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Réinitialiser</span>
                </button>
              </div>

              {/* Zone Éditeur Monaco */}
              <div className="flex-1 relative">
                <Editor
                  height="100%"
                  defaultLanguage="ipl"
                  theme="vs-dark"
                  value={userCode}
                  onChange={(val) => setUserCode(val || '')}
                  options={{
                    fontSize: 13,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    tabSize: 2,
                    fontFamily: 'Fira Code, Menlo, Monaco, Consolas, monospace'
                  }}
                />
              </div>

              {/* Barre d'Action & Résultats */}
              <div className="p-4 border-t border-[#24283b] bg-[#131624] space-y-3">
                {hasValidated && (
                  <div className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
                    isAllPassed 
                      ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                      : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                  }`}>
                    <div className="flex items-center gap-2">
                      {isAllPassed ? (
                        <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      )}
                      <span>
                        {isAllPassed 
                          ? 'Parfait ! Tous les objectifs de cet exercice sont validés.' 
                          : 'Certains objectifs ne sont pas encore remplis. Vérifiez votre code.'}
                      </span>
                    </div>

                    {isAllPassed && currentLessonIndex < IPL_TUTORIAL_LESSONS.length - 1 && (
                      <button
                        onClick={() => setCurrentLessonIndex(prev => prev + 1)}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium flex items-center gap-1 transition-colors"
                      >
                        <span>Suivant</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between gap-3">
                  <button
                    onClick={handleValidate}
                    className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-medium rounded-lg text-xs flex items-center gap-2 shadow-lg shadow-cyan-950/50 transition-all"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Vérifier mon code</span>
                  </button>

                  <button
                    onClick={handleInjectIntoStudio}
                    className={`px-3.5 py-2 border rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                      injectedSuccess 
                        ? 'bg-emerald-600 border-emerald-500 text-white' 
                        : 'bg-[#1b1f30] hover:bg-[#252b42] border-[#2a2f45] text-cyan-300'
                    }`}
                    title="Envoyer ce code d'exercice dans l'éditeur principal du Studio"
                  >
                    <Code2 className="w-3.5 h-3.5" />
                    <span>{injectedSuccess ? 'Injecté dans le Studio !' : 'Ouvrir dans le Studio'}</span>
                  </button>
                </div>
              </div>

            </div>

          </div>

        </div>

        {/* Footer Navigation */}
        <div className="px-6 py-3 border-t border-[#24283b] bg-[#121420] flex items-center justify-between text-xs text-gray-400">
          <button
            disabled={currentLessonIndex === 0}
            onClick={() => setCurrentLessonIndex(prev => Math.max(0, prev - 1))}
            className="flex items-center gap-1 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Leçon précédente</span>
          </button>

          <span className="font-mono text-gray-500">Leçon {currentLessonIndex + 1} sur {IPL_TUTORIAL_LESSONS.length}</span>

          <button
            disabled={currentLessonIndex === IPL_TUTORIAL_LESSONS.length - 1}
            onClick={() => setCurrentLessonIndex(prev => Math.min(IPL_TUTORIAL_LESSONS.length - 1, prev + 1))}
            className="flex items-center gap-1 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400 transition-colors"
          >
            <span>Leçon suivante</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  );
};
