import { z } from 'zod';

const optional = z.string().min(1).optional();

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  DATABASE_PATH: z.string().min(1).default('./data/sysarch.db'),
  // Signs session cookies. Too short and sessions become forgeable, so refuse to start.
  BETTER_AUTH_SECRET: z.string().min(32, 'must be at least 32 characters'),
  /** Public URL the browser uses for /api (the web origin in dev, via Vite's proxy). */
  BETTER_AUTH_URL: z.url(),
  /** The only origin allowed to call the API with credentials. */
  WEB_ORIGIN: z.url(),
  GITHUB_CLIENT_ID: optional,
  GITHUB_CLIENT_SECRET: optional,
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  /** Built web app to serve from this process (the Docker image sets it). */
  WEB_DIST: optional,
});

export type Env = z.infer<typeof EnvSchema>;

/** Validates the environment once at startup; a bad config fails loudly before serving. */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const r = EnvSchema.safeParse(source);
  if (!r.success) throw new Error(`Invalid environment:\n${z.prettifyError(r.error)}`);
  return r.data;
}

/** A provider is on only when both its id and secret are set. */
export function enabledProviders(env: Env): ('github' | 'google')[] {
  const on: ('github' | 'google')[] = [];
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) on.push('github');
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) on.push('google');
  return on;
}
