import {
  effectiveCatalog,
  seraIot,
  type ArchDoc,
  type ArchEdge,
  type ArchNode,
  type Catalog,
} from '@sysarch/shared';
import { useMemo } from 'react';
import { create } from 'zustand';

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
}

const mapById = <T extends { id: string }>(items: T[], id: string, fn: (item: T) => T) =>
  items.map((item) => (item.id === id ? fn(item) : item));

export const useEditor = create<EditorState>()((set) => ({
  // ponytail: demo doc until projects load from the server.
  doc: seraIot(),
  activeViewId: 'overview',
  selection: { nodeIds: [], edgeIds: [] },

  setActiveView: (activeViewId) => set({ activeViewId, selection: { nodeIds: [], edgeIds: [] } }),
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

  updateNode: (id, patch) =>
    set((s) => ({
      doc: {
        ...s.doc,
        nodes: mapById(s.doc.nodes, id, (n) => ({
          ...n,
          ...patch,
          props: patch.props ? { ...n.props, ...patch.props } : n.props,
        })),
      },
    })),

  updateEdge: (id, patch) =>
    set((s) => ({
      doc: {
        ...s.doc,
        edges: mapById(s.doc.edges, id, (e) => ({
          ...e,
          ...patch,
          props: patch.props ? { ...e.props, ...patch.props } : e.props,
        })),
      },
    })),

  updateMeta: (patch) => set((s) => ({ doc: { ...s.doc, meta: { ...s.doc.meta, ...patch } } })),
}));

/** Built-in catalog plus the doc's custom types, recomputed only when those change. */
export function useCatalog(): Catalog {
  const customTypes = useEditor((s) => s.doc.customTypes);
  return useMemo(() => effectiveCatalog(customTypes), [customTypes]);
}
