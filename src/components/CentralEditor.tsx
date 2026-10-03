import React from 'react';
import { useIdeStore } from '../store/useIdeStore';
import { IplMonacoEditor } from './IplMonacoEditor';
import { BlockViewEditor } from './BlockViewEditor';
import { ArtifactFileEditor } from './ArtifactFileEditor';

/**
 * The single central editing surface. It shows the SOURCE document (IPL) or an
 * ARTIFACT file depending on what is selected — the left panel only navigates.
 * In source mode, the Code / Blocks toggle (now in the Sources panel) picks the
 * representation.
 */
export const CentralEditor: React.FC = () => {
  const { editingTarget, editorViewMode } = useIdeStore();
  if (editingTarget === 'artifact') return <ArtifactFileEditor />;
  return editorViewMode === 'blocks' ? <BlockViewEditor /> : <IplMonacoEditor />;
};
