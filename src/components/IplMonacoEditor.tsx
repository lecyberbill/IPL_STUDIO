import React, { useEffect } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { useIdeStore } from '../store/useIdeStore';
import { IPL_LANGUAGE_DEFINITION, IPL_VERBS, extractIPLSymbols } from '../engine/iplGrammar';
import type { SyntaxErrorItem } from '../engine/iplGrammar';
import { Code, AlertTriangle } from 'lucide-react';

let currentIplDiagnostics: SyntaxErrorItem[] = [];
let iplCodeActionProviderRegistered = false;

export const IplMonacoEditor: React.FC = () => {
  const { code, setCode, setEditorInstance, syntaxErrors } = useIdeStore();
  const monacoInstance = useMonaco();

  // Initialisation du langage IPL dans Monaco
  useEffect(() => {
    if (monacoInstance) {
      // Register the language if it does not already exist
      const languages = monacoInstance.languages.getLanguages();
      if (!languages.some(lang => lang.id === 'ipl')) {
        monacoInstance.languages.register({ id: 'ipl' });

        // Monarch tokenizer config for syntax highlighting of the 12 verbs
        monacoInstance.languages.setMonarchTokensProvider('ipl', IPL_LANGUAGE_DEFINITION as any);

        // 1. Smart autocompletion of verbs and snippets while typing
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

            // Also suggest the human intent types (text, number, boolean, id, date, options)
            const intentTypes = [
              { name: 'text', doc: 'Human Intent Type: Text string or email' },
              { name: 'number', doc: 'Human Intent Type: Amount, price, score, or count' },
              { name: 'boolean', doc: 'Human Intent Type: True/false condition or flag' },
              { name: 'id', doc: 'Human Intent Type: Unique identifier or UUID' },
              { name: 'date', doc: 'Human Intent Type: Timestamp or date' },
              { name: 'options("a", "b")', doc: 'Human Intent Type: Choice list or Enum' }
            ];

            intentTypes.forEach(t => {
              suggestions.push({
                label: t.name,
                kind: monacoInstance.languages.CompletionItemKind.TypeParameter,
                documentation: t.doc,
                insertText: t.name,
                range
              });
            });

            // Also suggest symbols declared in the script
            const currentCode = model.getValue();
            const symbols = extractIPLSymbols(currentCode);
            symbols.forEach(sym => {
              suggestions.push({
                label: sym.name,
                kind: monacoInstance.languages.CompletionItemKind.Variable,
                documentation: `IPL symbol (${sym.kind}) declared at line ${sym.line}`,
                insertText: sym.name,
                range
              });
            });

            return { suggestions };
          }
        });

        // 2. Hover Provider (semantic info tooltips)
        monacoInstance.languages.registerHoverProvider('ipl', {
          provideHover: (model, position) => {
            const word = model.getWordAtPosition(position);
            if (!word) return null;

            const verbMatch = IPL_VERBS.find(v => v.name === word.word);
            if (verbMatch) {
              return {
                contents: [
                  { value: `**IPL verb: \`${verbMatch.name}\`** (${verbMatch.category.toUpperCase()})` },
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
                  { value: `**IPL entity: \`${symMatch.name}\`** (\`${symMatch.kind}\`)` },
                  { value: `Declared at line ${symMatch.line}, column ${symMatch.column}` }
                ]
              };
            }

            return null;
          }
        });

        // 3. Go to Definition Provider (F12 / Ctrl+Click)
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

        // 4. Quick-Fix Code Action Provider (applies the advisory fixes carried by soft diagnostics)
        if (!iplCodeActionProviderRegistered) {
          iplCodeActionProviderRegistered = true;
          monacoInstance.languages.registerCodeActionProvider('ipl', {
            provideCodeActions: (model, range) => {
              const actions: monaco.languages.CodeAction[] = [];
              for (const d of currentIplDiagnostics) {
                if (!d.fix) continue;
                const startLine = d.line;
                const startCol = d.column;
                const endCol = d.endColumn ?? startCol + d.message.length;
                const overlaps = !(
                  range.endLineNumber < startLine ||
                  range.startLineNumber > startLine ||
                  range.startColumn > endCol ||
                  range.endColumn < startCol
                );
                if (!overlaps) continue;
                actions.push({
                  title: d.fix.label,
                  kind: 'quickfix',
                  diagnostics: [{
                    startLineNumber: startLine,
                    startColumn: startCol,
                    endLineNumber: startLine,
                    endColumn: endCol,
                    message: d.message,
                    severity: d.severity === 'warning' ? monacoInstance.MarkerSeverity.Warning : monacoInstance.MarkerSeverity.Info
                  }],
                  edit: {
                    edits: [{
                      resource: model.uri,
                      textEdit: {
                        range: new monaco.Range(startLine, startCol, startLine, endCol),
                        text: d.fix.newText
                      },
                      versionId: undefined
                    }]
                  }
                });
              }
              return { actions, dispose: () => {} };
            }
          });
        }

        // Custom dark theme: Atelier Dark
        monacoInstance.editor.defineTheme('atelier-dark', {
          base: 'vs-dark',
          inherit: true,
          rules: [
            { token: 'keyword', foreground: '38bdf8', fontStyle: 'bold' }, // IPL verbs cyan
            { token: 'type', foreground: 'c084fc' }, // types purple
            { token: 'string', foreground: '34d399' }, // strings green
            { token: 'number', foreground: 'fbbf24' }, // numbers amber
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

  // Sync advisory markers with Monaco
  useEffect(() => {
    if (monacoInstance) {
      currentIplDiagnostics = syntaxErrors;
      const editorModel = monacoInstance.editor.getModels()[0];
      if (editorModel) {
        const markers: monaco.editor.IMarkerData[] = syntaxErrors.map(err => ({
          startLineNumber: err.line,
          startColumn: err.column,
          endLineNumber: err.line,
          endColumn: err.endColumn ?? err.column + err.message.length,
          message: err.message,
          severity: err.severity === 'warning'
            ? monacoInstance.MarkerSeverity.Warning
            : monacoInstance.MarkerSeverity.Info
        }));
        monacoInstance.editor.setModelMarkers(editorModel, 'ipl-syntax', markers);
      }
    }
  }, [monacoInstance, syntaxErrors]);

  const handleEditorDidMount = (editor: monaco.editor.IStandaloneCodeEditor) => {
    setEditorInstance(editor);

    // HTML5 Drag & Drop support for snippets directly into Monaco
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
          <span className="font-semibold text-white text-xs">IPL Intentional Editor (Monaco LSP Active)</span>
          <span className="text-[10px] bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded border border-cyan-500/30 font-mono">
            F12 Go to Def • Survol Info
          </span>
        </div>

        {syntaxErrors.length > 0 && (
          <div className="flex items-center space-x-1 text-amber-300 text-xs font-medium bg-amber-500/10 px-2.5 py-0.5 rounded border border-amber-500/20">
            <AlertTriangle size={13} />
            <span>{syntaxErrors.length} Advisory Check(s)</span>
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
