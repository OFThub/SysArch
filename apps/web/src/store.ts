import { effectiveCatalog, seraIot, type ArchDoc, type Catalog } from '@sysarch/shared';
import { useMemo } from 'react';
import { create } from 'zustand';

type Positions = Record<string, { x: number; y: number }>;

export interface EditorState {
  doc: ArchDoc;
  activeViewId: string;
  setActiveView: (viewId: string) => void;
  /** Writes final positions for one view (after a drag or auto-layout). */
  moveNodes: (viewId: string, positions: Positions) => void;
}

export const useEditor = create<EditorState>()((set) => ({
  // ponytail: demo doc until projects load from the server.
  doc: seraIot(),
  activeViewId: 'overview',
  setActiveView: (activeViewId) => set({ activeViewId }),
  moveNodes: (viewId, positions) =>
    set((s) => ({
      doc: {
        ...s.doc,
        views: s.doc.views.map((v) =>
          v.id === viewId ? { ...v, positions: { ...v.positions, ...positions } } : v,
        ),
      },
    })),
}));

/** Built-in catalog plus the doc's custom types, recomputed only when those change. */
export function useCatalog(): Catalog {
  const customTypes = useEditor((s) => s.doc.customTypes);
  return useMemo(() => effectiveCatalog(customTypes), [customTypes]);
}
