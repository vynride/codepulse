"use client";

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtNum } from "@/lib/format";
import { groupLabel } from "@/lib/theme";
import type { MetricItem } from "@/lib/types";
import { CardTitle } from "../ui";
import { ChartTooltip, AXIS_TICK } from "../charts";

const MAX_RATIO = 4;
const OK = "#a9adc6";
const WARN = "#e8336f";

interface Row {
  label: string;
  ratio: number;
  shown: number;
  clipped: boolean;
  m: MetricItem;
}

export function MetricsChart({ metrics }: { metrics: MetricItem[] }) {
  const rows: Row[] = metrics
    .filter((m) => m.ideal !== null && m.ideal !== 0)
    .map((m) => {
      const ratio = m.value / (m.ideal as number);
      return { label: m.label, ratio, shown: Math.min(ratio, MAX_RATIO), clipped: ratio > MAX_RATIO, m };
    });
  // Metrics whose ideal is 0 (e.g. "no complex functions") cannot be expressed as a ratio.
  const zeroIdeal = metrics.filter((m) => m.ideal === 0);
  const zeroNote =
    zeroIdeal.length > 0 ? (
      <ul className="mt-3 space-y-1 text-caption text-[#4a4a4a]">
        {zeroIdeal.map((m) => (
          <li key={m.key} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: m.status === "warn" ? WARN : OK }} aria-hidden />
            {m.label}: <b className="font-mono font-medium">{fmtNum(m.value)}</b> (ideal 0)
          </li>
        ))}
      </ul>
    ) : null;
  if (rows.length === 0) return <>{zeroNote ?? <p className="text-body-md text-body">No thresholded metrics for this file.</p>}</>;
  const height = Math.max(220, rows.length * 34 + 50);
  const domainMax = Math.max(1.5, Math.ceil(Math.max(...rows.map((r) => r.shown)) * 2) / 2);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-caption text-[#4a4a4a]">
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: WARN }} />Outside threshold</span>
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: OK }} />Within threshold</span>
        <span className="inline-flex items-center gap-2"><span className="h-3 w-0 border-l-2 border-dashed border-ink" />Ideal (value ÷ ideal = 1)</span>
      </div>
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 56, bottom: 8, left: 8 }} barCategoryGap={6}>
            <CartesianGrid horizontal={false} stroke="#ebebeb" />
            <XAxis
              type="number"
              domain={[0, domainMax]}
              tick={AXIS_TICK}
              tickFormatter={(v: number) => `${v}×`}
              axisLine={{ stroke: "#c4c4c4" }}
              tickLine={false}
            />
            <YAxis type="category" dataKey="label" width={190} tick={{ ...AXIS_TICK, fill: "#2a2a2a", fontSize: 12 }} axisLine={false} tickLine={false} interval={0} />
            <Tooltip
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
              content={({ active, payload }) => {
                const r = payload?.[0]?.payload as Row | undefined;
                if (!active || !r) return null;
                return (
                  <ChartTooltip title={r.m.label}>
                    <div>Value: <b>{fmtNum(r.m.value)}</b></div>
                    <div>Ideal: {r.m.higher_is_better ? "≥" : "≤"} {fmtNum(r.m.ideal)}</div>
                    <div>Ratio: {r.ratio.toFixed(2)}×</div>
                    <div className="mt-1" style={{ color: r.m.status === "warn" ? WARN : "#4a4a4a" }}>
                      {r.m.status === "warn" ? "Outside threshold" : "Within threshold"}
                    </div>
                  </ChartTooltip>
                );
              }}
            />
            <ReferenceLine x={1} stroke="#000" strokeDasharray="4 3" strokeWidth={1.5} label={{ value: "IDEAL", position: "top", fill: "#000", fontSize: 10, fontFamily: "var(--font-jetbrains)" }} />
            <Bar
              dataKey="shown"
              radius={[0, 4, 4, 0]}
              maxBarSize={18}
              isAnimationActive={false}
              label={{
                position: "right",
                fill: "#2a2a2a",
                fontSize: 11,
                fontFamily: "var(--font-jetbrains)",
                formatter: (v: unknown) => {
                  const n = Number(v);
                  return n >= MAX_RATIO ? `≥${MAX_RATIO}×` : `${n.toFixed(2)}×`;
                },
              }}
            >
              {rows.map((r) => (
                <Cell key={r.m.key} fill={r.m.status === "warn" ? WARN : OK} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {zeroNote}
      <p className="mt-2 text-caption text-[#6b6a6a]">
        Each bar is the metric divided by its threshold. For metrics where higher is better (e.g. docstring coverage),
        a bar below 1× is the warning.
      </p>
    </div>
  );
}

export function MetricsTable({ metrics }: { metrics: MetricItem[] }) {
  const groups = new Map<string, MetricItem[]>();
  for (const m of metrics) {
    if (!groups.has(m.group)) groups.set(m.group, []);
    groups.get(m.group)!.push(m);
  }
  return (
    <div className="overflow-x-auto">
      <table className="table-cp text-[14px]">
        <thead>
          <tr>
            <th>Metric</th>
            <th className="text-right">Value</th>
            <th className="text-right">Ideal</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {[...groups.entries()].map(([g, items]) => (
            <GroupRows key={g} group={g} items={items} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupRows({ group, items }: { group: string; items: MetricItem[] }) {
  return (
    <>
      <tr>
        <td colSpan={4} className="!py-2 bg-[#fafafa]">
          <span className="eyebrow text-body">{groupLabel(group)}</span>
        </td>
      </tr>
      {items.map((m) => (
        <tr key={m.key}>
          <td className="!py-2">{m.label}</td>
          <td className="!py-2 text-right font-mono tabular-nums">{fmtNum(m.value)}</td>
          <td className="!py-2 text-right font-mono whitespace-nowrap text-body tabular-nums">
            {m.ideal === null ? "—" : `${m.higher_is_better ? "≥" : "≤"} ${fmtNum(m.ideal)}`}
          </td>
          <td className="!py-2">
            {m.status === "warn" ? (
              <span className="eyebrow rounded-sm px-1.5 py-0.5" style={{ background: "#fde0ea", color: "#9b0e3e" }}>Warn</span>
            ) : (
              <span className="eyebrow text-body">OK</span>
            )}
          </td>
        </tr>
      ))}
    </>
  );
}

export function MetricsSection({ metrics }: { metrics: MetricItem[] }) {
  const warnCount = metrics.filter((m) => m.status === "warn").length;
  return (
    <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
      <div className="card p-6">
        <CardTitle
          eyebrow="Metrics vs thresholds"
          title={warnCount ? `${warnCount} metric${warnCount > 1 ? "s" : ""} outside the recommended range` : "All metrics within range"}
        />
        <MetricsChart metrics={metrics} />
      </div>
      <div className="card p-6">
        <CardTitle eyebrow="All structural metrics" title={`${metrics.length} features`} />
        <div className="max-h-[560px] overflow-y-auto">
          <MetricsTable metrics={metrics} />
        </div>
      </div>
    </div>
  );
}
