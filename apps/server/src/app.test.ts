import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';
import { createHarness, testEnv } from './test/harness';

describe('api basics', () => {
  it('serves health without a session', async () => {
    const { app } = await createHarness();
    const res = await app.request('/api/health');
    expect(await res.json()).toEqual({ ok: true });
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
