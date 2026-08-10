import * as monaco from 'monaco-editor';
import type { TargetLanguage } from '../../engine/llmGenerator';
import type { SyntaxErrorItem, IPLVerb } from '../../engine/iplGrammar';
import { validateIPLCode } from '../../engine/iplGrammar';
import type { StoreSlice } from '../types';

export interface EditorSlice {
  code: string;
  targetLang: TargetLanguage;
  editorViewMode: 'text' | 'blocks';
  syntaxErrors: SyntaxErrorItem[];
  editorInstance: monaco.editor.IStandaloneCodeEditor | null;
  setCode: (newCode: string) => void;
  setTargetLang: (lang: TargetLanguage) => void;
  setEditorViewMode: (mode: 'text' | 'blocks') => void;
  setEditorInstance: (editor: monaco.editor.IStandaloneCodeEditor | null) => void;
  insertVerbSnippet: (verb: IPLVerb) => void;
  insertSnippetText: (snippetText: string, label?: string) => void;
}

export const editorSlice: StoreSlice<EditorSlice> = (set, get) => ({
  code: '',
  targetLang: 'python',
  editorViewMode: 'text',
  syntaxErrors: [],
  editorInstance: null,

  setCode: (newCode: string) => {
    const errors = validateIPLCode(newCode);
    const { activeProjectId, projects } = get();
    const activeProj = projects.find(p => p.id === activeProjectId);

    // Update the active project's code in the projects list, and keep the
    // per-file map in sync so imported modules reflect the live editor
    // buffer (Phase 7: sourceFiles[activeSourceFile] must track edits).
    const updatedProjects = projects.map(p => {
      if (p.id !== activeProjectId) return p;
      const patch: { code: string; updatedAt: string; sourceFiles?: Record<string, string> } = {
        code: newCode,
        updatedAt: new Date().toLocaleTimeString()
      };
      if (activeProj?.sourceFiles) {
        const activeFile = activeProj.activeSourceFile || 'main.ipl';
        patch.sourceFiles = { ...activeProj.sourceFiles, [activeFile]: newCode };
      }
      return { ...p, ...patch };
    });

    set({ code: newCode, syntaxErrors: errors, projects: updatedProjects });
  },

  setTargetLang: (targetLang) => {
    const { activeProjectId, projects } = get();
    const updatedProjects = projects.map(p =>
      p.id === activeProjectId ? { ...p, targetLang } : p
    );

    set({ targetLang, projects: updatedProjects });
    get().addLog(`Project generation target changed to: ${targetLang.toUpperCase()}`, 'info');
  },

  setEditorViewMode: (editorViewMode) => set({ editorViewMode }),
  setEditorInstance: (editorInstance) => set({ editorInstance }),

  insertVerbSnippet: (verb) => {
    const editor = get().editorInstance;
    if (!editor) {
      const currentCode = get().code;
      get().setCode(`${currentCode}\n\n${verb.snippet}`);
      get().addLog(`Snippet ${verb.name} inserted at end of document`, 'warn');
      return;
    }

    const selection = editor.getSelection() || new monaco.Selection(1, 1, 1, 1);
    const model = editor.getModel();

    // Calcul de l'indentation de la ligne courante du curseur
    const lineContent = model ? model.getLineContent(selection.startLineNumber) : '';
    const indentMatch = lineContent.match(/^\s*/);
    const currentIndent = indentMatch ? indentMatch[0] : '';

    // Indent each snippet line so it nests cleanly
    const indentedSnippet = verb.snippet
      .split('\n')
      .map((line, idx) => (idx === 0 ? line : currentIndent + line))
      .join('\n');

    editor.executeEdits('ipl-palette-insert', [
      {
        range: selection,
        text: indentedSnippet,
        forceMoveMarkers: true
      }
    ]);

    editor.focus();
    get().addLog(`Verb block "${verb.name}" inserted at cursor (Ctrl+Z enabled)`, 'success');
  },

  insertSnippetText: (snippetText, label) => {
    const editor = get().editorInstance;
    if (!editor) {
      const currentCode = get().code;
      get().setCode(`${currentCode} ${snippetText}`);
      get().addLog(`Type "${label || snippetText}" inserted.`, 'info');
      return;
    }

    const selection = editor.getSelection() || new monaco.Selection(1, 1, 1, 1);
    editor.executeEdits('ipl-type-insert', [
      {
        range: selection,
        text: snippetText,
        forceMoveMarkers: true
      }
    ]);
    editor.focus();
    get().addLog(`Intent type "${label || snippetText}" inserted at cursor position`, 'info');
  }
});
