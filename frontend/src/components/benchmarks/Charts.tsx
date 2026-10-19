"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MODEL_SHORT, modelColor, RISK_COLORS } from "@/lib/theme";
import { RISK_LEVELS, type FeatureImportance, type ModelMetrics, type RiskLevel } from "@/lib/types";
import { AXIS_TICK, ChartTooltip, LegendItem } from "../charts";
import { ToggleGroup } from "../ui";

const METRIC_KEYS = [
  { key: "accuracy", label: "Accuracy" },
  { key: "precision", label: "Precision" },
  { key: "recall", label: "Recall" },
  { key: "f1", label: "F1 macro" },
  { key: "roc_auc", label: "ROC-AUC" },
] as const;

export function GroupedMetricsChart({ models }: { models: ModelMetrics[] }) {
  const data = METRIC_KEYS.map((mk) => ({
    metric: mk.label,
    ...Object.fromEntries(models.map((m) => [m.key, m[mk.key]])),
  }));
  const minVal = Math.min(...models.flatMap((m) => METRIC_KEYS.map((k) => m[k.key])));
  const lo = Math.max(0, Math.floor((minVal - 0.1) * 10) / 10);
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4">
        {models.map((m) => (
          <LegendItem key={m.key} color={modelColor(m.key)} label={m.name} />
        ))}
      </div>
      <div className="h-[340px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 8, bottom: 4, left: -8 }} barGap={2} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="#ebebeb" />
            <XAxis dataKey="metric" tick={{ ...AXIS_TICK, fill: "#2a2a2a" }} axisLine={{ stroke: "#c4c4c4" }} tickLine={false} />
            <YAxis domain={[lo, 1]} ticks={Array.from({ length: Math.round((1 - lo) * 10) + 1 }, (_, i) => Math.round((lo + i * 0.1) * 10) / 10)} tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v: number) => v.toFixed(1)} allowDataOverflow />
            <Tooltip
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <ChartTooltip title={String(label)}>
                    {payload.map((p) => (
                      <div key={String(p.dataKey)} className="flex items-center justify-between gap-4">
                        <span className="inline-flex items-center gap-2">
                          <span className="h-2 w-2 rounded-[2px]" style={{ background: modelColor(String(p.dataKey)) }} />
                          {models.find((m) => m.key === p.dataKey)?.name}
                        </span>
                        <span className="font-mono tabular-nums">{Number(p.value).toFixed(3)}</span>
                      </div>
                    ))}
                  </ChartTooltip>
                );
              }}
            />
            {models.map((m) => (
              <Bar key={m.key} dataKey={m.key} name={m.name} fill={modelColor(m.key)} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-caption text-[#6b6a6a]">Y-axis starts at {lo.toFixed(1)} to make differences between models visible.</p>
    </div>
  );
}

function ModelToggle({ models, value, onChange }: { models: ModelMetrics[]; value: string; onChange: (k: string) => void }) {
  return (
    <ToggleGroup
      label="Model"
      size="sm"
      value={value}
      onChange={onChange}
      options={models.map((m) => ({ value: m.key as string, label: MODEL_SHORT[m.key] ?? m.name, color: modelColor(m.key) }))}
    />
  );
}

// Sequential single-hue ramp (white → indigo) for heatmap cells.
function heat(t: number) {
  const a = [255, 255, 255];
  const b = [45, 55, 140];
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * Math.min(1, Math.max(0, t))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function ConfusionMatrixPanel({ models, initial }: { models: ModelMetrics[]; initial: string }) {
  const [key, setKey] = useState(initial);
  const m = models.find((x) => x.key === key) ?? models[0];
  const cm = m.confusion_matrix;
  const rowSums = cm.map((r) => r.reduce((a, b) => a + b, 0));
  const total = rowSums.reduce((a, b) => a + b, 0);
  const correct = cm.reduce((a, r, i) => a + (r[i] ?? 0), 0);
  return (
    <div>
      <div className="mb-5">
        <ModelToggle models={models} value={m.key} onChange={setKey} />
      </div>
      <div className="overflow-x-auto">
        <div className="inline-grid min-w-[360px] grid-cols-[auto_repeat(3,minmax(88px,1fr))] gap-[2px]">
          <div />
          {RISK_LEVELS.map((l) => (
            <div key={l} className="eyebrow pb-2 text-center text-[#4a4a4a]">Pred. {RISK_COLORS[l].label}</div>
          ))}
          {cm.map((row, i) => (
            <Row key={i} label={RISK_COLORS[RISK_LEVELS[i]].label} row={row} rowSum={rowSums[i]} diag={i} />
          ))}
        </div>
      </div>
      <p className="mt-4 text-caption text-[#6b6a6a]">
        Rows are the true class, columns the prediction. Shading and percentages are row-normalised (= recall per
        class). {correct.toLocaleString()} of {total.toLocaleString()} test files ({((correct / Math.max(1, total)) * 100).toFixed(1)}%) are on the diagonal.
      </p>
    </div>
  );
}

function Row({ label, row, rowSum, diag }: { label: string; row: number[]; rowSum: number; diag: number }) {
  return (
    <>
      <div className="eyebrow flex items-center pr-3 text-right text-[#4a4a4a]">True {label}</div>
      {row.map((v, j) => {
        const p = rowSum ? v / rowSum : 0;
        const dark = p > 0.45;
        return (
          <div
            key={j}
            className={`flex h-[84px] flex-col items-center justify-center rounded-sm ${j === diag ? "ring-1 ring-ink/30 ring-inset" : "border border-hairline"}`}
            style={{ background: heat(p), color: dark ? "#fff" : "#000" }}
            title={`True ${label}, predicted ${RISK_COLORS[RISK_LEVELS[j]].label}: ${v} (${(p * 100).toFixed(1)}%)`}
          >
            <span className="text-display-md font-medium tabular-nums">{v.toLocaleString()}</span>
            <span className="font-mono text-[11px] tabular-nums opacity-80">{(p * 100).toFixed(1)}%</span>
          </div>
        );
      })}
    </>
  );
}

export function RocPanel({ models, initial }: { models: ModelMetrics[]; initial: string }) {
  const [key, setKey] = useState(initial);
  const m = models.find((x) => x.key === key) ?? models[0];
  const series = RISK_LEVELS.map((lvl) => {
    const c = m.roc_curves[lvl];
    const fpr = c?.fpr ?? [];
    const tpr = c?.tpr ?? [];
    const pts = fpr.map((x, i) => ({ x, y: tpr[i] ?? 0 }));
    let auc = 0;
    for (let i = 1; i < pts.length; i++) auc += (pts[i].x - pts[i - 1].x) * (pts[i].y + pts[i - 1].y) / 2;
    return { lvl, pts, auc };
  });
  return (
    <div>
      <div className="mb-5">
        <ModelToggle models={models} value={m.key} onChange={setKey} />
      </div>
      <div className="mb-3 flex flex-wrap gap-4">
        {series.map((s) => (
          <LegendItem key={s.lvl} color={RISK_COLORS[s.lvl].fg} label={`${RISK_COLORS[s.lvl].label} vs rest (AUC ${s.pts.length ? s.auc.toFixed(3) : "—"})`} />
        ))}
        <LegendItem color="#959494" dashed label="Chance" />
      </div>
      <div className="mx-auto aspect-square w-full max-w-[460px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart margin={{ top: 8, right: 16, bottom: 24, left: 4 }}>
            <CartesianGrid stroke="#ebebeb" />
            <XAxis
              type="number"
              dataKey="x"
              domain={[0, 1]}
              ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: "#c4c4c4" }}
              label={{ value: "False positive rate", position: "insideBottom", offset: -14, fill: "#6b6a6a", fontSize: 11 }}
            />
            <YAxis
              type="number"
              domain={[0, 1]}
              ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              label={{ value: "True positive rate", angle: -90, position: "insideLeft", offset: 14, fill: "#6b6a6a", fontSize: 11 }}
            />
            <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="#959494" strokeDasharray="4 4" />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const pt = payload[0].payload as { x: number; y: number };
                return (
                  <ChartTooltip title={String(payload[0].name)}>
                    <div>FPR {pt.x.toFixed(3)}</div>
                    <div>TPR {pt.y.toFixed(3)}</div>
                  </ChartTooltip>
                );
              }}
            />
            {series.map((s) => (
              <Line
                key={s.lvl}
                data={s.pts}
                dataKey="y"
                name={`${RISK_COLORS[s.lvl].label} vs rest`}
                stroke={RISK_COLORS[s.lvl].fg}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                type="linear"
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function FeatureImportanceChart({ items, modelName }: { items: FeatureImportance[]; modelName: string }) {
  const data = items.slice(0, 15).map((d) => ({ ...d }));
  const color = "#3d4fa8";
  return (
    <div>
      <div style={{ height: data.length * 30 + 50 }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, bottom: 16, left: 8 }} barCategoryGap={5}>
            <CartesianGrid horizontal={false} stroke="#ebebeb" />
            <XAxis
              type="number"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: "#c4c4c4" }}
              tickFormatter={(v: number) => v.toFixed(3)}
              label={{ value: "Drop in macro-F1 when shuffled", position: "insideBottom", offset: -10, fill: "#6b6a6a", fontSize: 11 }}
            />
            <YAxis type="category" dataKey="label" width={210} tick={{ ...AXIS_TICK, fill: "#2a2a2a", fontSize: 12 }} tickLine={false} axisLine={false} interval={0} />
            <Tooltip
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
              content={({ active, payload }) => {
                const d = payload?.[0]?.payload as FeatureImportance | undefined;
                if (!active || !d) return null;
                return (
                  <ChartTooltip title={d.label}>
                    <div className="font-mono">{d.feature}</div>
                    <div>Importance: {d.importance.toFixed(4)}</div>
                  </ChartTooltip>
                );
              }}
            />
            <Bar
              dataKey="importance"
              fill={color}
              radius={[0, 4, 4, 0]}
              maxBarSize={18}
              isAnimationActive={false}
              label={{ position: "right", fill: "#2a2a2a", fontSize: 11, fontFamily: "var(--font-jetbrains)", formatter: (v: unknown) => Number(v).toFixed(3) }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-caption text-[#6b6a6a]">
        Permutation importance for {modelName} on the test set: how much macro-F1 falls when one feature&apos;s values are
        randomly shuffled. Top {data.length} shown.
      </p>
    </div>
  );
}

export function ClassDistributionBar({ dist }: { dist: Record<RiskLevel, number> }) {
  const total = RISK_LEVELS.reduce((a, l) => a + (dist[l] ?? 0), 0) || 1;
  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-sm">
        {RISK_LEVELS.map((l) => (
          <div key={l} style={{ width: `${((dist[l] ?? 0) / total) * 100}%`, background: RISK_COLORS[l].fg }} />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {RISK_LEVELS.map((l) => (
          <div key={l}>
            <p className="eyebrow text-[#4a4a4a]">{RISK_COLORS[l].label}</p>
            <p className="font-mono text-[13px] tabular-nums">
              {(dist[l] ?? 0).toLocaleString()} <span className="text-[#6b6a6a]">· {(((dist[l] ?? 0) / total) * 100).toFixed(0)}%</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
