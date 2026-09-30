import { writeFile } from 'node:fs/promises';
import { mintSession } from '../apps/server/src/test/session';
import { E2E, e2eEnv } from '../playwright.config';

/** Signs a test user in by writing a real session to the e2e database. */
export default async function globalSetup() {
  const cookie = await mintSession(e2eEnv, { email: 'e2e@example.test', name: 'E2E Kullanıcı' });
  const storage = {
    cookies: [
      {
        name: cookie.name,
        value: cookie.value,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax' as const,
        expires: -1,
      },
    ],
    origins: [],
  };
  await writeFile(`${E2E.tmp}session.json`, JSON.stringify(storage));
}
