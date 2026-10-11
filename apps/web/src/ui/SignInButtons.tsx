import { useEffect, useState } from 'react';
import { api, authClient } from '../api/client';
import { tr } from '../i18n/tr';

type Provider = 'github' | 'google';

/**
 * One button per sign-in provider the server has configured. Signing in
 * comes back to the page it started from (a share link stays a share link).
 */
export function SignInButtons() {
  const [providers, setProviders] = useState<Provider[] | 'unreachable' | null>(null);

  useEffect(() => {
    api.providers
      .$get()
      .then(async (res) => setProviders(res.ok ? (await res.json()).providers : 'unreachable'))
      .catch(() => setProviders('unreachable'));
  }, []);

  const signIn = (provider: Provider) =>
    authClient.signIn.social({ provider, callbackURL: window.location.href });

  return (
    <div className="grid gap-2">
      {providers === 'unreachable' && (
        <p role="alert" className="text-sm">
          {tr.login.unreachable}
        </p>
      )}
      {Array.isArray(providers) && providers.length === 0 && (
        <p className="text-sm">{tr.login.noProviders}</p>
      )}
      {Array.isArray(providers) &&
        providers.map((p) => (
          <button
            key={p}
            onClick={() => void signIn(p)}
            className="h-9 rounded-chip border border-line bg-panel text-base font-medium hover:border-ink-muted"
          >
            {tr.login[p]}
          </button>
        ))}
    </div>
  );
}
