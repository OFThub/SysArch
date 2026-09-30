import { defineConfig } from 'tsup';

// One ESM file for the image. The workspace package ships TypeScript source,
// so it is bundled in, together with its small pure-JS dependencies; server
// dependencies (Hono, Better Auth, Drizzle, the native better-sqlite3, zod)
// stay external and come from node_modules.
export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node24',
  clean: true,
  noExternal: ['@sysarch/shared', 'nanoid', 'yaml'],
  // yaml's Node build is CommonJS and requires node built-ins; inside an ESM
  // bundle that needs a real `require`.
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
