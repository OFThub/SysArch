import { useSyncExternalStore } from 'react';

// Two routes (the project list and /p/:id) do not need a router library.
const subscribe = (onChange: () => void) => {
  window.addEventListener('popstate', onChange);
  return () => window.removeEventListener('popstate', onChange);
};

export const usePath = () => useSyncExternalStore(subscribe, () => window.location.pathname);

export function navigate(path: string) {
  if (path === window.location.pathname) return;
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** `/p/<id>` → id; anything else → undefined (the project list). */
export const projectIdFrom = (path: string) => /^\/p\/([A-Za-z0-9_-]{1,64})$/.exec(path)?.[1];
