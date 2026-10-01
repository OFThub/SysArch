import { apiKey } from '@better-auth/api-key';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { Db } from './db';
import { schema } from './db';
import type { Env } from './env';

/**
 * Shared by the app and by test-only auth instances (which add the test-utils
 * plugin to mint sessions); production never includes test helpers.
 */
export function authOptions(db: Db, env: Env) {
  return {
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.WEB_ORIGIN],
    database: drizzleAdapter(db, { provider: 'sqlite', schema }),
    socialProviders: {
      ...(env.GITHUB_CLIENT_ID &&
        env.GITHUB_CLIENT_SECRET && {
          github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET },
        }),
      ...(env.GOOGLE_CLIENT_ID &&
        env.GOOGLE_CLIENT_SECRET && {
          google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
        }),
    },
    plugins: [
      // Personal keys for the MCP server: a request with x-api-key acts as its
      // owner, so every route's ownership check applies unchanged.
      apiKey({
        enableSessionForAPIKeys: true,
        defaultPrefix: 'sysarch_',
        // The default (10 a day) would stall an MCP session within minutes.
        rateLimit: { enabled: true, timeWindow: 60_000, maxRequests: 120 },
      }),
    ],
  } satisfies BetterAuthOptions;
}

export const createAuth = (db: Db, env: Env) => betterAuth(authOptions(db, env));
export type Auth = ReturnType<typeof createAuth>;
export type SessionUser = Auth['$Infer']['Session']['user'];
