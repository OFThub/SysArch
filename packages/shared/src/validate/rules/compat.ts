import type { Finding, Rule } from '../types';

/** A node whose type is neither built in nor defined in the doc. */
export const unknownType: Rule = {
  id: 'unknown-type',
  category: 'compat',
  check: ({ doc, catalog }) =>
    doc.nodes
      .filter((n) => !catalog.has(n.type))
      .map((n) => ({
        severity: 'error',
        nodeIds: [n.id],
        edgeIds: [],
        params: { label: n.label, type: n.type },
      })),
  text: {
    tr: (p) => ({
      message: `“${p.label}” bileşeninin türü (${p.type}) katalogda yok.`,
      hint: 'Özel tip olarak tanımla ya da bileşenin türünü değiştir.',
    }),
    en: (p) => ({
      message: `“${p.label}” uses type ${p.type}, which is not in the catalog.`,
      hint: 'Define it as a custom type or change the component type.',
    }),
  },
};

/** An edge whose protocol one of its ends does not speak. */
export const protocolMismatch: Rule = {
  id: 'protocol-mismatch',
  category: 'compat',
  check: ({ doc, catalog, node }) =>
    doc.edges.flatMap((e) =>
      (['source', 'target'] as const).flatMap((side): Finding[] => {
        const n = node(e[side]);
        const type = n && catalog.get(n.type);
        // Unknown types are reported by unknown-type; do not pile on.
        if (!n || !type || type.protocols.includes(e.protocol)) return [];
        return [
          {
            severity: 'warning',
            nodeIds: [n.id],
            edgeIds: [e.id],
            params: {
              side,
              label: n.label,
              protocol: e.protocol,
              supported: type.protocols.join(', '),
            },
          },
        ];
      }),
    ),
  text: {
    tr: (p) => ({
      message: `“${p.label}” ${p.protocol} konuşmuyor ama bu protokolle bağlanmış.`,
      hint: `Protokolü değiştir. Desteklenenler: ${p.supported}.`,
    }),
    en: (p) => ({
      message: `“${p.label}” does not speak ${p.protocol} but is connected with it.`,
      hint: `Change the protocol. Supported: ${p.supported}.`,
    }),
  },
};
