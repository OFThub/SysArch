import {
  effectiveCatalog,
  pasteSubgraph,
  removeElements,
  seraIot,
  type ArchDoc,
  type ArchEdge,
  type ArchNode,
  type Catalog,
  type Clip,
} from '@sysarch/shared';
import { useMemo } from 'react';
import { temporal } from 'zundo';
import { create, useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

type Point = { x: number; y: number };
type Positions = Record<string, Point>;
export type NodePatch = Partial<Pick<ArchNode, 'label' | 'notes' | 'deploy' | 'props'>>;
export type EdgePatch = Partial<Pick<ArchEdge, 'protocol' | 'pins' | 'props' | 'payload'>>;
export interface Selection {
  nodeIds: string[];
  edgeIds: string[];
}

export interface EditorState {
  doc: ArchDoc;
  activeViewId: string;
  selection: Selection;
  setActiveView: (viewId: string) => void;
  setSelection: (selection: Selection) => void;
  /** Writes final positions for one view (after a drag or auto-layout). */
  moveNodes: (viewId: string, positions: Positions) => void;
  /** Adds a node and places it in the given view; other views place it on next layout. */
  addNode: (node: ArchNode, viewId: string, position: Point) => void;
  /** Adds an edge and selects it so its protocol and pins can be checked right away. */
  addEdge: (edge: ArchEdge) => void;
  /** Shallow-merges fields; `props` merges key by key. */
  updateNode: (id: string, patch: NodePatch) => void;
  updateEdge: (id: string, patch: EdgePatch) => void;
  updateMeta: (patch: Partial<ArchDoc['meta']>) => void;
  /** Removes elements with their dependents (see removeElements) and clears the selection. */
  deleteElements: (nodeIds: string[], edgeIds: string[]) => void;
  /** Pastes into the active view and selects what was pasted. */
  paste: (clip: Clip, offset: Point) => void;
}

const mapById = <T extends { id: string }>(items: T[], id: string, fn: (item: T) => T) =>
  items.map((item) => (item.id === id ? fn(item) : item));

// Undo grouping: property edits tag themselves with the field they touch.
// Consecutive edits to the same field within COALESCE_MS form one undo step,
// so typing a label is one step, while discrete actions (add, delete, drag)
// always get their own.
const COALESCE_MS = 1500;
let editKey: string | null = null;
let lastKey: string | null = null;
let lastAt = 0;
const tagEdit = (key: string) => {
  editKey = key;
};

export const useEditor = create<EditorState>()(
  temporal(
    (set) => ({
      // ponytail: demo doc until projects load from the server.
      doc: seraIot(),
      activeViewId: 'overview',
      selection: { nodeIds: [], edgeIds: [] },

      setActiveView: (activeViewId) =>
        set({ activeViewId, selection: { nodeIds: [], edgeIds: [] } }),
      setSelection: (selection) => set({ selection }),

      moveNodes: (viewId, positions) =>
        set((s) => ({
          doc: {
            ...s.doc,
            views: mapById(s.doc.views, viewId, (v) => ({
              ...v,
              positions: { ...v.positions, ...positions },
            })),
          },
        })),

      addNode: (node, viewId, position) =>
        set((s) => ({
          doc: {
            ...s.doc,
            nodes: [...s.doc.nodes, node],
            views: mapById(s.doc.views, viewId, (v) => ({
              ...v,
              positions: { ...v.positions, [node.id]: position },
            })),
          },
          selection: { nodeIds: [node.id], edgeIds: [] },
        })),

      addEdge: (edge) =>
        set((s) => ({
          doc: { ...s.doc, edges: [...s.doc.edges, edge] },
          selection: { nodeIds: [], edgeIds: [edge.id] },
        })),

      updateNode: (id, patch) => {
        tagEdit(`node:${id}:${Object.keys(patch.props ?? patch).join(',')}`);
        set((s) => ({
          doc: {
            ...s.doc,
            nodes: mapById(s.doc.nodes, id, (n) => ({
              ...n,
              ...patch,
              props: patch.props ? { ...n.props, ...patch.props } : n.props,
            })),
          },
        }));
      },

      updateEdge: (id, patch) => {
        tagEdit(`edge:${id}:${Object.keys(patch.props ?? patch).join(',')}`);
        set((s) => ({
          doc: {
            ...s.doc,
            edges: mapById(s.doc.edges, id, (e) => ({
              ...e,
              ...patch,
              props: patch.props ? { ...e.props, ...patch.props } : e.props,
            })),
          },
        }));
      },

      updateMeta: (patch) => {
        tagEdit(`meta:${Object.keys(patch).join(',')}`);
        set((s) => ({ doc: { ...s.doc, meta: { ...s.doc.meta, ...patch } } }));
      },

      deleteElements: (nodeIds, edgeIds) =>
        set((s) => ({
          doc: removeElements(s.doc, nodeIds, edgeIds),
          selection: { nodeIds: [], edgeIds: [] },
        })),

      paste: (clip, offset) =>
        set((s) => {
          const r = pasteSubgraph(s.doc, clip, s.activeViewId, offset);
          return { doc: r.doc, selection: { nodeIds: r.nodeIds, edgeIds: r.edgeIds } };
        }),
    }),
    {
      // Only the document is history; view, selection and UI state are not.
      partialize: (s) => ({ doc: s.doc }),
      equality: (a, b) => a.doc === b.doc,
      limit: 200,
      handleSet: (handleSet) => (pastState, replace) => {
        const now = Date.now();
        const coalesce = editKey !== null && editKey === lastKey && now - lastAt < COALESCE_MS;
        lastKey = editKey;
        lastAt = now;
        editKey = null;
        if (!coalesce) handleSet(pastState, replace);
      },
    },
  ),
);

export const undo = () => useEditor.temporal.getState().undo();
export const redo = () => useEditor.temporal.getState().redo();

/** Whether undo/redo have anything to do, for toolbar state. */
export function useHistory() {
  return useStore(
    useEditor.temporal,
    useShallow((t) => ({
      canUndo: t.pastStates.length > 0,
      canRedo: t.futureStates.length > 0,
    })),
  );
}

/** Built-in catalog plus the doc's custom types, recomputed only when those change. */
export function useCatalog(): Catalog {
  const customTypes = useEditor((s) => s.doc.customTypes);
  return useMemo(() => effectiveCatalog(customTypes), [customTypes]);
}
