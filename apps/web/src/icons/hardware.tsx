import type { SVGProps } from 'react';

// Hardware glyphs drawn on Lucide's grid (24px, 1.5 stroke, round joins) so
// they sit beside Lucide icons without looking borrowed.
type Props = SVGProps<SVGSVGElement> & { size?: number };

function Glyph({ size = 16, children, ...rest }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Chip with pins on four sides. */
export const McuIcon = (p: Props) => (
  <Glyph {...p}>
    <rect x="6" y="6" width="12" height="12" rx="1" />
    <path d="M9 3v3M12 3v3M15 3v3M9 18v3M12 18v3M15 18v3M3 9h3M3 12h3M3 15h3M18 9h3M18 12h3M18 15h3" />
  </Glyph>
);

/** Board with a pin header and a SoC. */
export const SbcIcon = (p: Props) => (
  <Glyph {...p}>
    <rect x="3" y="5" width="18" height="14" rx="1.5" />
    <path d="M6 8h.01M8.5 8h.01M11 8h.01M13.5 8h.01M16 8h.01M18.5 8h.01" />
    <rect x="9" y="11" width="6" height="5" rx="0.5" />
  </Glyph>
);

/** Sensing element under two field arcs. */
export const SensorIcon = (p: Props) => (
  <Glyph {...p}>
    <rect x="7" y="12" width="10" height="9" rx="1" />
    <path d="M9 8.5a4 4 0 0 1 6 0M6.5 5.5a7.5 7.5 0 0 1 11 0" />
  </Glyph>
);

/** Servo body with output shaft and horn. */
export const ActuatorIcon = (p: Props) => (
  <Glyph {...p}>
    <circle cx="12" cy="14" r="6" />
    <circle cx="12" cy="14" r="1.5" />
    <path d="M12 12.5V4M8 4h8" />
  </Glyph>
);

/** Cell with terminal and polarity mark. */
export const PowerIcon = (p: Props) => (
  <Glyph {...p}>
    <rect x="3" y="7" width="16" height="10" rx="1.5" />
    <path d="M21 10.5v3M8 12h4M10 10v4" />
  </Glyph>
);

/** Antenna radiating both ways. */
export const CommIcon = (p: Props) => (
  <Glyph {...p}>
    <path d="M12 21v-9" />
    <circle cx="12" cy="10" r="1.5" />
    <path d="M8.5 6.5a5 5 0 0 0 0 7M15.5 6.5a5 5 0 0 1 0 7M5.5 3.5a9 9 0 0 0 0 13M18.5 3.5a9 9 0 0 1 0 13" />
  </Glyph>
);
