import { useEffect, useRef } from 'react';

/**
 * Native <dialog>: focus trapping, Escape and the backdrop come from the
 * platform. The destructive button is the danger color and not the default
 * focus, so Enter does not delete by accident.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => ref.current?.showModal(), []);

  return (
    <dialog
      ref={ref}
      onCancel={onCancel}
      className="m-auto w-96 rounded-float border border-line bg-raised p-5 text-ink shadow-float backdrop:bg-black/30"
    >
      <h2 className="text-md font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-ink-muted">{body}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button
          autoFocus
          onClick={onCancel}
          className="h-8 rounded-chip border border-line px-3 text-sm hover:bg-panel"
        >
          {cancelLabel}
        </button>
        <button
          onClick={onConfirm}
          className="h-8 rounded-chip bg-danger px-3 text-sm font-medium text-on-danger"
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
