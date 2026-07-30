import React, { useState } from 'react';
import { useIdeStore } from '../store/useIdeStore';
import type { IPLVerb } from '../engine/iplGrammar';
import { IPL_VERBS } from '../engine/iplGrammar';
import { 
  Boxes, 
  Code, 
  GripVertical, 
  Trash2, 
  Sparkles, 
  Plus, 
  Edit3, 
  Check, 
  CornerDownRight
} from 'lucide-react';

export interface IPLBlockNode {
  id: string;
  verbName?: string;
  category: 'data' | 'action' | 'control' | 'flow' | 'expression';
  headerText: string;
  children: IPLBlockNode[];
}

/**
 * Parser de code IPL vers une structure d'arbre de blocs récursive
 */
export function parseIPLToTree(source: string): IPLBlockNode[] {
  const lines = source.split('\n');
  const root: IPLBlockNode[] = [];
  const stack: IPLBlockNode[] = [];
  let idCounter = 0;

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) return;

    if (trimmed === '}' && stack.length > 0) {
      stack.pop();
      return;
    }

    const firstWord = trimmed.split(' ')[0];
    const foundVerb = IPL_VERBS.find(v => v.name === firstWord);
    const isContainerHeader = trimmed.endsWith('{');
    const headerText = isContainerHeader ? trimmed.slice(0, -1).trim() : trimmed;

    const newNode: IPLBlockNode = {
      id: `node-${Date.now()}-${idCounter++}`,
      verbName: foundVerb?.name,
      category: foundVerb ? foundVerb.category : 'expression',
      headerText,
      children: []
    };

    if (stack.length === 0) {
      root.push(newNode);
    } else {
      stack[stack.length - 1].children.push(newNode);
    }

    if (isContainerHeader) {
      stack.push(newNode);
    }
  });

  return root;
}

/**
 * Sérialiseur de l'arbre de blocs récursif vers le code texte IPL v1.0
 */
export function treeToIPLCode(nodes: IPLBlockNode[], indentLevel = 0): string {
  const indent = '  '.repeat(indentLevel);
  
  return nodes.map(node => {
    const cleanHeader = node.headerText.replace(/\{$/, '').trim();
    const isControlOrLoop = node.verbName === 'if' || node.verbName === 'for' || node.verbName === 'try' || node.verbName === 'listen' || node.category === 'control';

    if (node.children.length > 0 || isControlOrLoop) {
      const innerCode = node.children.length > 0 
        ? treeToIPLCode(node.children, indentLevel + 1)
        : `${indent}  // Brique d'action imbriquée`;
      return `${indent}${cleanHeader} {\n${innerCode}\n${indent}}`;
    } else {
      return `${indent}${cleanHeader}`;
    }
  }).join('\n\n');
}

export const BlockViewEditor: React.FC = () => {
  const { code, setCode, setEditorViewMode, addLog } = useIdeStore();
  const [tree, setTree] = useState<IPLBlockNode[]>(() => parseIPLToTree(code));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>('');

  // Synchronisation et mise à jour globale du code IPL
  const updateTreeAndCode = (newTree: IPLBlockNode[]) => {
    setTree(newTree);
    const newIPLCode = treeToIPLCode(newTree);
    setCode(newIPLCode);
  };

  // Ajout d'une sous-brique imbriquée dans un bloc parent
  const handleAddChild = (parentId: string, verb?: IPLVerb) => {
    const snippetToAdd = verb ? verb.snippet.split('\n')[0] : 'compute result = true';
    const firstWord = snippetToAdd.split(' ')[0];
    const foundVerb = IPL_VERBS.find(v => v.name === firstWord);

    const childNode: IPLBlockNode = {
      id: `node-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      verbName: foundVerb?.name || verb?.name,
      category: foundVerb?.category || verb?.category || 'action',
      headerText: snippetToAdd.replace(/\{$/, '').trim(),
      children: []
    };

    const addRecursive = (nodes: IPLBlockNode[]): IPLBlockNode[] => {
      return nodes.map(node => {
        if (node.id === parentId) {
          return { ...node, children: [...node.children, childNode] };
        }
        if (node.children.length > 0) {
          return { ...node, children: addRecursive(node.children) };
        }
        return node;
      });
    };

    const updated = addRecursive(tree);
    updateTreeAndCode(updated);
    addLog(`Brique "${childNode.verbName || 'action'}" imbriquée dans le conteneur parent.`, 'success');
  };

  // Suppression d'une brique
  const handleDeleteNode = (id: string) => {
    const deleteRecursive = (nodes: IPLBlockNode[]): IPLBlockNode[] => {
      return nodes.filter(n => n.id !== id).map(n => ({
        ...n,
        children: deleteRecursive(n.children)
      }));
    };

    const updated = deleteRecursive(tree);
    updateTreeAndCode(updated);
    addLog(`Brique AST supprimée.`, 'warn');
  };

  // Sauvegarde de l'édition texte d'une brique
  const handleSaveEdit = (id: string) => {
    const editRecursive = (nodes: IPLBlockNode[]): IPLBlockNode[] => {
      return nodes.map(n => {
        if (n.id === id) {
          return { ...n, headerText: editingText };
        }
        if (n.children.length > 0) {
          return { ...n, children: editRecursive(n.children) };
        }
        return n;
      });
    };

    const updated = editRecursive(tree);
    updateTreeAndCode(updated);
    setEditingId(null);
  };

  // Dépôt direct sur la Drop Zone d'un bloc conteneur
  const handleDropOnContainer = (e: React.DragEvent, parentId: string) => {
    e.preventDefault();
    e.stopPropagation();

    const snippet = e.dataTransfer.getData('text/plain');
    if (snippet) {
      const firstLine = snippet.split('\n')[0].replace(/\{$/, '').trim();
      const firstWord = firstLine.split(' ')[0];
      const foundVerb = IPL_VERBS.find(v => v.name === firstWord);

      const newNode: IPLBlockNode = {
        id: `node-drop-${Date.now()}`,
        verbName: foundVerb?.name,
        category: foundVerb?.category || 'action',
        headerText: firstLine,
        children: []
      };

      const addRecursive = (nodes: IPLBlockNode[]): IPLBlockNode[] => {
        return nodes.map(node => {
          if (node.id === parentId) {
            return { ...node, children: [...node.children, newNode] };
          }
          if (node.children.length > 0) {
            return { ...node, children: addRecursive(node.children) };
          }
          return node;
        });
      };

      const updated = addRecursive(tree);
      updateTreeAndCode(updated);
      addLog(`Brique déposée et imbriquée avec succès !`, 'success');
    }
  };

  // Couleurs de briques Atelier Dark par catégorie
  const categoryStyles: Record<string, { bg: string, border: string, text: string, accent: string }> = {
    data: { bg: 'bg-sky-950/40', border: 'border-sky-500/50', text: 'text-sky-300', accent: 'bg-sky-500' },
    action: { bg: 'bg-purple-950/40', border: 'border-purple-500/50', text: 'text-purple-300', accent: 'bg-purple-500' },
    control: { bg: 'bg-amber-950/40', border: 'border-amber-500/50', text: 'text-amber-300', accent: 'bg-amber-500' },
    flow: { bg: 'bg-rose-950/40', border: 'border-rose-500/50', text: 'text-rose-300', accent: 'bg-rose-500' },
    expression: { bg: 'bg-[#161922]', border: 'border-gray-700', text: 'text-gray-200', accent: 'bg-gray-500' }
  };

  // Rendu Récursif d'une brique et de ses sous-briques imbriquées
  const renderBlockNode = (node: IPLBlockNode, depth = 0) => {
    const style = categoryStyles[node.category] || categoryStyles.expression;
    const isEditing = editingId === node.id;
    const isContainer = node.category === 'control' || node.verbName === 'for' || node.verbName === 'if' || node.verbName === 'try' || node.verbName === 'listen' || node.children.length > 0;

    return (
      <div 
        key={node.id}
        className={`relative my-2 rounded-xl border ${style.border} ${style.bg} p-3 transition-all duration-150 shadow-lg`}
        style={{ marginLeft: `${depth * 14}px` }}
      >
        {/* En-tête de la Brique */}
        <div className="flex items-center justify-between font-mono text-xs">
          <div className="flex items-center space-x-2.5 flex-1 pr-2">
            <div className="cursor-grab active:cursor-grabbing p-1 text-gray-500 hover:text-white rounded hover:bg-black/30">
              <GripVertical size={16} />
            </div>

            {node.verbName && (
              <span className={`font-bold uppercase text-[10px] px-2 py-0.5 rounded ${style.accent} text-black shadow-sm font-mono`}>
                {node.verbName}
              </span>
            )}

            {isEditing ? (
              <div className="flex items-center space-x-2 flex-1">
                <input
                  type="text"
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  className="bg-black/60 border border-cyan-400 text-cyan-200 rounded px-2 py-0.5 text-xs font-mono w-full focus:outline-none"
                  autoFocus
                />
                <button
                  onClick={() => handleSaveEdit(node.id)}
                  className="p-1 text-emerald-400 hover:bg-black/40 rounded"
                >
                  <Check size={14} />
                </button>
              </div>
            ) : (
              <span className="font-semibold text-gray-100 tracking-wide text-xs">{node.headerText}</span>
            )}
          </div>

          {/* Actions de Brique */}
          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => {
                setEditingId(node.id);
                setEditingText(node.headerText);
              }}
              className="p-1 text-gray-400 hover:text-white hover:bg-black/30 rounded"
              title="Éditer le texte de la brique"
            >
              <Edit3 size={13} />
            </button>

            <button
              onClick={() => handleDeleteNode(node.id)}
              className="p-1 text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
              title="Supprimer la brique"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* Zone Imbriquée (Enfants de la Brique Conteneur) */}
        {isContainer && (
          <div className="mt-3 pl-3 border-l-2 border-dashed border-cyan-500/40 space-y-2">
            {node.children.length > 0 && (
              <div className="space-y-2">
                {node.children.map(child => renderBlockNode(child, 0))}
              </div>
            )}

            {/* Zone de Dépôt Interactive (Drop Zone) */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDropOnContainer(e, node.id)}
              className="group/drop py-2.5 px-3 rounded-lg border-2 border-dashed border-cyan-500/30 hover:border-cyan-400 bg-cyan-950/20 hover:bg-cyan-950/40 text-cyan-400 text-xs flex items-center justify-between cursor-pointer transition-all"
            >
              <div className="flex items-center space-x-2">
                <CornerDownRight size={14} className="text-cyan-400 group-hover/drop:translate-x-0.5 transition-transform" />
                <span className="font-mono text-[11px]">📥 Glissez-déposez une brique du panneau gauche ICI pour l'imbriquer</span>
              </div>

              <button
                type="button"
                onClick={() => handleAddChild(node.id)}
                className="flex items-center space-x-1 px-2 py-0.5 bg-cyan-500/20 hover:bg-cyan-500/40 text-cyan-300 rounded font-semibold text-[10px] border border-cyan-500/30"
              >
                <Plus size={12} />
                <span>+ Sous-Brique</span>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 bg-[#12141c] p-4 overflow-y-auto flex flex-col h-full select-none">
      {/* Header bar */}
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#2a2f42]">
        <div className="flex items-center space-x-2">
          <Boxes size={18} className="text-purple-400" />
          <h2 className="text-sm font-semibold text-white">Éditeur Visuel de Briques Imbriquées (Mode Atelier AST)</h2>
        </div>

        <button
          onClick={() => setEditorViewMode('text')}
          className="flex items-center space-x-1.5 text-xs text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 px-3 py-1.5 rounded-md border border-cyan-500/30 transition-colors"
        >
          <Code size={14} />
          <span>Revenir à l'éditeur texte Monaco</span>
        </button>
      </div>

      {/* Helper Banner */}
      <div className="mb-3 p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-xl text-xs text-cyan-300 flex items-center justify-between font-sans shadow-md">
        <div className="flex items-center space-x-2.5">
          <Sparkles size={16} className="text-cyan-400 shrink-0" />
          <span>
            Glissez des verbes depuis le panneau de gauche <strong>directement dans la zone pointillée "📥 Glissez-déposez"</strong> de n'importe quel bloc boucle/condition pour les imbriquer !
          </span>
        </div>
        <button
          onClick={() => {
            const parsed = parseIPLToTree(code);
            setTree(parsed);
            addLog('Arbre de briques réactualisé depuis le code texte.', 'info');
          }}
          className="px-2.5 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 rounded text-[10px] font-mono text-cyan-200"
        >
          Réactualiser Arbre
        </button>
      </div>

      {/* Main Blocks Canvas */}
      <div className="flex-1 bg-[#0f1117] border border-[#2a2f42] rounded-2xl p-5 overflow-y-auto font-sans shadow-inner space-y-3">
        {tree.length > 0 ? (
          tree.map(node => renderBlockNode(node))
        ) : (
          <div className="text-center py-20 text-gray-500 text-xs font-mono">
            Aucun bloc d'intention IPL dans ce projet. Déposez une brique depuis la palette de gauche pour commencer.
          </div>
        )}
      </div>
    </div>
  );
};
