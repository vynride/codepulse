// The brand gradient ribbon: orange → magenta → periwinkle, hero-scale only.
export function GradientRibbon({ className = "", id = "ribbon" }: { className?: string; id?: string }) {
  const g = `${id}-grad`;
  const g2 = `${id}-grad2`;
  const blur = `${id}-blur`;
  return (
    <svg viewBox="0 0 560 420" className={className} role="presentation" aria-hidden preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id={g} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#fc4c02" />
          <stop offset="50%" stopColor="#ef2cc1" />
          <stop offset="100%" stopColor="#bdbbff" />
        </linearGradient>
        <linearGradient id={g2} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fc4c02" />
          <stop offset="50%" stopColor="#ef2cc1" />
          <stop offset="100%" stopColor="#bdbbff" />
        </linearGradient>
        <filter id={blur} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="18" />
        </filter>
      </defs>
      <path
        d="M-20 330 C 90 330, 140 120, 260 150 S 420 330, 580 90"
        fill="none"
        stroke={`url(#${g})`}
        strokeWidth="70"
        strokeLinecap="round"
        opacity="0.35"
        filter={`url(#${blur})`}
      />
      {Array.from({ length: 14 }).map((_, i) => (
        <path
          key={i}
          d={`M-20 ${340 - i * 4} C 90 ${330 - i * 7}, ${140 + i * 3} ${110 + i * 6}, 260 ${150 + i * 2} S ${420 - i * 4} ${
            330 - i * 9
          }, 580 ${90 + i * 5}`}
          fill="none"
          stroke={`url(#${i % 2 ? g : g2})`}
          strokeWidth={i === 7 ? 3 : 1.4}
          opacity={0.25 + (i / 14) * 0.7}
        />
      ))}
    </svg>
  );
}
