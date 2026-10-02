/**
 * What open editors of a project hear about: a new saved revision, or a
 * change to its proposals. `origin` is the client id of the tab that caused
 * it, so that tab can skip its own echo.
 */
export type ProjectEvent =
  | { type: 'doc.updated'; revision: number; origin?: string }
  | { type: 'proposal.changed'; origin?: string };

type Listener = (event: ProjectEvent) => void;

/**
 * Per-project publish/subscribe for the SSE stream.
 * ponytail: in-process, so it reaches only editors connected to this
 * instance; enough for single-instance self-hosting. Move to Redis pub/sub
 * before running more than one instance.
 */
export function createEventBus() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    publish(projectId: string, event: ProjectEvent) {
      for (const listener of listeners.get(projectId) ?? []) listener(event);
    },
    /** Returns the unsubscribe function. */
    subscribe(projectId: string, listener: Listener) {
      const set = listeners.get(projectId) ?? new Set();
      set.add(listener);
      listeners.set(projectId, set);
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(projectId);
      };
    },
    listenerCount: (projectId: string) => listeners.get(projectId)?.size ?? 0,
  };
}
export type EventBus = ReturnType<typeof createEventBus>;

/** The sender's tab id from X-Client-Id; bounded so it cannot bloat events. */
export const clientOrigin = (header: string | undefined) =>
  header && /^[A-Za-z0-9_-]{1,64}$/.test(header) ? header : undefined;
