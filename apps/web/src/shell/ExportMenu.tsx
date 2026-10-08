import { Download } from 'lucide-react';
import { useRef, useState, type ToggleEvent } from 'react';
import { canvasApi } from '../canvas/canvasApi';
import { codeBundle, docJson, docYaml, fileBase } from '../export/bundle';
import { canvasImage, download } from '../export/image';
import { tr } from '../i18n/tr';
import { useCatalog, useEditor } from '../store';

/**
 * Export menu on the native Popover API: light dismiss and Escape come from
 * the platform. It opens under its button (fixed position computed on open,
 * since CSS anchor positioning is not everywhere yet).
 */
export function ExportMenu() {
  const catalog = useCatalog();
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  const onToggle = (e: ToggleEvent<HTMLDivElement>) => {
    if (e.newState !== 'open' || !button.current || !menu.current) return;
    const r = button.current.getBoundingClientRect();
    menu.current.style.top = `${r.bottom + 6}px`;
    menu.current.style.left = `${Math.max(8, r.right - menu.current.offsetWidth)}px`;
    setFailed(false);
  };

  const run = async (action: () => void | Promise<void>) => {
    try {
      await action();
      menu.current?.hidePopover();
    } catch {
      setFailed(true);
    }
  };

  const doc = () => useEditor.getState().doc;
  const base = () => fileBase(doc().meta.name);
  const items: { label: string; action: () => void | Promise<void> }[] = [
    {
      label: tr.export.png,
      action: async () => download(`${base()}.png`, await canvasImage('png', canvasApi.bounds())),
    },
    {
      label: tr.export.svg,
      action: async () => download(`${base()}.svg`, await canvasImage('svg', canvasApi.bounds())),
    },
    {
      label: tr.export.bundle,
      action: () =>
        download(
          `${base()}.zip`,
          new Blob([codeBundle(doc(), catalog) as BlobPart], { type: 'application/zip' }),
        ),
    },
    {
      label: tr.export.json,
      action: () =>
        download(`${base()}.json`, new Blob([docJson(doc())], { type: 'application/json' })),
    },
    {
      label: tr.export.yaml,
      action: () =>
        download(`${base()}.yaml`, new Blob([docYaml(doc())], { type: 'application/yaml' })),
    },
  ];

  return (
    <>
      <button
        ref={button}
        popoverTarget="export-menu"
        className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-chip border border-line px-2.5 text-sm hover:bg-raised"
      >
        <Download size={14} strokeWidth={1.5} aria-hidden />
        {tr.export.title}
      </button>
      <div
        ref={menu}
        id="export-menu"
        popover="auto"
        onToggle={onToggle}
        className="fixed m-0 w-64 rounded-float border border-line bg-raised p-1 text-ink shadow-float"
      >
        <ul role="menu">
          {items.map((item) => (
            <li key={item.label} role="none">
              <button
                role="menuitem"
                onClick={() => void run(item.action)}
                className="w-full rounded-node px-2.5 py-1.5 text-left text-sm hover:bg-panel"
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
        {failed && (
          <p role="alert" className="px-2.5 py-1.5 text-xs text-ink-muted">
            {tr.export.failed}
          </p>
        )}
      </div>
    </>
  );
}
