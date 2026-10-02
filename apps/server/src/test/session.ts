import { betterAuth } from 'better-auth';
import { testUtils } from 'better-auth/plugins';
import { authOptions } from '../auth';
import { openDb } from '../db';
import type { Env } from '../env';

/**
 * Creates a user and a genuine signed session in the database at `env`, the
 * way a real sign-in would, and returns the session cookie. For end-to-end
 * tests: the app under test verifies the cookie normally, no bypass.
 */
export async function mintSession(env: Env, user: { email: string; name: string }) {
  const db = openDb(env.DATABASE_PATH);
  const auth = betterAuth({
    ...authOptions(db, env),
    plugins: [...authOptions(db, env).plugins, testUtils()],
  });
  const t = (await auth.$context).test;
  const saved = await t.saveUser(t.createUser(user));
  const { cookies } = await t.login({ userId: saved.id });
  return cookies[0]!;
}
