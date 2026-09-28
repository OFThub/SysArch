import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

// Shell-level controls: flat, 2px radius, tokens only.
const box =
  'w-full rounded-chip border border-line bg-raised px-2 text-sm text-ink placeholder:text-ink-muted';

export function Field({
  label,
  unit,
  children,
}: {
  label: string;
  unit?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs text-ink-muted">
        {label}
        {unit && <span className="tabular-nums"> ({unit})</span>}
      </span>
      {children}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="text" {...props} className={`h-7 ${box} ${props.className ?? ''}`} />;
}

/**
 * Numbers commit on blur or Enter, not per keystroke, so "3." or "-" can be
 * typed. Keyed by the committed value: an external change (undo) remounts it.
 */
export function NumberInput({
  value,
  onCommit,
  placeholder,
}: {
  value: number | undefined;
  onCommit: (value: number | undefined) => void;
  placeholder?: string;
}) {
  const commit = (text: string) => {
    if (text.trim() === '') return onCommit(undefined);
    const n = Number(text);
    if (Number.isFinite(n) && n !== value) onCommit(n);
  };
  return (
    <input
      key={String(value)}
      type="text"
      inputMode="decimal"
      defaultValue={value ?? ''}
      placeholder={placeholder}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      className={`h-7 ${box} tabular-nums`}
    />
  );
}

export function Select({
  options,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  return (
    <select {...props} className={`h-7 ${box}`}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={4} {...props} className={`${box} py-1.5 ${props.className ?? ''}`} />;
}

export function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-3.5 accent-[var(--ink)]"
      />
      {label}
    </label>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="pt-2 text-xs font-medium text-ink-muted">{children}</h3>;
}
