import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DOMAINS } from '@sysarch/shared';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <p>SysArch: {DOMAINS.join(', ')}</p>
  </StrictMode>,
);
