import type { ArchDoc } from '../schema';
import { edgeVision } from './edge-vision';
import { ragApp } from './rag';
import { saasApp } from './saas';
import { seraIot } from './sera-iot';

export { edgeVision, ragApp, saasApp, seraIot };

/** Starter designs offered for a new project, in the order they are shown. */
export const TEMPLATES: readonly { id: string; build: () => ArchDoc }[] = [
  { id: 'sera-iot', build: seraIot },
  { id: 'edge-vision', build: edgeVision },
  { id: 'rag', build: ragApp },
  { id: 'saas', build: saasApp },
];
