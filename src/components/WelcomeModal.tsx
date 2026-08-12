import React from 'react';
import { useIdeStore } from '../store/useIdeStore';
import { Sparkles, Keyboard, Rocket, GraduationCap, X, FolderPlus } from 'lucide-react';

/**
 * First-run onboarding overlay. Shown once (hasSeenWelcome is persisted), then
 * never again. Guides the user through the 3-step IPL Studio loop without a
 * wall: every action here just opens the right modal / runs the tutorial.
 */
export const WelcomeModal: React.FC = () => {
  const { hasSeenWelcome, completeWelcome, toggleTutorial, toggleProjectModal } = useIdeStore();

  if (hasSeenWelcome) return null;

  const dismiss = () => completeWelcome();

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4 select-none">
      <div className="bg-[#161922] border border-[#2a2f42] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-[fadeInUp_0.3s_ease-out]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#2a2f42] bg-gradient-to-r from-cyan-500/10 to-blue-600/10 flex items-start justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30">
              <Sparkles size={22} className="text-black fill-black" />
            </div>
            <div>
              <h1 className="font-bold text-white text-lg tracking-wider">Welcome to IPL Studio</h1>
              <p className="text-[11px] text-cyan-300/80 font-mono">Intent Programming Language IDE — v1.4.0</p>
            </div>
          </div>
          <button onClick={dismiss} className="p-1.5 text-gray-400 hover:text-white hover:bg-[#2a2f42] rounded transition-colors" title="Close (you can reopen the tutorial anytime)">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto text-xs text-gray-300">
          <p className="leading-relaxed">
            IPL Studio turns <strong className="text-cyan-300">structured English intents</strong> into complete,
            production-ready applications in your target language. Describe <em>what</em> you want — the engine
            handles the <em>how</em>.
          </p>

          {/* 3 Steps */}
          <div className="space-y-2.5">
            <div className="flex items-start space-x-3 bg-[#0f1117] p-3.5 rounded-xl border border-[#2a2f42]">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center justify-center shrink-0 font-bold text-sm">1</div>
              <div className="space-y-0.5">
                <div className="font-semibold text-white">Write your IPL spec in the editor</div>
                <p className="text-gray-400 leading-relaxed">Use the <strong className="text-cyan-300">🧩 Verbs</strong> palette on the left to insert blocks, or pick one of the 5 example projects. Grammar diagnostics advise you — they never block.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3 bg-[#0f1117] p-3.5 rounded-xl border border-[#2a2f42]">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center justify-center shrink-0 font-bold text-sm">2</div>
              <div className="space-y-0.5">
                <div className="font-semibold text-white">Pick your target stack</div>
                <p className="text-gray-400 leading-relaxed">Rust, Python, Go, C++… or 🌐 Polyglot and let the architect choose. Configure the LLM engine in ⚙️ Settings (cloud key, local Ollama or LM Studio).</p>
              </div>
            </div>

            <div className="flex items-start space-x-3 bg-[#0f1117] p-3.5 rounded-xl border border-[#2a2f42]">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center justify-center shrink-0 font-bold text-sm">3</div>
              <div className="space-y-0.5">
                <div className="font-semibold text-white">Generate, run & self-heal</div>
                <p className="text-gray-400 leading-relaxed">Press <strong className="text-cyan-300">Generate</strong> (or <strong className="text-cyan-300">Ctrl+Enter</strong>) to run the 2-pass generator, inspect files in 📂 Project Files, then <strong className="text-cyan-300">Run</strong> them in the embedded terminal — the 🤖 agent auto-fixes errors for you.</p>
              </div>
            </div>
          </div>

          {/* Quick tips */}
          <div className="bg-[#0f1117] border border-[#2a2f42] rounded-xl p-3.5 space-y-1.5 text-[11px] text-gray-400">
            <div className="flex items-center space-x-2"><Keyboard size={13} className="text-cyan-400 shrink-0" /><span><strong className="text-gray-200">Ctrl+Enter</strong> — Generate from anywhere</span></div>
            <div className="flex items-center space-x-2"><Keyboard size={13} className="text-cyan-400 shrink-0" /><span><strong className="text-gray-200">F12 / Ctrl+Click</strong> — go-to-definition on IPL symbols</span></div>
            <div className="flex items-center space-x-2"><GraduationCap size={13} className="text-cyan-400 shrink-0" /><span><strong className="text-gray-200">IPL Tutorial</strong> — interactive step-by-step lesson in the navbar</span></div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-[#2a2f42] bg-[#0f1117] flex items-center justify-between shrink-0">
          <button
            onClick={() => { dismiss(); toggleTutorial(); }}
            className="flex items-center space-x-1.5 px-3 py-2 bg-cyan-950/40 hover:bg-cyan-900/50 text-cyan-300 rounded-lg border border-cyan-500/40 text-xs font-semibold transition-all"
          >
            <GraduationCap size={14} className="text-cyan-400" />
            <span>Take the IPL Tutorial</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => { dismiss(); toggleProjectModal(); }}
              className="flex items-center space-x-1.5 px-3 py-2 bg-[#161922] hover:bg-[#2a2f42] text-gray-300 rounded-lg border border-[#2a2f42] text-xs font-semibold transition-colors"
            >
              <FolderPlus size={14} />
              <span>New Project</span>
            </button>

            <button
              onClick={dismiss}
              className="flex items-center space-x-1.5 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-bold rounded-lg text-xs transition-all shadow-lg shadow-cyan-500/20 active:scale-95"
            >
              <Rocket size={14} className="fill-current" />
              <span>Start Building</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
