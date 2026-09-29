import type { Rule } from '../types';

/**
 * A frontend wired straight to a data store: the browser would need the
 * store's credentials. Stores are recognised by their STRIDE category, so
 * custom stores are covered too.
 */
export const frontendToStore: Rule = {
  id: 'frontend-to-store',
  category: 'security',
  check: ({ doc, catalog, node }) =>
    doc.edges.flatMap((e) => {
      const [a, b] = [node(e.source), node(e.target)];
      if (!a || !b) return [];
      const [front, store] =
        a.type === 'frontend' ? [a, b] : b.type === 'frontend' ? [b, a] : [undefined, undefined];
      if (!front || !store || catalog.get(store.type)?.exportHints.strideCategory !== 'store')
        return [];
      return [
        {
          severity: 'warning',
          nodeIds: [front.id, store.id],
          edgeIds: [e.id],
          params: { frontend: front.label, store: store.label },
        },
      ];
    }),
  text: {
    tr: (p) => ({
      message: `“${p.frontend}” doğrudan “${p.store}” ile konuşuyor.`,
      hint: 'Araya bir API servisi koy; tarayıcıya veri deposu kimlik bilgisi verilmemeli.',
    }),
    en: (p) => ({
      message: `Frontend “${p.frontend}” talks to “${p.store}” directly.`,
      hint: 'Put an API service in between; a browser must never hold store credentials.',
    }),
  },
};

const MODEL_SOURCES = new Set(['training', 'dataset']);

/** A model server that neither names a model nor receives one from training. */
export const modelWithoutSource: Rule = {
  id: 'model-without-source',
  category: 'compat',
  check: ({ doc, node, edgesOf }) =>
    doc.nodes
      .filter((n) => n.type === 'model_serving')
      .filter((n) => !String(n.props.model ?? '').trim())
      .filter(
        (n) =>
          !edgesOf(n.id).some(
            (e) => e.target === n.id && MODEL_SOURCES.has(node(e.source)?.type ?? ''),
          ),
      )
      .map((n) => ({
        severity: 'warning',
        nodeIds: [n.id],
        edgeIds: [],
        params: { label: n.label },
      })),
  text: {
    tr: (p) => ({
      message: `“${p.label}” hangi modeli sunacağını bilmiyor.`,
      hint: 'Bir eğitim işinden bağlantı ekle ya da Model alanını doldur.',
    }),
    en: (p) => ({
      message: `“${p.label}” has no model to serve.`,
      hint: 'Connect a training job to it or fill in its Model field.',
    }),
  },
};

/** A component nothing connects to, in a design that has more than one. */
export const orphanNode: Rule = {
  id: 'orphan-node',
  category: 'compat',
  check: ({ doc, edgesOf }) =>
    doc.nodes.length < 2
      ? []
      : doc.nodes
          .filter((n) => edgesOf(n.id).length === 0)
          .map((n) => ({
            severity: 'info',
            nodeIds: [n.id],
            edgeIds: [],
            params: { label: n.label },
          })),
  text: {
    tr: (p) => ({
      message: `“${p.label}” hiçbir bileşene bağlı değil.`,
      hint: 'Bağlantısını ekle ya da gerekmiyorsa kaldır.',
    }),
    en: (p) => ({
      message: `“${p.label}” is not connected to anything.`,
      hint: 'Connect it or remove it if it is not needed.',
    }),
  },
};
