import { authClient } from './api/client';
import { projectIdFrom, shareTokenFrom, usePath } from './nav';
import { SharedView } from './screens/SharedView';
import { LoginScreen } from './screens/LoginScreen';
import { ProjectEditor } from './screens/ProjectEditor';
import { ProjectList } from './screens/ProjectList';

/** A shared link opens for anyone; the rest sits behind the session gate. */
export function App() {
  const path = usePath();
  const token = shareTokenFrom(path);
  return token ? <SharedView token={token} /> : <Signed path={path} />;
}

/** Session gate and the two signed-in routes: the project list and /p/:id. */
function Signed({ path }: { path: string }) {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) return <div className="h-full bg-canvas" />;
  if (!session) return <LoginScreen />;

  const projectId = projectIdFrom(path);
  return projectId ? (
    <ProjectEditor key={projectId} id={projectId} />
  ) : (
    <ProjectList userName={session.user.name} />
  );
}
