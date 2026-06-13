interface DotMatrixLoaderProps {
  /** CSS color for the "on" (active) dots */
  colorOn?: string;
  /** CSS color for the "off" (background) dots */
  colorOff?: string;
  /** Animation duration */
  duration?: string;
  /** Size in px */
  size?: number;
  className?: string;
}

export function DotMatrixLoader({
  colorOn = "#ffffff",
  colorOff = "#1e1e24",
  duration = "2.400s",
  size = 42,
  className = ""
}: DotMatrixLoaderProps) {
  return (
    <svg
      viewBox="0 0 42 42"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Loading"
      width={size}
      height={size}
      className={className}
      style={
        {
          "--on": colorOn,
          "--off": colorOff,
          "--dur": duration
        } as React.CSSProperties
      }
    >
      <style>{`
        .dmx circle { fill: var(--off); }
        .dmx circle.on { fill: var(--on); }
        @media (prefers-reduced-motion: reduce) { .dmx circle { animation: none !important; } }
        @keyframes f0000010000000000 { 0% { opacity: 0; } 31.24% { opacity: 0; } 31.25% { opacity: 1; } 37.49% { opacity: 1; } 37.50% { opacity: 0; } 100% { opacity: 0; } }
        @keyframes f0000100000000000 { 0% { opacity: 0; } 24.99% { opacity: 0; } 25.00% { opacity: 1; } 31.24% { opacity: 1; } 31.25% { opacity: 0; } 100% { opacity: 0; } }
        @keyframes f0000000010000000 { 0% { opacity: 0; } 49.99% { opacity: 0; } 50.00% { opacity: 1; } 56.24% { opacity: 1; } 56.25% { opacity: 0; } 100% { opacity: 0; } }
        @keyframes f0000011000000000 { 0% { opacity: 0; } 31.24% { opacity: 0; } 31.25% { opacity: 1; } 43.74% { opacity: 1; } 43.75% { opacity: 0; } 100% { opacity: 0; } }
        @keyframes f0001100011110000 { 0% { opacity: 0; } 18.74% { opacity: 0; } 18.75% { opacity: 1; } 31.24% { opacity: 1; } 31.25% { opacity: 0; } 49.99% { opacity: 0; } 50.00% { opacity: 1; } 74.99% { opacity: 1; } 75.00% { opacity: 0; } 100% { opacity: 0; } }
        @keyframes f0001000111100000 { 0% { opacity: 0; } 18.74% { opacity: 0; } 18.75% { opacity: 1; } 24.99% { opacity: 1; } 25.00% { opacity: 0; } 43.74% { opacity: 0; } 43.75% { opacity: 1; } 68.74% { opacity: 1; } 68.75% { opacity: 0; } 100% { opacity: 0; } }
        @keyframes f0000000111000000 { 0% { opacity: 0; } 43.74% { opacity: 0; } 43.75% { opacity: 1; } 62.49% { opacity: 1; } 62.50% { opacity: 0; } 100% { opacity: 0; } }
        @keyframes f0000011100000000 { 0% { opacity: 0; } 31.24% { opacity: 0; } 31.25% { opacity: 1; } 49.99% { opacity: 1; } 50.00% { opacity: 0; } 100% { opacity: 0; } }
        @keyframes f0000111000000000 { 0% { opacity: 0; } 24.99% { opacity: 0; } 25.00% { opacity: 1; } 43.74% { opacity: 1; } 43.75% { opacity: 0; } 100% { opacity: 0; } }
        @keyframes f0001110001111000 { 0% { opacity: 0; } 18.74% { opacity: 0; } 18.75% { opacity: 1; } 37.49% { opacity: 1; } 37.50% { opacity: 0; } 56.24% { opacity: 0; } 56.25% { opacity: 1; } 81.24% { opacity: 1; } 81.25% { opacity: 0; } 100% { opacity: 0; } }
        @keyframes f0011000111110000 { 0% { opacity: 0; } 12.49% { opacity: 0; } 12.50% { opacity: 1; } 24.99% { opacity: 1; } 25.00% { opacity: 0; } 43.74% { opacity: 0; } 43.75% { opacity: 1; } 74.99% { opacity: 1; } 75.00% { opacity: 0; } 100% { opacity: 0; } }
        @keyframes f0000001111110000 { 0% { opacity: 0; } 37.49% { opacity: 0; } 37.50% { opacity: 1; } 74.99% { opacity: 1; } 75.00% { opacity: 0; } 100% { opacity: 0; } }
        @keyframes f0000001111100000 { 0% { opacity: 0; } 37.49% { opacity: 0; } 37.50% { opacity: 1; } 68.74% { opacity: 1; } 68.75% { opacity: 0; } 100% { opacity: 0; } }
        @keyframes f0000001111000000 { 0% { opacity: 0; } 37.49% { opacity: 0; } 37.50% { opacity: 1; } 62.49% { opacity: 1; } 62.50% { opacity: 0; } 100% { opacity: 0; } }
        @keyframes f0000001110000000 { 0% { opacity: 0; } 37.49% { opacity: 0; } 37.50% { opacity: 1; } 56.24% { opacity: 1; } 56.25% { opacity: 0; } 100% { opacity: 0; } }
        @keyframes f0011111100001000 { 0% { opacity: 0; } 12.49% { opacity: 0; } 12.50% { opacity: 1; } 49.99% { opacity: 1; } 50.00% { opacity: 0; } 74.99% { opacity: 0; } 75.00% { opacity: 1; } 81.24% { opacity: 1; } 81.25% { opacity: 0; } 100% { opacity: 0; } }
        @keyframes f0111111111111100 { 0% { opacity: 0; } 6.24% { opacity: 0; } 6.25% { opacity: 1; } 87.49% { opacity: 1; } 87.50% { opacity: 0; } 100% { opacity: 0; } }
      `}</style>
      <g className="dmx">
        <circle cx="3" cy="3" r="2" />
        <circle cx="9" cy="3" r="2" />
        <circle className="on" cx="9" cy="3" r="2" opacity="0" style={{ animation: "f0000010000000000 var(--dur) linear infinite" }} />
        <circle cx="15" cy="3" r="2" />
        <circle cx="21" cy="3" r="2" />
        <circle className="on" cx="21" cy="3" r="2" opacity="0" style={{ animation: "f0000100000000000 var(--dur) linear infinite" }} />
        <circle cx="27" cy="3" r="2" />
        <circle className="on" cx="27" cy="3" r="2" opacity="0" style={{ animation: "f0000000010000000 var(--dur) linear infinite" }} />
        <circle cx="33" cy="3" r="2" />
        <circle cx="39" cy="3" r="2" />
        <circle cx="3" cy="9" r="2" />
        <circle className="on" cx="3" cy="9" r="2" opacity="0" style={{ animation: "f0000011000000000 var(--dur) linear infinite" }} />
        <circle cx="9" cy="9" r="2" />
        <circle className="on" cx="9" cy="9" r="2" opacity="0" style={{ animation: "f0000010000000000 var(--dur) linear infinite" }} />
        <circle cx="15" cy="9" r="2" />
        <circle className="on" cx="15" cy="9" r="2" opacity="0" style={{ animation: "f0000100000000000 var(--dur) linear infinite" }} />
        <circle cx="21" cy="9" r="2" />
        <circle className="on" cx="21" cy="9" r="2" opacity="0" style={{ animation: "f0001100011110000 var(--dur) linear infinite" }} />
        <circle cx="27" cy="9" r="2" />
        <circle className="on" cx="27" cy="9" r="2" opacity="0" style={{ animation: "f0001000111100000 var(--dur) linear infinite" }} />
        <circle cx="33" cy="9" r="2" />
        <circle className="on" cx="33" cy="9" r="2" opacity="0" style={{ animation: "f0000000111000000 var(--dur) linear infinite" }} />
        <circle cx="39" cy="9" r="2" />
        <circle cx="3" cy="15" r="2" />
        <circle className="on" cx="3" cy="15" r="2" opacity="0" style={{ animation: "f0000011100000000 var(--dur) linear infinite" }} />
        <circle cx="9" cy="15" r="2" />
        <circle className="on" cx="9" cy="15" r="2" opacity="0" style={{ animation: "f0000111000000000 var(--dur) linear infinite" }} />
        <circle cx="15" cy="15" r="2" />
        <circle className="on" cx="15" cy="15" r="2" opacity="0" style={{ animation: "f0001110001111000 var(--dur) linear infinite" }} />
        <circle cx="21" cy="15" r="2" />
        <circle className="on" cx="21" cy="15" r="2" opacity="0" style={{ animation: "f0011000111110000 var(--dur) linear infinite" }} />
        <circle cx="27" cy="15" r="2" />
        <circle className="on" cx="27" cy="15" r="2" opacity="0" style={{ animation: "f0000001111110000 var(--dur) linear infinite" }} />
        <circle cx="33" cy="15" r="2" />
        <circle className="on" cx="33" cy="15" r="2" opacity="0" style={{ animation: "f0000001111100000 var(--dur) linear infinite" }} />
        <circle cx="39" cy="15" r="2" />
        <circle className="on" cx="39" cy="15" r="2" opacity="0" style={{ animation: "f0000001111000000 var(--dur) linear infinite" }} />
        <circle cx="3" cy="21" r="2" />
        <circle className="on" cx="3" cy="21" r="2" opacity="0" style={{ animation: "f0000001110000000 var(--dur) linear infinite" }} />
        <circle cx="9" cy="21" r="2" />
        <circle className="on" cx="9" cy="21" r="2" opacity="0" style={{ animation: "f0000111000000000 var(--dur) linear infinite" }} />
        <circle cx="15" cy="21" r="2" />
        <circle className="on" cx="15" cy="21" r="2" opacity="0" style={{ animation: "f0011111100001000 var(--dur) linear infinite" }} />
        <circle cx="21" cy="21" r="2" />
        <circle className="on" cx="21" cy="21" r="2" opacity="0" style={{ animation: "f0111111111111100 var(--dur) linear infinite" }} />
        <circle cx="27" cy="21" r="2" />
        <circle className="on" cx="27" cy="21" r="2" opacity="0" style={{ animation: "f0011111100001000 var(--dur) linear infinite" }} />
        <circle cx="33" cy="21" r="2" />
        <circle className="on" cx="33" cy="21" r="2" opacity="0" style={{ animation: "f0000111000000000 var(--dur) linear infinite" }} />
        <circle cx="39" cy="21" r="2" />
        <circle className="on" cx="39" cy="21" r="2" opacity="0" style={{ animation: "f0000001110000000 var(--dur) linear infinite" }} />
        <circle cx="3" cy="27" r="2" />
        <circle className="on" cx="3" cy="27" r="2" opacity="0" style={{ animation: "f0000001111000000 var(--dur) linear infinite" }} />
        <circle cx="9" cy="27" r="2" />
        <circle className="on" cx="9" cy="27" r="2" opacity="0" style={{ animation: "f0000001111100000 var(--dur) linear infinite" }} />
        <circle cx="15" cy="27" r="2" />
        <circle className="on" cx="15" cy="27" r="2" opacity="0" style={{ animation: "f0000001111110000 var(--dur) linear infinite" }} />
        <circle cx="21" cy="27" r="2" />
        <circle className="on" cx="21" cy="27" r="2" opacity="0" style={{ animation: "f0011000111110000 var(--dur) linear infinite" }} />
        <circle cx="27" cy="27" r="2" />
        <circle className="on" cx="27" cy="27" r="2" opacity="0" style={{ animation: "f0001110001111000 var(--dur) linear infinite" }} />
        <circle cx="33" cy="27" r="2" />
        <circle className="on" cx="33" cy="27" r="2" opacity="0" style={{ animation: "f0000111000000000 var(--dur) linear infinite" }} />
        <circle cx="39" cy="27" r="2" />
        <circle className="on" cx="39" cy="27" r="2" opacity="0" style={{ animation: "f0000011100000000 var(--dur) linear infinite" }} />
        <circle cx="3" cy="33" r="2" />
        <circle cx="9" cy="33" r="2" />
        <circle className="on" cx="9" cy="33" r="2" opacity="0" style={{ animation: "f0000000111000000 var(--dur) linear infinite" }} />
        <circle cx="15" cy="33" r="2" />
        <circle className="on" cx="15" cy="33" r="2" opacity="0" style={{ animation: "f0001000111100000 var(--dur) linear infinite" }} />
        <circle cx="21" cy="33" r="2" />
        <circle className="on" cx="21" cy="33" r="2" opacity="0" style={{ animation: "f0001100011110000 var(--dur) linear infinite" }} />
        <circle cx="27" cy="33" r="2" />
        <circle className="on" cx="27" cy="33" r="2" opacity="0" style={{ animation: "f0000100000000000 var(--dur) linear infinite" }} />
        <circle cx="33" cy="33" r="2" />
        <circle className="on" cx="33" cy="33" r="2" opacity="0" style={{ animation: "f0000010000000000 var(--dur) linear infinite" }} />
        <circle cx="39" cy="33" r="2" />
        <circle className="on" cx="39" cy="33" r="2" opacity="0" style={{ animation: "f0000011000000000 var(--dur) linear infinite" }} />
        <circle cx="3" cy="39" r="2" />
        <circle cx="9" cy="39" r="2" />
        <circle cx="15" cy="39" r="2" />
        <circle className="on" cx="15" cy="39" r="2" opacity="0" style={{ animation: "f0000000010000000 var(--dur) linear infinite" }} />
        <circle cx="21" cy="39" r="2" />
        <circle className="on" cx="21" cy="39" r="2" opacity="0" style={{ animation: "f0000100000000000 var(--dur) linear infinite" }} />
        <circle cx="27" cy="39" r="2" />
        <circle cx="33" cy="39" r="2" />
        <circle className="on" cx="33" cy="39" r="2" opacity="0" style={{ animation: "f0000010000000000 var(--dur) linear infinite" }} />
        <circle cx="39" cy="39" r="2" />
      </g>
    </svg>
  );
}
