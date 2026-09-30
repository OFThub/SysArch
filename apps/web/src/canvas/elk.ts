import ELK from 'elkjs/lib/elk-api';
import workerUrl from 'elkjs/lib/elk-worker.min.js?url';

let elk: InstanceType<typeof ELK> | null = null;

/** One layout worker for the app, created on first use so it never costs startup time. */
export const getElk = () => (elk ??= new ELK({ workerUrl }));
