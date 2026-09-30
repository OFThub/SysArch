import {
  pinsOf,
  pinSupports,
  PROTOCOLS,
  ProtocolSchema,
  suggestPinMap,
  type ArchEdge,
  type ArchNode,
  type FieldDef,
  type PinDef,
  type PinMap,
  type PinRole,
  type Protocol,
} from '@sysarch/shared';
import { tr } from '../i18n/tr';
import { NodeIcon } from '../icons/NodeIcon';
import { useCatalog, useEditor } from '../store';
import {
  Checkbox,
  Field,
  NumberInput,
  SectionTitle,
  Select,
  TextArea,
  TextInput,
} from '../ui/controls';
import { formatFields, parseFields } from './payloadFields';

const DEPLOY_TARGETS = ['docker', 'aws', 'gcp', 'onprem', 'edge'] as const;
const TRANSPORTS = ['', 'ethernet', 'wifi', 'lte', 'ble', 'lora'];

export function Inspector() {
  const selection = useEditor((s) => s.selection);
  const node = useEditor((s) =>
    s.selection.nodeIds.length === 1 && s.selection.edgeIds.length === 0
      ? s.doc.nodes.find((n) => n.id === s.selection.nodeIds[0])
      : undefined,
  );
  const edge = useEditor((s) =>
    s.selection.edgeIds.length === 1 && s.selection.nodeIds.length === 0
      ? s.doc.edges.find((e) => e.id === s.selection.edgeIds[0])
      : undefined,
  );
  const count = selection.nodeIds.length + selection.edgeIds.length;

  return (
    <aside
      aria-label={tr.inspector.title}
      className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-line bg-panel"
    >
      <div className="grid gap-3 p-4">
        {node ? (
          <NodeInspector key={node.id} node={node} />
        ) : edge ? (
          <EdgeInspector key={edge.id} edge={edge} />
        ) : count > 1 ? (
          <p className="text-sm text-ink-muted">{tr.inspector.multi(count)}</p>
        ) : (
          <ProjectInspector />
        )}
      </div>
    </aside>
  );
}

function ProjectInspector() {
  const meta = useEditor((s) => s.doc.meta);
  const updateMeta = useEditor((s) => s.updateMeta);
  return (
    <>
      <h2 className="font-wide text-md font-semibold">{tr.inspector.project}</h2>
      <Field label={tr.inspector.name}>
        <TextInput value={meta.name} onChange={(e) => updateMeta({ name: e.target.value })} />
      </Field>
      <Field label={tr.inspector.description}>
        <TextArea
          value={meta.description}
          onChange={(e) => updateMeta({ description: e.target.value })}
        />
      </Field>
      <p className="text-sm text-ink-muted">{tr.inspector.hint}</p>
    </>
  );
}

function NodeInspector({ node }: { node: ArchNode }) {
  const catalog = useCatalog();
  const update = useEditor((s) => s.updateNode);
  const type = catalog.get(node.type);
  const pins = pinsOf(node, catalog);

  return (
    <>
      <header className="flex items-center gap-2">
        <span className="text-ink-muted">
          <NodeIcon name={type?.icon ?? 'box'} size={18} />
        </span>
        <h2 className="text-base font-semibold">{type?.label ?? node.type}</h2>
        <span
          aria-hidden
          className="ml-auto size-2 rounded-full"
          style={{ background: `var(--ch-${node.domain})` }}
        />
        <span className="text-xs text-ink-muted">{tr.domain[node.domain]}</span>
      </header>

      <Field label={tr.inspector.label}>
        <TextInput
          value={node.label}
          onChange={(e) => update(node.id, { label: e.target.value })}
          // The schema needs a label; an emptied field falls back to the type name.
          onBlur={(e) =>
            !e.target.value.trim() && update(node.id, { label: type?.label ?? node.type })
          }
        />
      </Field>

      {type?.fields.map((f) => (
        <PropField
          key={f.key}
          field={f}
          value={node.props[f.key]}
          onChange={(v) => update(node.id, { props: { [f.key]: v } })}
        />
      ))}

      {node.domain !== 'hardware' && (
        <Field label={tr.inspector.deploy}>
          <Select
            value={node.deploy?.target ?? ''}
            onChange={(e) =>
              update(node.id, {
                deploy: e.target.value
                  ? { target: e.target.value as (typeof DEPLOY_TARGETS)[number] }
                  : undefined,
              })
            }
            options={[
              { value: '', label: tr.inspector.none },
              ...DEPLOY_TARGETS.map((t) => ({ value: t, label: tr.deploy[t] })),
            ]}
          />
        </Field>
      )}

      {pins.length > 0 && <PinList pins={pins} />}

      <Field label={tr.inspector.notes}>
        <TextArea
          value={node.notes ?? ''}
          placeholder={tr.inspector.notesHint}
          onChange={(e) => update(node.id, { notes: e.target.value || undefined })}
        />
      </Field>
    </>
  );
}

function PropField({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: string | number | boolean | undefined;
  onChange: (value: string | number | boolean) => void;
}) {
  switch (field.kind) {
    case 'bool':
      return <Checkbox label={field.label} checked={value === true} onChange={onChange} />;
    case 'number':
      return (
        <Field label={field.label} unit={field.unit}>
          <NumberInput
            value={typeof value === 'number' ? value : undefined}
            onCommit={(v) => onChange(v ?? 0)}
          />
        </Field>
      );
    case 'select':
      return (
        <Field label={field.label}>
          <Select
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
            options={(field.options ?? []).map((o) => ({ value: o, label: o }))}
          />
        </Field>
      );
    case 'markdown':
      return (
        <Field label={field.label}>
          <TextArea value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
        </Field>
      );
    default:
      return (
        <Field label={field.label} unit={field.unit}>
          <TextInput value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
        </Field>
      );
  }
}

function PinList({ pins }: { pins: PinDef[] }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-xs font-medium text-ink-muted">
        {tr.inspector.pins(pins.length)}
      </summary>
      <table className="mt-1 w-full text-xs">
        <tbody>
          {pins.map((p) => (
            <tr key={p.name} className="border-t border-line">
              <td className="py-1 pr-2 font-mono">{p.name}</td>
              <td className="py-1 pr-2 tabular-nums text-ink-muted">{p.voltage} V</td>
              <td className="py-1 font-mono text-ink-muted">{p.functions.join(' ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function EdgeInspector({ edge }: { edge: ArchEdge }) {
  const catalog = useCatalog();
  const update = useEditor((s) => s.updateEdge);
  const source = useEditor((s) => s.doc.nodes.find((n) => n.id === edge.source));
  const target = useEditor((s) => s.doc.nodes.find((n) => n.id === edge.target));
  if (!source || !target) return null;

  const info = PROTOCOLS[edge.protocol];
  const srcPins = pinsOf(source, catalog);
  const tgtPins = pinsOf(target, catalog);
  const setProtocol = (protocol: Protocol) =>
    update(edge.id, {
      protocol,
      pins: PROTOCOLS[protocol].roles.length
        ? suggestPinMap(protocol, srcPins, tgtPins)
        : undefined,
    });

  return (
    <>
      <header className="grid gap-0.5">
        <h2 className="text-base font-semibold">
          {source.label} → {target.label}
        </h2>
        <span className="font-mono text-xs text-ink-muted">{edge.id}</span>
      </header>

      <Field label={tr.inspector.protocol}>
        <Select
          value={edge.protocol}
          onChange={(e) => setProtocol(e.target.value as Protocol)}
          options={ProtocolSchema.options.map((p) => ({ value: p, label: p }))}
        />
      </Field>

      {info.roles.length > 0 ? (
        <PinMapEditor edge={edge} srcPins={srcPins} tgtPins={tgtPins} />
      ) : (
        <Field label={tr.inspector.transport}>
          <Select
            value={String(edge.props.transport ?? '')}
            onChange={(e) => update(edge.id, { props: { transport: e.target.value } })}
            options={TRANSPORTS.map((t) => ({ value: t, label: t || tr.inspector.none }))}
          />
        </Field>
      )}

      {/* A power line carries current, not data: its load is the power budget. */}
      {edge.protocol !== 'Power' && (
        <>
          <Field label={tr.inspector.bandwidth} unit="kbps">
            <NumberInput
              value={
                typeof edge.props.bandwidthKbps === 'number' ? edge.props.bandwidthKbps : undefined
              }
              placeholder={info.defaultKbps !== undefined ? String(info.defaultKbps) : undefined}
              onCommit={(v) => {
                const { bandwidthKbps: _, ...rest } = edge.props;
                update(edge.id, { props: v === undefined ? rest : { ...rest, bandwidthKbps: v } });
              }}
            />
          </Field>

          <PayloadEditor edge={edge} />
        </>
      )}
    </>
  );
}

function PinMapEditor({
  edge,
  srcPins,
  tgtPins,
}: {
  edge: ArchEdge;
  srcPins: PinDef[];
  tgtPins: PinDef[];
}) {
  const update = useEditor((s) => s.updateEdge);
  const roles = PROTOCOLS[edge.protocol].roles;
  const current = edge.pins ?? [];

  // A mapping is stored only when both ends are known, so picking one side
  // fills the other with a pin that supports the role (or the role name for
  // parts without a pin list).
  const setPin = (role: PinRole, side: 'sourcePin' | 'targetPin', name: string) => {
    const rest = current.filter((m) => m.role !== role);
    const order = (m: PinMap) => roles.indexOf(m.role);
    if (!name) return update(edge.id, { pins: rest });
    const other = side === 'sourcePin' ? 'targetPin' : 'sourcePin';
    const otherPins = side === 'sourcePin' ? tgtPins : srcPins;
    const prev = current.find((m) => m.role === role);
    const otherName =
      prev?.[other] ?? (otherPins.find((p) => pinSupports(p, role)) ?? otherPins[0])?.name ?? role;
    const next = { role, [side]: name, [other]: otherName } as PinMap;
    update(edge.id, { pins: [...rest, next].sort((a, b) => order(a) - order(b)) });
  };

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between">
        <SectionTitle>{tr.inspector.pinMap}</SectionTitle>
        <button
          onClick={() => update(edge.id, { pins: suggestPinMap(edge.protocol, srcPins, tgtPins) })}
          className="mt-2 h-6 rounded-chip border border-line bg-raised px-2 text-xs hover:border-ink-muted"
        >
          {tr.inspector.suggestPins}
        </button>
      </div>
      {roles.map((role) => {
        const m = current.find((x) => x.role === role);
        return (
          <div key={role} className="grid grid-cols-[3.5rem_1fr_1fr] items-center gap-1.5">
            <span className="font-mono text-xs">{role}</span>
            <PinSelect
              pins={srcPins}
              value={m?.sourcePin}
              onChange={(v) => setPin(role, 'sourcePin', v)}
            />
            <PinSelect
              pins={tgtPins}
              value={m?.targetPin}
              onChange={(v) => setPin(role, 'targetPin', v)}
            />
          </div>
        );
      })}
    </div>
  );
}

function PinSelect({
  pins,
  value,
  onChange,
}: {
  pins: PinDef[];
  value: string | undefined;
  onChange: (name: string) => void;
}) {
  if (pins.length === 0) {
    return (
      <TextInput
        value={value ?? ''}
        placeholder={tr.inspector.unmapped}
        onChange={(e) => onChange(e.target.value)}
        className="font-mono"
      />
    );
  }
  return (
    <Select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className="font-mono"
      options={[
        { value: '', label: tr.inspector.unmapped },
        ...pins.map((p) => ({ value: p.name, label: p.name })),
      ]}
    />
  );
}

function PayloadEditor({ edge }: { edge: ArchEdge }) {
  const update = useEditor((s) => s.updateEdge);
  const payload = edge.payload;

  if (!payload) {
    return (
      <button
        onClick={() =>
          update(edge.id, {
            payload: { schemaName: 'Message', fields: [], sizeBytes: 0, ratePerSec: 0 },
          })
        }
        className="h-7 justify-self-start rounded-chip border border-line bg-raised px-2.5 text-sm hover:border-ink-muted"
      >
        {tr.inspector.addPayload}
      </button>
    );
  }

  const set = (patch: Partial<typeof payload>) =>
    update(edge.id, { payload: { ...payload, ...patch } });

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <SectionTitle>{tr.inspector.payload}</SectionTitle>
        <button
          onClick={() => update(edge.id, { payload: undefined })}
          className="mt-2 h-6 rounded-chip border border-line bg-raised px-2 text-xs hover:border-ink-muted"
        >
          {tr.inspector.removePayload}
        </button>
      </div>
      <Field label={tr.inspector.schemaName}>
        <TextInput
          value={payload.schemaName}
          onChange={(e) => set({ schemaName: e.target.value })}
          onBlur={(e) => !e.target.value.trim() && set({ schemaName: 'Message' })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={tr.inspector.sizeBytes} unit="B">
          <NumberInput
            value={payload.sizeBytes}
            onCommit={(v) => set({ sizeBytes: Math.max(0, v ?? 0) })}
          />
        </Field>
        <Field label={tr.inspector.ratePerSec} unit="/sn">
          <NumberInput
            value={payload.ratePerSec}
            onCommit={(v) => set({ ratePerSec: Math.max(0, v ?? 0) })}
          />
        </Field>
      </div>
      {edge.protocol === 'MQTT' && (
        <Field label={tr.inspector.topic}>
          <TextInput
            value={payload.topic ?? ''}
            onChange={(e) => set({ topic: e.target.value || undefined })}
            className="font-mono"
          />
        </Field>
      )}
      <Field label={tr.inspector.fields}>
        {/* Parsed on blur so typing "temp:" is not reformatted mid-word. */}
        <TextArea
          key={formatFields(payload.fields)}
          defaultValue={formatFields(payload.fields)}
          placeholder={tr.inspector.fieldsHint}
          onBlur={(e) => set({ fields: parseFields(e.target.value) })}
          className="font-mono"
        />
      </Field>
    </div>
  );
}
