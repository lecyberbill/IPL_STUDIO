import React, { useEffect } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { useIdeStore } from '../store/useIdeStore';
import { IPL_LANGUAGE_DEFINITION, IPL_VERBS, extractIPLSymbols } from '../engine/iplGrammar';
import { Code, AlertTriangle } from 'lucide-react';

export const IplMonacoEditor: React.FC = () => {
  const { code, setCode, setEditorInstance, syntaxErrors } = useIdeStore();
  const monacoInstance = useMonaco();

  // Initialisation du langage IPL dans Monaco
  useEffect(() => {
    if (monacoInstance) {
      // Enregistrement du langage s'il n'existe pas déjà
      const languages = monacoInstance.languages.getLanguages();
      if (!languages.some(lang => lang.id === 'ipl')) {
        monacoInstance.languages.register({ id: 'ipl' });

        // Configuration Monarch Tokénizer pour la coloration syntaxique des 12 verbes
        monacoInstance.languages.setMonarchTokensProvider('ipl', IPL_LANGUAGE_DEFINITION as any);

        // 1. Autocomplétion intelligente des verbes et snippets à la frappe
        monacoInstance.languages.registerCompletionItemProvider('ipl', {
          provideCompletionItems: (model, position) => {
            const word = model.getWordUntilPosition(position);
            const range = {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: word.startColumn,
              endColumn: word.endColumn
            };

            const suggestions: monaco.languages.CompletionItem[] = IPL_VERBS.map(verb => ({
              label: verb.name,
              kind: monacoInstance.languages.CompletionItemKind.Keyword,
              documentation: `${verb.description}\nExemple: ${verb.example}`,
              insertText: verb.snippet,
              insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              range
            }));

            // Proposer également les symboles déclarés dans le script
            const currentCode = model.getValue();
            const symbols = extractIPLSymbols(currentCode);
            symbols.forEach(sym => {
              suggestions.push({
                label: sym.name,
                kind: monacoInstance.languages.CompletionItemKind.Variable,
                documentation: `Symbole IPL (${sym.kind}) déclaré à la ligne ${sym.line}`,
                insertText: sym.name,
                range
              });
            });

            return { suggestions };
          }
        });

        // 2. Hover Provider (Info-Bulles d'informations sémantiques au survol)
        monacoInstance.languages.registerHoverProvider('ipl', {
          provideHover: (model, position) => {
            const word = model.getWordAtPosition(position);
            if (!word) return null;

            const verbMatch = IPL_VERBS.find(v => v.name === word.word);
            if (verbMatch) {
              return {
                contents: [
                  { value: `**Verbe IPL : \`${verbMatch.name}\`** (${verbMatch.category.toUpperCase()})` },
                  { value: verbMatch.description },
                  { value: `\`\`\`ipl\n${verbMatch.snippet}\n\`\`\`` }
                ]
              };
            }

            const symbols = extractIPLSymbols(model.getValue());
            const symMatch = symbols.find(s => s.name === word.word);
            if (symMatch) {
              return {
                contents: [
                  { value: `**Entité IPL : \`${symMatch.name}\`** (\`${symMatch.kind}\`)` },
                  { value: `Déclaré à la ligne ${symMatch.line}, colonne ${symMatch.column}` }
                ]
              };
            }

            return null;
          }
        });

        // 3. Go to Definition Provider (Aller à la Définition - F12 / Ctrl+Clic)
        monacoInstance.languages.registerDefinitionProvider('ipl', {
          provideDefinition: (model, position) => {
            const word = model.getWordAtPosition(position);
            if (!word) return null;

            const symbols = extractIPLSymbols(model.getValue());
            const symMatch = symbols.find(s => s.name === word.word);
            if (symMatch) {
              return {
                uri: model.uri,
                range: {
                  startLineNumber: symMatch.line,
                  startColumn: symMatch.column,
                  endLineNumber: symMatch.line,
                  endColumn: symMatch.column + symMatch.name.length
                }
              };
            }

            return null;
          }
        });

        // Thème sombre personnalisé Atelier Dark
        monacoInstance.editor.defineTheme('atelier-dark', {
          base: 'vs-dark',
          inherit: true,
          rules: [
            { token: 'keyword', foreground: '38bdf8', fontStyle: 'bold' }, // verbes IPL cyan
            { token: 'type', foreground: 'c084fc' }, // types violet
            { token: 'string', foreground: '34d399' }, // chaînes vert
            { token: 'number', foreground: 'fbbf24' }, // nombres ambre
            { token: 'delimiter', foreground: '9ca3af' },
            { token: 'comment', foreground: '6b7280', fontStyle: 'italic' }
          ],
          colors: {
            'editor.background': '#12141c',
            'editor.foreground': '#f3f4f6',
            'editor.lineHighlightBackground': '#1a1d29',
            'editorCursor.foreground': '#38bdf8',
            'editorWhitespace.foreground': '#2a2f42',
            'editorIndentGuide.background': '#1f2434',
            'editorIndentGuide.activeBackground': '#38bdf8'
          }
        });
      }

      monacoInstance.editor.setTheme('atelier-dark');
    }
  }, [monacoInstance]);

  // Synchronisation des marqueurs d'erreurs de syntaxe
  useEffect(() => {
    if (monacoInstance) {
      const editorModel = monacoInstance.editor.getModels()[0];
      if (editorModel) {
        const markers: monaco.editor.IMarkerData[] = syntaxErrors.map(err => ({
          startLineNumber: err.line,
          startColumn: err.column,
          endLineNumber: err.line,
          endColumn: err.column + 10,
          message: err.message,
          severity: monacoInstance.MarkerSeverity.Error
        }));
        monacoInstance.editor.setModelMarkers(editorModel, 'ipl-syntax', markers);
      }
    }
  }, [monacoInstance, syntaxErrors]);

  const handleEditorDidMount = (editor: monaco.editor.IStandaloneCodeEditor) => {
    setEditorInstance(editor);

    // Support du Drag & Drop HTML5 de snippets directement dans Monaco
    const domNode = editor.getDomNode();
    if (domNode) {
      domNode.addEventListener('dragover', (e: DragEvent) => {
        e.preventDefault();
      });

      domNode.addEventListener('drop', (e: DragEvent) => {
        e.preventDefault();
        const snippetText = e.dataTransfer?.getData('text/plain');
        if (snippetText) {
          const target = editor.getTargetAtClientPoint(e.clientX, e.clientY);
          if (target && target.position) {
            editor.executeEdits('drag-drop-insert', [
              {
                range: new monaco.Range(
                  target.position.lineNumber,
                  target.position.column,
                  target.position.lineNumber,
                  target.position.column
                ),
                text: `${snippetText}\n`,
                forceMoveMarkers: true
              }
            ]);
            editor.focus();
          }
        }
      });
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#12141c] relative select-none">
      {/* Editor Header Bar */}
      <div className="h-10 bg-[#161922] border-b border-[#2a2f42] px-4 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Code size={16} className="text-cyan-400" />
          <span className="font-semibold text-white text-xs">Éditeur Intentionnel IPL (Monaco LSP Active)</span>
          <span className="text-[10px] bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded border border-cyan-500/30 font-mono">
            F12 Go to Def • Survol Info
          </span>
        </div>

        {syntaxErrors.length > 0 && (
          <div className="flex items-center space-x-1 text-rose-400 text-xs font-medium bg-rose-500/10 px-2.5 py-0.5 rounded border border-rose-500/20">
            <AlertTriangle size={13} />
            <span>{syntaxErrors.length} Erreur(s)</span>
          </div>
        )}
      </div>

      {/* Main Monaco Instance */}
      <div className="flex-1 overflow-hidden">
        <Editor
          height="100%"
          language="ipl"
          theme="atelier-dark"
          value={code}
          onChange={(val) => setCode(val || '')}
          onMount={handleEditorDidMount}
          options={{
            fontSize: 13,
            fontFamily: 'Fira Code, Menlo, Monaco, Consolas, monospace',
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            lineNumbers: 'on',
            renderLineHighlight: 'all',
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            smoothScrolling: true,
            matchBrackets: 'always',
            autoClosingBrackets: 'always',
            formatOnType: true,
            suggestOnTriggerCharacters: true
          }}
        />
      </div>
    </div>
  );
};
