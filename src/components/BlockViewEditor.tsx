import React, { useMemo, useState } from 'react';
import { useIdeStore } from '../store/useIdeStore';
import type { IPLVerb } from '../engine/iplGrammar';
import { IPL_VERBS } from '../engine/iplGrammar';
import { parseIPLToTree } from '../engine/iplGrammar';
import type { IPLBlockNode } from '../engine/iplGrammar';
import { annotateBlockNodes } from '../engine/iplRefs';
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

export { parseIPLToTree };
export type { IPLBlockNode };

/**
 * Serializes the recursive block tree back to IPL v1.0 text.
 */
export function treeToIPLCode(nodes: IPLBlockNode[], indentLevel = 0): string {
  const indent = '  '.repeat(indentLevel);
  
  return nodes.map(node => {
    const cleanHeader = node.headerText.replace(/\{$/, '').trim();
    const isControlOrLoop = node.verbName === 'if' || node.verbName === 'for' || node.verbName === 'try' || node.verbName === 'listen' || node.category === 'control';

    if (node.children.length > 0 || isControlOrLoop) {
      const innerCode = node.children.length > 0 
        ? treeToIPLCode(node.children, indentLevel + 1)
        : `${indent}  // Nested action block`;
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

  // Phase 6 — semantic state (declared / produced / unknown) derived from the
  // reference index, refreshed whenever the tree or source changes.
  const semanticTree = useMemo(() => annotateBlockNodes(tree, code), [tree, code]);

  // Global sync and update of IPL code
  const updateTreeAndCode = (newTree: IPLBlockNode[]) => {
    setTree(newTree);
    const newIPLCode = treeToIPLCode(newTree);
    setCode(newIPLCode);
  };

  // Add a nested sub-block inside a parent block
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
    addLog(`Block "${childNode.verbName || 'action'}" nested inside the parent container.`, 'success');
  };

  // Delete a block
  const handleDeleteNode = (id: string) => {
    const deleteRecursive = (nodes: IPLBlockNode[]): IPLBlockNode[] => {
      return nodes.filter(n => n.id !== id).map(n => ({
        ...n,
        children: deleteRecursive(n.children)
      }));
    };

    const updated = deleteRecursive(tree);
    updateTreeAndCode(updated);
    addLog(`AST block deleted.`, 'warn');
  };

  // Save the text edit of a block
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

  // Drop directly on a container block's drop zone
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
      addLog(`Block dropped and nested successfully!`, 'success');
    }
  };

  // Atelier Dark block colors by category
  const categoryStyles: Record<string, { bg: string, border: string, text: string, accent: string }> = {
    data: { bg: 'bg-sky-950/40', border: 'border-sky-500/50', text: 'text-sky-300', accent: 'bg-sky-500' },
    action: { bg: 'bg-purple-950/40', border: 'border-purple-500/50', text: 'text-purple-300', accent: 'bg-purple-500' },
    control: { bg: 'bg-amber-950/40', border: 'border-amber-500/50', text: 'text-amber-300', accent: 'bg-amber-500' },
    flow: { bg: 'bg-rose-950/40', border: 'border-rose-500/50', text: 'text-rose-300', accent: 'bg-rose-500' },
    expression: { bg: 'bg-[#161922]', border: 'border-gray-700', text: 'text-gray-200', accent: 'bg-gray-500' }
  };

  // Phase 6 — semantic state badge styling
  const semanticStyles: Record<string, string> = {
    declared: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
    produced: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40',
    unknown: 'bg-rose-500/15 text-rose-300 border-rose-500/40'
  };

  // Recursive render of a block and its nested sub-blocks
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
        {/* Block Header */}
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

            {node.semanticState && (
              <span className={`font-semibold text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${semanticStyles[node.semanticState]}`}>
                {node.semanticState}
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

          {/* Block Actions */}
          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => {
                setEditingId(node.id);
                setEditingText(node.headerText);
              }}
              className="p-1 text-gray-400 hover:text-white hover:bg-black/30 rounded"
              title="Edit block text"
            >
              <Edit3 size={13} />
            </button>

            <button
              onClick={() => handleDeleteNode(node.id)}
              className="p-1 text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
              title="Delete block"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* Nested Zone (Container Block Children) */}
        {isContainer && (
          <div className="mt-3 pl-3 border-l-2 border-dashed border-cyan-500/40 space-y-2">
            {node.children.length > 0 && (
              <div className="space-y-2">
                {node.children.map(child => renderBlockNode(child, 0))}
              </div>
            )}

            {/* Interactive Drop Zone */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDropOnContainer(e, node.id)}
              className="group/drop py-2.5 px-3 rounded-lg border-2 border-dashed border-cyan-500/30 hover:border-cyan-400 bg-cyan-950/20 hover:bg-cyan-950/40 text-cyan-400 text-xs flex items-center justify-between cursor-pointer transition-all"
            >
              <div className="flex items-center space-x-2">
                <CornerDownRight size={14} className="text-cyan-400 group-hover/drop:translate-x-0.5 transition-transform" />
                <span className="font-mono text-[11px]">📥 Drag & drop a block from the left panel HERE to nest it</span>
              </div>

              <button
                type="button"
                onClick={() => handleAddChild(node.id)}
                className="flex items-center space-x-1 px-2 py-0.5 bg-cyan-500/20 hover:bg-cyan-500/40 text-cyan-300 rounded font-semibold text-[10px] border border-cyan-500/30"
              >
                <Plus size={12} />
                <span>+ Sub-Block</span>
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
          <h2 className="text-sm font-semibold text-white">Visual Nested-Blocks Editor (AST Workshop Mode)</h2>
        </div>

        <button
          onClick={() => setEditorViewMode('text')}
          className="flex items-center space-x-1.5 text-xs text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 px-3 py-1.5 rounded-md border border-cyan-500/30 transition-colors"
        >
          <Code size={14} />
          <span>Back to Monaco text editor</span>
        </button>
      </div>

      {/* Helper Banner */}
      <div className="mb-3 p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-xl text-xs text-cyan-300 flex items-center justify-between font-sans shadow-md">
        <div className="flex items-center space-x-2.5">
          <Sparkles size={16} className="text-cyan-400 shrink-0" />
          <span>
            Drag verbs from the left panel <strong>directly into the dashed "📥 Drag & drop" zone</strong> of any loop/condition block to nest them!
          </span>
        </div>
        <button
          onClick={() => {
            const parsed = parseIPLToTree(code);
            setTree(parsed);
            addLog('Block tree refreshed from text code.', 'info');
          }}
          className="px-2.5 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 rounded text-[10px] font-mono text-cyan-200"
        >
          Refresh Tree
        </button>
      </div>

      {/* Main Blocks Canvas */}
      <div className="flex-1 bg-[#0f1117] border border-[#2a2f42] rounded-2xl p-5 overflow-y-auto font-sans shadow-inner space-y-3">
        {semanticTree.length > 0 ? (
          semanticTree.map(node => renderBlockNode(node))
        ) : (
          <div className="text-center py-20 text-gray-500 text-xs font-mono">
            No IPL intent blocks in this project. Drop a block from the left palette to get started.
          </div>
        )}
      </div>
    </div>
  );
};
