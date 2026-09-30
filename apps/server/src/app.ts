import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createMiddleware } from 'hono/factory';
import { secureHeaders } from 'hono/secure-headers';
import type { Auth, SessionUser } from './auth';
import type { Db } from './db';
import { enabledProviders, type Env } from './env';
import { projectRoutes } from './routes/projects';

export type AppEnv = { Variables: { user: SessionUser } };

export interface AppDeps {
  db: Db;
  auth: Auth;
  env: Env;
}

export function createApp({ db, auth, env }: AppDeps) {
  /** Rejects the request unless it carries a valid session; exposes the user to handlers. */
  const requireUser = createMiddleware<AppEnv>(async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: 'unauthorized' }, 401);
    c.set('user', session.user);
    await next();
  });

  // The typed API. Its type (ApiType) drives the web's Hono RPC client, so
  // routes are chained for inference. Auth routes stay outside it.
  const api = new Hono<AppEnv>()
    .get('/health', (c) => c.json({ ok: true }))
    .get('/providers', (c) => c.json({ providers: enabledProviders(env) }))
    .get('/me', requireUser, (c) => {
      const u = c.get('user');
      return c.json({ id: u.id, name: u.name, email: u.email, image: u.image ?? null });
    })
    .route('/projects', projectRoutes(db, requireUser));

  const app = new Hono();
  app.use('*', secureHeaders());
  app.use(
    '/api/*',
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true,
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'If-Match'],
      exposeHeaders: ['ETag'],
    }),
  );
  app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));
  app.route('/api', api);
  // Unknown API paths answer as the API, so a static-site fallback registered
  // after this (the self-hosted index.html) never turns an API typo into HTML.
  app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404));

  return { app, api, requireUser };
}

export type ApiType = ReturnType<typeof createApp>['api'];
