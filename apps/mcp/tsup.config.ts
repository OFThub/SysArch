import { defineConfig } from 'tsup';

// One ESM file to run with node; the workspace package ships TypeScript
// source, so it is bundled in with its small dependencies.
export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node24',
  clean: true,
  noExternal: ['@sysarch/shared', 'nanoid', 'yaml'],
  banner: {
    js: "#!/usr/bin/env node\nimport { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
