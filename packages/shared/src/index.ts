export const DOMAINS = ['fullstack', 'ai', 'hardware'] as const;
export type Domain = (typeof DOMAINS)[number];
