import { RISK_COLORS } from "@/lib/theme";
import { RISK_LEVELS, type AnalyzeResponse } from "@/lib/types";
import { RiskBadge } from "../ui";

// Semicircle gauge: arc from 180° (left) to 0° (right).
function polar(cx: number, cy: number, r: number, t: number) {
  const a = Math.PI * (1 - t);
  return [cx + r * Math.cos(a), cy - r * Math.sin(a)] as const;
}
function arc(cx: number, cy: number, r: number, t0: number, t1: number) {
  const [x0, y0] = polar(cx, cy, r, t0);
  const [x1, y1] = polar(cx, cy, r, t1);
  return `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`;
}

export function RiskGauge({ score, level }: { score: number; level: AnalyzeResponse["risk_level"] }) {
  const t = Math.min(1, Math.max(0, score / 100));
  const c = RISK_COLORS[level];
  const cx = 150,
    cy = 150,
    r = 120;
  const [nx, ny] = polar(cx, cy, r, t);
  return (
    <figure className="w-full">
      <svg viewBox="0 0 300 180" className="mx-auto w-full max-w-[340px]" role="img" aria-label={`Risk score ${score.toFixed(1)} out of 100, ${c.label} risk`}>
        <path d={arc(cx, cy, r, 0, 1)} stroke="#ebebeb" strokeWidth="18" fill="none" strokeLinecap="butt" />
        {t > 0.002 && <path d={arc(cx, cy, r, 0, t)} stroke={c.fg} strokeWidth="18" fill="none" strokeLinecap="butt" />}
        {/* tick marks at 0, 25, 50, 75, 100 */}
        {[0, 0.25, 0.5, 0.75, 1].map((v) => {
          const [x0, y0] = polar(cx, cy, r - 16, v);
          const [x1, y1] = polar(cx, cy, r - 22, v);
          const [lx, ly] = polar(cx, cy, r - 36, v);
          return (
            <g key={v}>
              <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="#c4c4c4" strokeWidth="1" />
              <text x={lx} y={ly + 3} textAnchor="middle" fontSize="10" fill="#959494" fontFamily="var(--font-jetbrains)">
                {v * 100}
              </text>
            </g>
          );
        })}
        <circle cx={nx} cy={ny} r="7" fill="#fff" stroke={c.fg} strokeWidth="3" />
        <text x={cx} y={cy - 18} textAnchor="middle" fontSize="54" fontWeight="500" letterSpacing="-2" fill="#000">
          {score.toFixed(1)}
        </text>
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize="11" fill="#959494" fontFamily="var(--font-jetbrains)" letterSpacing="0.6">
          RISK SCORE / 100
        </text>
      </svg>
    </figure>
  );
}

export function ProbabilityBars({ probabilities }: { probabilities: AnalyzeResponse["probabilities"] }) {
  return (
    <div className="space-y-3" aria-label="Class probabilities">
      {RISK_LEVELS.map((lvl) => {
        const p = probabilities[lvl] ?? 0;
        const c = RISK_COLORS[lvl];
        return (
          <div key={lvl} className="grid grid-cols-[72px_1fr_48px] items-center gap-3" title={`P(${lvl}) = ${p.toFixed(3)}`}>
            <span className="eyebrow text-[#4a4a4a]">{c.label}</span>
            <div className="h-3 rounded-sm bg-hairline">
              <div className="h-3 rounded-sm transition-[width] duration-500" style={{ width: `${Math.max(0.5, p * 100)}%`, background: c.fg }} />
            </div>
            <span className="text-right font-mono text-[13px] tabular-nums">{(p * 100).toFixed(1)}%</span>
          </div>
        );
      })}
    </div>
  );
}

export function RiskSummary({ result }: { result: AnalyzeResponse }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
      <div className="card flex flex-col items-center justify-center p-6 md:p-8">
        <RiskGauge score={result.risk_score} level={result.risk_level} />
        <div className="mt-2">
          <RiskBadge level={result.risk_level} size="lg" />
        </div>
      </div>
      <div className="card flex flex-col justify-between gap-6 p-6 md:p-8">
        <div>
          <p className="eyebrow mb-2 text-body">Class probabilities</p>
          <h3 className="mb-6 text-display-md font-medium">How confident is {result.model.name}?</h3>
          <ProbabilityBars probabilities={result.probabilities} />
        </div>
        <p className="text-caption text-[#6b6a6a]">
          Risk score = 100 × (0.5 · P(medium) + 1.0 · P(high)). A score of 0 means the model is certain the file will
          see no bug-fix commits; 100 means it is certain it will see many. The label covers the whole file, so risk
          grows with size — a short tangled snippet can still score low; the per-function flags below capture local
          complexity independently.
        </p>
      </div>
    </div>
  );
}
