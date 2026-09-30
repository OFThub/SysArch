import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { mkdirSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app';
import { createAuth } from './auth';
import { openDb } from './db';
import { loadEnv } from './env';

const env = loadEnv();
if (env.DATABASE_PATH !== ':memory:') mkdirSync(dirname(env.DATABASE_PATH), { recursive: true });

// Resolved from this file, so it holds for src/ under tsx and dist/ when bundled.
const migrations = fileURLToPath(new URL('../drizzle', import.meta.url));
const db = openDb(env.DATABASE_PATH, migrations);
const { app } = createApp({ db, auth: createAuth(db, env), env });

// Self-hosted: the same process serves the built web app, so the UI and the
// API share one origin (first-party cookies, no CORS). Unknown non-API paths
// fall back to index.html for client-side routes like /p/:id.
if (env.WEB_DIST) {
  const root = relative(process.cwd(), env.WEB_DIST) || '.';
  app.use('/*', serveStatic({ root }));
  app.get('*', serveStatic({ root, path: 'index.html' }));
}

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`SysArch listening on http://localhost:${info.port}`);
});
