import { Canvas } from './canvas/Canvas';
import { ThemeSwitch } from './shell/ThemeSwitch';
import { ViewTabs } from './shell/ViewTabs';
import { useEditor } from './store';

export function App() {
  const name = useEditor((s) => s.doc.meta.name);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-11 shrink-0 items-stretch gap-6 border-b border-line bg-panel px-4">
        <h1 className="flex items-center font-wide text-md font-semibold">{name}</h1>
        <ViewTabs />
        <div className="ml-auto flex items-center">
          <ThemeSwitch />
        </div>
      </header>
      <main className="min-h-0 flex-1">
        <Canvas />
      </main>
    </div>
  );
}
