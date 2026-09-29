export type Severity = 'error' | 'warning' | 'info';

/**
 * Severity is carried by shape, not hue (amber already means "hardware"):
 * error = filled red badge, warning = hollow triangle, info = ring. Readable
 * without color vision too.
 */
export function SeverityIcon({ severity, size = 14 }: { severity: Severity; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden className="shrink-0">
      {severity === 'error' && (
        <>
          <circle cx="8" cy="8" r="7" fill="var(--danger)" />
          <path
            d="M8 4.5v4.2M8 11h.01"
            stroke="var(--on-danger)"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </>
      )}
      {severity === 'warning' && (
        <>
          <path
            d="M8 1.8 14.6 13.5H1.4Z"
            fill="none"
            stroke="var(--ink)"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path
            d="M8 6.3v3.2M8 11.4h.01"
            stroke="var(--ink)"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </>
      )}
      {severity === 'info' && (
        <circle cx="8" cy="8" r="6" fill="none" stroke="var(--ink-muted)" strokeWidth="1.5" />
      )}
    </svg>
  );
}
