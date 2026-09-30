import { authClient } from './api/client';
import { projectIdFrom, usePath } from './nav';
import { LoginScreen } from './screens/LoginScreen';
import { ProjectEditor } from './screens/ProjectEditor';
import { ProjectList } from './screens/ProjectList';

/** Session gate and the two routes: the project list and /p/:id. */
export function App() {
  const { data: session, isPending } = authClient.useSession();
  const path = usePath();

  if (isPending) return <div className="h-full bg-canvas" />;
  if (!session) return <LoginScreen />;

  const projectId = projectIdFrom(path);
  return projectId ? (
    <ProjectEditor key={projectId} id={projectId} />
  ) : (
    <ProjectList userName={session.user.name} />
  );
}
