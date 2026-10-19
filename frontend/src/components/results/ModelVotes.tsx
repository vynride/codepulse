import { modelColor, RISK_COLORS } from "@/lib/theme";
import { RISK_LEVELS, type ModelVote } from "@/lib/types";
import { RiskBadge } from "../ui";

export function ModelVotes({ votes, selected }: { votes: ModelVote[]; selected: string }) {
  const levels = new Set(votes.map((v) => v.risk_level));
  return (
    <div>
      <p className="mb-5 text-body-md text-[#555]">
        {levels.size === 1
          ? `All ${votes.length} models agree on ${RISK_COLORS[votes[0].risk_level].label.toLowerCase()} risk.`
          : `The models disagree — ${votes.filter((v) => v.risk_level === "high").length} of ${votes.length} predict high risk.`}
      </p>
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        {votes.map((v) => {
          const isSel = v.key === selected;
          return (
            <div key={v.key} className={`card relative overflow-hidden p-5 ${isSel ? "border-ink" : ""}`}>
              <div className="absolute inset-x-0 top-0 h-1" style={{ background: modelColor(v.key) }} aria-hidden />
              <div className="mb-4 flex items-start justify-between gap-2">
                <p className="text-body-md font-medium">{v.name}</p>
                {isSel && <span className="eyebrow rounded-sm bg-ink px-1.5 py-0.5 text-white">Selected</span>}
              </div>
              <div className="mb-3 flex items-end justify-between">
                <span className="text-display-lg font-medium tabular-nums">{v.risk_score.toFixed(1)}</span>
                <RiskBadge level={v.risk_level} size="sm" />
              </div>
              <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-sm" aria-label="Class probabilities">
                {RISK_LEVELS.map((l) => (
                  <div
                    key={l}
                    style={{ width: `${(v.probabilities[l] ?? 0) * 100}%`, background: RISK_COLORS[l].fg }}
                    title={`${RISK_COLORS[l].label}: ${((v.probabilities[l] ?? 0) * 100).toFixed(1)}%`}
                  />
                ))}
              </div>
              <div className="mt-2 flex justify-between font-mono text-[11px] text-[#6b6a6a] tabular-nums">
                {RISK_LEVELS.map((l) => (
                  <span key={l}>
                    {RISK_COLORS[l].label[0]} {((v.probabilities[l] ?? 0) * 100).toFixed(0)}%
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
