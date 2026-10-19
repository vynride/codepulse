import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { RISK_COLORS } from "@/lib/theme";
import type { RiskFactor } from "@/lib/types";
import { fmtNum } from "@/lib/format";
import { LegendItem } from "../charts";

const UP = RISK_COLORS.high.fg;
const DOWN = RISK_COLORS.low.fg;

export function RiskFactors({ factors }: { factors: RiskFactor[] }) {
  if (factors.length === 0) {
    return <p className="text-body-md text-body">No individual feature moved the score meaningfully.</p>;
  }
  const maxAbs = Math.max(...factors.map((f) => Math.abs(f.impact)), 0.01);
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-4">
        <LegendItem color={UP} label="Increases risk" />
        <LegendItem color={DOWN} label="Decreases risk" />
      </div>
      <ol className="divide-y divide-hairline">
        {factors.map((f) => {
          const up = f.impact >= 0;
          const pct = (Math.abs(f.impact) / maxAbs) * 50;
          return (
            <li key={f.feature} className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:items-center md:gap-6">
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  {up ? <ArrowUpRight size={15} style={{ color: UP }} aria-hidden /> : <ArrowDownRight size={15} style={{ color: DOWN }} aria-hidden />}
                  <span className="text-body-md font-medium">{f.label}</span>
                  {f.value !== null && f.value !== undefined && (
                    <span className="font-mono text-[12px] text-body">= {fmtNum(f.value)}</span>
                  )}
                </div>
                <p className="mt-1 text-caption text-[#555]">{f.description}</p>
              </div>
              <div className="grid grid-cols-[1fr_64px] items-center gap-3" aria-label={`${up ? "+" : "−"}${Math.abs(f.impact).toFixed(1)} points`}>
                <div className="relative h-4">
                  <div className="absolute inset-y-[-4px] left-1/2 w-px bg-[#c4c4c4]" aria-hidden />
                  <div
                    className="absolute top-0 h-4"
                    style={{
                      background: up ? UP : DOWN,
                      width: `${Math.max(pct, 0.6)}%`,
                      left: up ? "50%" : `${50 - Math.max(pct, 0.6)}%`,
                      borderRadius: up ? "0 4px 4px 0" : "4px 0 0 4px",
                    }}
                  />
                </div>
                <span className="text-right font-mono text-[13px] tabular-nums">
                  {up ? "+" : "−"}
                  {Math.abs(f.impact).toFixed(1)}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-caption text-[#6b6a6a]">
        Impact is measured in risk-score points: each feature is replaced by its training-set median and the change in
        the score is attributed to it. &ldquo;Identifier &amp; keyword vocabulary&rdquo; groups all TF-IDF token features.
      </p>
    </div>
  );
}
