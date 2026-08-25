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

// This file is both a component (BlockViewEditor) and the home of the block-tree
// util helpers it exports (`parseIPLToTree`, `treeToIPLCode`, `IPLBlockNode`).
// Moving them out would ripple across many consumers; disable the fast-refresh
// rule for the intentional co-location instead.
/* oxlint-disable react/only-export-components */
export { parseIPLToTree };
export type { IPLBlockNode };

/**
 * Serializes the recursive block tree back to IPL v1.0 text.
 *
 * `parseIPLToTree` models `} else {` / `} catch e {` as sibling nodes of their
 * `if` / `try` (each is its own indented block). To round-trip back to valid
 * IPL, a continuation node must merge with the closing brace of the block that
 * was just printed, instead of emitting an orphan `}`.
 */
function isBlockContinuation(headerText: string): boolean {
  return /^\}\s*(else|catch)\b/.test(headerText);
}

export function treeToIPLCode(nodes: IPLBlockNode[], indentLevel = 0): string {
  const indent = '  '.repeat(indentLevel);
  const parts: string[] = [];

  for (const node of nodes) {
    const header = node.headerText.replace(/\{$/, '').trim();
    const isControlOrLoop = node.verbName === 'if' || node.verbName === 'for' || node.verbName === 'try' || node.verbName === 'listen' || node.category === 'control';

    if (isBlockContinuation(header)) {
      // A `} else` / `} catch e` continuation at the start of a fragment has
      // no owning container here — emit it as a bare orphan line so the
      // round-trip stays lossy-but-parseable rather than crashing the printer.
      parts.push(`${indent}${header} {`);
      continue;
    }

    if (node.children.length > 0 || isControlOrLoop) {
      // Hoist any trailing continuation children (`} else` / `} catch`) so
      // they fuse with THIS container's closing brace instead of the
      // previous sibling's:  `if ... { body } else { body }`.
      let inner = node.children;
      const trailingContinuations: IPLBlockNode[] = [];
      while (inner.length > 0 && isBlockContinuation(inner[inner.length - 1].headerText)) {
        trailingContinuations.unshift(inner[inner.length - 1]);
        inner = inner.slice(0, -1);
      }

      const innerCode = inner.length > 0
        ? treeToIPLCode(inner, indentLevel + 1)
        : `${indent}  // Nested action block`;
      let block = `${indent}${header} {\n${innerCode}\n${indent}}`;

      for (const cont of trailingContinuations) {
        const contHeader = cont.headerText.replace(/^\}\s*/, '').replace(/\{$/, '').trim();
        const contChildren = cont.children;
        const contInner = contChildren.length > 0
          ? treeToIPLCode(contChildren, indentLevel + 1)
          : `${indent}  // Nested action block`;
        block = block.replace(/\n( *)\}$/, '');
        block += `\n${indent}} ${contHeader} {\n${contInner}\n${indent}}`;
      }

      parts.push(block);
    } else {
      parts.push(`${indent}${header}`);
    }
  }

  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// Block-tree mutation helpers (Phase 6 reorder / move-by-drag)
// ---------------------------------------------------------------------------

function findNode(nodes: IPLBlockNode[], id: string): IPLBlockNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findNode(n.children, id);
    if (found) return found;
  }
  return undefined;
}

function isDescendant(nodes: IPLBlockNode[], ancestorId: string, candidateId: string): boolean {
  const node = findNode(nodes, ancestorId);
  if (!node) return false;
  return !!findNode(node.children, candidateId);
}

function removeNode(nodes: IPLBlockNode[], id: string): { nodes: IPLBlockNode[]; removed: IPLBlockNode | null } {
  let removed: IPLBlockNode | null = null;
  const prune = (list: IPLBlockNode[]): IPLBlockNode[] => {
    const out: IPLBlockNode[] = [];
    for (const n of list) {
      if (n.id === id) { removed = n; continue; }
      out.push({ ...n, children: prune(n.children) });
    }
    return out;
  };
  return { nodes: prune(nodes), removed };
}

function insertRelative(
  nodes: IPLBlockNode[],
  targetId: string,
  newNode: IPLBlockNode,
  position: 'before' | 'after'
): IPLBlockNode[] {
  const ins = (list: IPLBlockNode[]): IPLBlockNode[] => {
    const out: IPLBlockNode[] = [];
    for (const n of list) {
      if (n.id === targetId) {
        if (position === 'before') out.push(newNode, n);
        else out.push(n, newNode);
      } else {
        out.push({ ...n, children: ins(n.children) });
      }
    }
    return out;
  };
  return ins(nodes);
}

function appendTo(nodes: IPLBlockNode[], containerId: string, newNode: IPLBlockNode): IPLBlockNode[] {
  return nodes.map(n => {
    if (n.id === containerId) return { ...n, children: [...n.children, newNode] };
    return { ...n, children: appendTo(n.children, containerId, newNode) };
  });
}

function createNodeFromSnippet(snippet: string, prefix = ''): IPLBlockNode {
  const firstLine = snippet.split('\n')[0].replace(/\{$/, '').trim();
  const firstWord = firstLine.split(' ')[0];
  const foundVerb = IPL_VERBS.find(v => v.name === firstWord);
  return {
    id: `${prefix}node-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    verbName: foundVerb?.name,
    category: foundVerb?.category || 'action',
    headerText: firstLine,
    children: []
  };
}

export const BlockViewEditor: React.FC = () => {
  const { code, setCode, setEditorViewMode, addLog } = useIdeStore();
  const [tree, setTree] = useState<IPLBlockNode[]>(() => parseIPLToTree(code));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: 'before' | 'after' } | null>(null);

  // Phase 6 — semantic state (declared / produced / unknown) derived from the
  // reference index, refreshed whenever the tree or source changes.
  const semanticTree = useMemo(() => annotateBlockNodes(tree, code), [tree, code]);

  // Global sync and update of IPL code
  const updateTreeAndCode = (newTree: IPLBlockNode[]) => {
    setTree(newTree);
    const newIPLCode = treeToIPLCode(newTree);
    setCode(newIPLCode);
  };

  // Drag & drop reorder: pick a block up, drop it before/after another block
  // or into a container's nest zone. Palette snippets (no block id) insert as
  // new blocks at the drop position.
  const handleBlockDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('application/x-ipl-block-id', id);
    e.dataTransfer.effectAllowed = 'move';
    setDragId(id);
  };

  const handleBlockDragEnd = () => {
    setDragId(null);
    setDropTarget(null);
  };

  const handleReorderDrop = (e: React.DragEvent, targetId: string, position: 'before' | 'after') => {
    e.preventDefault();
    e.stopPropagation();
    setDragId(null);
    setDropTarget(null);

    const blockId = e.dataTransfer.getData('application/x-ipl-block-id');
    if (blockId) {
      if (blockId === targetId || isDescendant(tree, blockId, targetId)) return;
      const { nodes, removed } = removeNode(tree, blockId);
      if (!removed) return;
      const updated = insertRelative(nodes, targetId, removed, position);
      updateTreeAndCode(updated);
      addLog(`Block "${removed.verbName || 'action'}" moved.`, 'success');
      return;
    }

    const snippet = e.dataTransfer.getData('text/plain');
    if (snippet) {
      const newNode = createNodeFromSnippet(snippet, 'node-drop-');
      const updated = insertRelative(tree, targetId, newNode, position);
      updateTreeAndCode(updated);
      addLog(`Block dropped from the palette.`, 'success');
    }
  };

  // Drop directly on a container block's drop zone (palette snippet OR existing
  // block nested into the container).
  const handleDropOnContainer = (e: React.DragEvent, parentId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragId(null);
    setDropTarget(null);

    const blockId = e.dataTransfer.getData('application/x-ipl-block-id');
    if (blockId) {
      if (blockId === parentId || isDescendant(tree, blockId, parentId)) return;
      const { nodes, removed } = removeNode(tree, blockId);
      if (!removed) return;
      const updated = appendTo(nodes, parentId, removed);
      updateTreeAndCode(updated);
      addLog(`Block "${removed.verbName || 'action'}" nested inside the container.`, 'success');
      return;
    }

    const snippet = e.dataTransfer.getData('text/plain');
    if (snippet) {
      const newNode = createNodeFromSnippet(snippet, 'node-drop-');
      const updated = appendTo(tree, parentId, newNode);
      updateTreeAndCode(updated);
      addLog(`Block dropped and nested successfully!`, 'success');
    }
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

    const barClass = (position: 'before' | 'after') =>
      `h-1.5 rounded-md transition-all border ${
        dropTarget && dropTarget.id === node.id && dropTarget.position === position
          ? 'bg-cyan-500/70 border-cyan-400'
          : dragId
            ? 'bg-cyan-500/15 border-cyan-500/30'
            : 'bg-transparent border-transparent'
      }`;

    const dropBar = (position: 'before' | 'after') => (
      <div
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDropTarget({ id: node.id, position }); }}
        onDragLeave={() => {
          if (dropTarget?.id === node.id && dropTarget.position === position) setDropTarget(null);
        }}
        onDrop={(e) => handleReorderDrop(e, node.id, position)}
        className={barClass(position)}
        style={{ marginLeft: `${depth * 14}px` }}
        title={dragId ? 'Drop here to reorder' : undefined}
      />
    );

    return (
      <React.Fragment key={node.id}>
        {dropBar('before')}
        <div
          draggable={!isEditing}
          onDragStart={(e) => handleBlockDragStart(e, node.id)}
          onDragEnd={handleBlockDragEnd}
          className={`relative my-2 rounded-xl border ${style.border} ${style.bg} p-3 transition-all duration-150 shadow-lg ${
            dragId === node.id ? 'opacity-40 border-dashed' : ''
          } ${dragId && dragId !== node.id ? 'cursor-grab active:cursor-grabbing' : ''}`}
          style={{ marginLeft: `${depth * 14}px` }}
          title={dragId && dragId !== node.id ? 'Drop a block here to reorder' : undefined}
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
                <span className="font-mono text-[11px]">📥 Drag & drop a block (or a palette verb) HERE to nest it</span>
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
        {dropBar('after')}
      </React.Fragment>
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
