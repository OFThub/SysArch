import { betterAuth } from 'better-auth';
import { testUtils } from 'better-auth/plugins';
import type { ModelTurn } from '../ai/assistant';
import { createApp } from '../app';
import { authOptions, createAuth } from '../auth';
import { openDb } from '../db';
import type { Env } from '../env';

export const testEnv: Env = {
  PORT: 0,
  DATABASE_PATH: ':memory:',
  BETTER_AUTH_SECRET: 'test-secret-with-at-least-thirty-two-chars',
  BETTER_AUTH_URL: 'http://localhost:5173',
  WEB_ORIGIN: 'http://localhost:5173',
};

/**
 * A fresh app on an in-memory database. Sessions come from a separate,
 * test-only auth instance with Better Auth's test-utils plugin, sharing the
 * db and secret, so the real app verifies genuine signed cookies. The app
 * itself has no test bypass.
 */
export async function createHarness(env: Env = testEnv, model?: ModelTurn) {
  const db = openDb(':memory:');
  const { app, events } = createApp({ db, auth: createAuth(db, env), env, model });
  const testAuth = betterAuth({ ...authOptions(db, env), plugins: [testUtils()] });
  const helpers = (await testAuth.$context).test;

  const signIn = async (email: string) => {
    const user = await helpers.saveUser(helpers.createUser({ email }));
    const { headers } = await helpers.login({ userId: user.id });
    return { user, headers };
  };

  return { db, app, events, signIn };
}
