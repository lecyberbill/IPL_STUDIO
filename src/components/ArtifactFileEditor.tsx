import React from 'react';
import Editor from '@monaco-editor/react';
import { useIdeStore } from '../store/useIdeStore';
import { parseMultiFileXml } from '../engine/artifactGenerator';
import { FileCode, AlertCircle } from 'lucide-react';

function getLanguageFromFilename(filename?: string): string {
  if (!filename) return 'plaintext';
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'js': case 'jsx': case 'mjs': return 'javascript';
    case 'ts': case 'tsx': return 'typescript';
    case 'py': return 'python';
    case 'rs': return 'rust';
    case 'go': return 'go';
    case 'cpp': case 'c': case 'h': case 'hpp': return 'cpp';
    case 'html': case 'htm': return 'html';
    case 'css': return 'css';
    case 'json': return 'json';
    case 'yaml': case 'yml': return 'yaml';
    case 'md': return 'markdown';
    case 'bat': case 'cmd': return 'bat';
    case 'sh': case 'bash': return 'shell';
    case 'ipl': return 'ipl';
    default: return 'plaintext';
  }
}

/**
 * The central editor in ARTIFACT mode: edits the selected artifact file in place
 * (writes back into `generatedCode`). This is the single editing surface — the
 * Artifact panel is now just a manager/list.
 */
export const ArtifactFileEditor: React.FC = () => {
  const { generatedCode, selectedFilePath, setArtifactFileContent } = useIdeStore();
  const files = parseMultiFileXml(generatedCode || '');
  const file = files.find(f => f.relativePath === selectedFilePath) || files[0];

  if (!file) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-500 bg-[#12141c]">
        <AlertCircle size={28} className="text-gray-600 mb-2" />
        <p className="text-xs text-gray-400">No artifact file selected.</p>
        <p className="text-[11px] text-gray-500 mt-1">Generate a project, or pick a file in the Artifact tab.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#12141c]">
      <div className="h-10 bg-[#161922] border-b border-[#2a2f42] px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2 min-w-0">
          <FileCode size={16} className="text-cyan-400 shrink-0" />
          <span className="font-semibold text-white text-xs truncate">Artifact: {file.relativePath}</span>
          <span className="text-[10px] bg-emerald-500/15 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30 font-mono shrink-0">editable</span>
        </div>
        <span className="text-[10px] text-gray-500 font-mono shrink-0">{file.content.length} chars</span>
      </div>
      <div className="flex-1 overflow-hidden">
        <Editor
          height="100%"
          language={getLanguageFromFilename(file.relativePath)}
          theme="vs-dark"
          value={file.content}
          onChange={(val) => setArtifactFileContent(file.relativePath, val || '')}
          options={{
            fontSize: 12,
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            lineNumbers: 'on',
            renderWhitespace: 'selection',
            fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace"
          }}
        />
      </div>
    </div>
  );
};
