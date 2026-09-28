import { Canvas } from './canvas/Canvas';
import { Inspector } from './panels/Inspector';
import { Palette } from './panels/Palette';
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
      <div className="flex min-h-0 flex-1">
        <Palette />
        <main className="min-w-0 flex-1">
          <Canvas />
        </main>
        <Inspector />
      </div>
    </div>
  );
}
