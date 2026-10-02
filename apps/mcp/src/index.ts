import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { httpApi } from './api';
import { createSysarchServer } from './server';

// stdout carries the protocol; anything for humans goes to stderr.
const url = process.env.SYSARCH_URL;
const key = process.env.SYSARCH_API_KEY;
if (!url || !key) {
  console.error(
    'Set SYSARCH_URL (e.g. http://localhost:8787) and SYSARCH_API_KEY ' +
      '(create one under "API anahtarları" in SysArch).',
  );
  process.exit(1);
}

await createSysarchServer(httpApi(url, key)).connect(new StdioServerTransport());
