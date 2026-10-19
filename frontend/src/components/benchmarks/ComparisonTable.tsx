import { ShieldCheck, Trophy } from "lucide-react";
import { modelColor } from "@/lib/theme";
import type { ModelMetrics } from "@/lib/types";

type Col = { key: string; label: string; get: (m: ModelMetrics) => number | undefined; fmt: (m: ModelMetrics) => string; lowerIsBetter?: boolean };

const COLS: Col[] = [
  { key: "accuracy", label: "Accuracy", get: (m) => m.accuracy, fmt: (m) => m.accuracy.toFixed(3) },
  { key: "precision", label: "Precision", get: (m) => m.precision, fmt: (m) => m.precision.toFixed(3) },
  { key: "recall", label: "Recall", get: (m) => m.recall, fmt: (m) => m.recall.toFixed(3) },
  { key: "f1", label: "F1 macro", get: (m) => m.f1, fmt: (m) => m.f1.toFixed(3) },
  { key: "roc_auc", label: "ROC-AUC", get: (m) => m.roc_auc, fmt: (m) => m.roc_auc.toFixed(3) },
  { key: "cv", label: "CV F1 (5-fold)", get: (m) => m.cv_f1_mean, fmt: (m) => `${m.cv_f1_mean.toFixed(3)} ± ${m.cv_f1_std.toFixed(3)}` },
  {
    key: "xrepo",
    label: "Cross-repo F1",
    get: (m) => m.cross_repo_f1_mean,
    fmt: (m) =>
      m.cross_repo_f1_mean === undefined || m.cross_repo_f1_mean === null
        ? "—"
        : `${m.cross_repo_f1_mean.toFixed(3)} ± ${(m.cross_repo_f1_std ?? 0).toFixed(3)}`,
  },
  { key: "latency", label: "Latency", get: (m) => m.latency_ms, fmt: (m) => `${m.latency_ms.toFixed(2)} ms`, lowerIsBetter: true },
  { key: "train", label: "Train time", get: (m) => m.train_time_s, fmt: (m) => `${m.train_time_s.toFixed(1)} s`, lowerIsBetter: true },
];

export function ComparisonTable({ models, best, defaultKey }: { models: ModelMetrics[]; best: string; defaultKey?: string }) {
  const bestByCol = Object.fromEntries(
    COLS.map((c) => {
      const vals = models.map(c.get).filter((v): v is number => typeof v === "number");
      if (vals.length === 0) return [c.key, NaN];
      return [c.key, c.lowerIsBetter ? Math.min(...vals) : Math.max(...vals)];
    }),
  );
  return (
    <div className="overflow-x-auto rounded-sm border border-hairline">
      <table className="table-cp text-[13px] [&_td]:!px-3 [&_th]:!px-3">
        <thead>
          <tr>
            <th>Model</th>
            {COLS.map((c) => (
              <th key={c.key} className="text-right">
                {c.label}
                {c.lowerIsBetter ? " ↓" : " ↑"}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {models.map((m) => (
            <tr key={m.key} className={m.key === defaultKey ? "bg-[#fdf8ec]" : m.key === best ? "bg-[#f7f7fd]" : ""}>
              <td className="min-w-[200px]">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ background: modelColor(m.key) }} aria-hidden />
                  <span className="font-medium">{m.name}</span>
                  {m.key === best && (
                    <span className="eyebrow inline-flex items-center gap-1 rounded-sm bg-ink px-1.5 py-0.5 whitespace-nowrap text-white">
                      <Trophy size={10} aria-hidden /> Best F1
                    </span>
                  )}
                  {m.key === defaultKey && (
                    <span className="eyebrow inline-flex items-center gap-1 rounded-sm border border-ink px-1.5 py-0.5 whitespace-nowrap text-ink">
                      <ShieldCheck size={10} aria-hidden /> Default
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[12px] text-body">{m.family}</div>
              </td>
              {COLS.map((c) => {
                const isBest = c.get(m) === bestByCol[c.key];
                return (
                  <td key={c.key} className={`text-right font-mono whitespace-nowrap tabular-nums ${isBest ? "font-medium text-ink" : "text-[#6b6a6a]"}`}>
                    {isBest ? <span className="border-b-2 border-ink pb-0.5">{c.fmt(m)}</span> : c.fmt(m)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {defaultKey && defaultKey !== best && (
        <p className="border-t border-hairline bg-[#fdf8ec] px-4 py-2.5 text-caption text-[#2a2a2a]">
          <b className="font-medium">Why the default isn&apos;t the top scorer:</b> the default is a monotonically
          constrained ordinal model — more size or complexity can never lower its predicted risk. It trades about 0.02
          F1 for explanations that agree with software-engineering knowledge.
        </p>
      )}
      <p className="border-t border-hairline px-4 py-2.5 text-caption text-[#6b6a6a]">
        Held-out test set (20%). Underlined = best in column. Precision, recall and F1 are macro-averaged over the three
        classes; ROC-AUC is one-vs-rest macro. Cross-repo F1 holds out whole repositories (5-fold GroupKFold) to test generalisation to unseen projects. Latency is per-file prediction time.
      </p>
    </div>
  );
}
