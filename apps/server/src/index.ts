import { serve } from '@hono/node-server';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createApp } from './app';
import { createAuth } from './auth';
import { openDb } from './db';
import { loadEnv } from './env';

const env = loadEnv();
if (env.DATABASE_PATH !== ':memory:') mkdirSync(dirname(env.DATABASE_PATH), { recursive: true });

const db = openDb(env.DATABASE_PATH);
const { app } = createApp({ db, auth: createAuth(db, env), env });

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`SysArch API listening on http://localhost:${info.port}`);
});
