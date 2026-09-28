import { nanoid } from 'nanoid';

/** Stable ids for nodes, edges, flows and boundaries; URL-safe, matches the schema's Id rule. */
export const newId = () => nanoid(10);
