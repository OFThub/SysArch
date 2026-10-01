import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';
import { createHarness, testEnv } from './test/harness';

describe('api basics', () => {
  it('serves health without a session', async () => {
    const { app } = await createHarness();
    const res = await app.request('/api/health');
    expect(await res.json()).toEqual({ ok: true });
  });

  it('answers unknown API paths with a JSON 404', async () => {
    const { app } = await createHarness();
    const res = await app.request('/api/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });

  it('rejects /api/me without a session', async () => {
    const { app } = await createHarness();
    expect((await app.request('/api/me')).status).toBe(401);
  });

  it('returns the signed-in user for a valid session cookie', async () => {
    const { app, signIn } = await createHarness();
    const { headers } = await signIn('ada@example.test');
    const res = await app.request('/api/me', { headers });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ email: 'ada@example.test' });
  });

  it('rejects a tampered session cookie', async () => {
    const { app, signIn } = await createHarness();
    const { headers } = await signIn('ada@example.test');
    const cookie = headers.get('cookie')!.replace(/\.([^.;]+)(;|$)/, '.forged$2');
    const res = await app.request('/api/me', { headers: { cookie } });
    expect(res.status).toBe(401);
  });

  it('lists only providers with both id and secret configured', async () => {
    const { app } = await createHarness({
      ...testEnv,
      GITHUB_CLIENT_ID: 'id',
      GITHUB_CLIENT_SECRET: 'secret',
      GOOGLE_CLIENT_ID: 'id-only',
    });
    expect(await (await app.request('/api/providers')).json()).toEqual({ providers: ['github'] });
  });

  it('allows credentialed CORS only from the web origin', async () => {
    const { app } = await createHarness();
    const preflight = (origin: string) =>
      app.request('/api/me', {
        method: 'OPTIONS',
        headers: { origin, 'access-control-request-method': 'GET' },
      });
    const ok = await preflight('http://localhost:5173');
    expect(ok.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(ok.headers.get('access-control-allow-credentials')).toBe('true');
    const evil = await preflight('https://evil.example');
    expect(evil.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('loadEnv', () => {
  it('refuses to start with a short auth secret', () => {
    expect(() => loadEnv({ ...testEnv, PORT: '1', BETTER_AUTH_SECRET: 'short' } as never)).toThrow(
      /BETTER_AUTH_SECRET/,
    );
  });
});

describe('api keys', () => {
  it('act as their owner and nothing more', async () => {
    const { app, signIn, createKey } = await createHarness();
    const ada = await signIn('ada@example.test');
    const bob = await signIn('bob@example.test');
    const created = await app.request('/api/projects', {
      method: 'POST',
      headers: { ...Object.fromEntries(ada.headers), 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Sera' }),
    });
    const { id } = (await created.json()) as { id: string };

    const adaKey = await createKey(ada.user.id);
    expect(adaKey.key.startsWith('sysarch_')).toBe(true);
    const asAda = (path: string) => app.request(path, { headers: { 'x-api-key': adaKey.key } });
    expect(await (await asAda('/api/me')).json()).toMatchObject({ email: 'ada@example.test' });
    expect((await asAda(`/api/projects/${id}`)).status).toBe(200);

    const bobKey = await createKey(bob.user.id);
    const asBob = await app.request(`/api/projects/${id}`, {
      headers: { 'x-api-key': bobKey.key },
    });
    expect(asBob.status).toBe(404);

    const forged = await app.request('/api/me', { headers: { 'x-api-key': 'sysarch_nope' } });
    expect(forged.status).toBe(401);
  });
});
