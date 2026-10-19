"use client";

import { getMetrics } from "@/lib/api";
import { fmtDate, fmtDay, fmtParams } from "@/lib/format";
import { modelColor } from "@/lib/theme";
import { useAsync } from "@/lib/useAsync";
import { Band, CardTitle, HeroBand, Notice, SectionHeader, Skeleton, StatTile } from "../ui";
import { ComparisonTable } from "./ComparisonTable";
import { ClassDistributionBar, ConfusionMatrixPanel, FeatureImportanceChart, GroupedMetricsChart, RocPanel } from "./Charts";
import { GridSearchPanel } from "./GridSearchPanel";

export function BenchmarksView() {
  const { data, error, offline, loading, reload } = useAsync(getMetrics);
  const best = data?.models.find((m) => m.key === data.best_model);
  const defaultKey = data?.default_model ?? data?.best_model;
  const def = data?.models.find((m) => m.key === defaultKey);
  const focus = defaultKey ?? data?.best_model ?? "";

  return (
    <>
      <HeroBand
        eyebrow="Model benchmark"
        title="Classic models, one held-out test set"
        lead="Linear, bagged, boosted, kernel and monotonically constrained ordinal models — each tuned with GridSearchCV and evaluated on the same 20% of files they never saw during training."
      >
        {best && (
          <div className="flex flex-col gap-2">
            {def && def.key !== best.key && (
              <div className="flex flex-wrap items-center gap-3">
                <span className="eyebrow rounded-sm bg-dark-soft px-2 py-1.5 text-white">Default · {def.name}</span>
                <span className="eyebrow text-white/60">Macro-F1 {def.f1.toFixed(3)} · ROC-AUC {def.roc_auc.toFixed(3)}</span>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <span className="eyebrow rounded-sm bg-dark-soft px-2 py-1.5 text-white">Best F1 · {best.name}</span>
              <span className="eyebrow text-white/60">Macro-F1 {best.f1.toFixed(3)} · ROC-AUC {best.roc_auc.toFixed(3)}</span>
            </div>
          </div>
        )}
      </HeroBand>

      {loading ? (
        <Band>
          <div className="grid gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[150px]" />)}
          </div>
          <Skeleton className="mt-10 h-[280px]" />
          <Skeleton className="mt-10 h-[380px]" />
        </Band>
      ) : error || !data ? (
        <Band>
          <Notice kind={offline ? "offline" : "error"} title={offline ? "Backend not reachable" : "Could not load metrics"}>
            {error}{" "}
            <button type="button" className="underline" onClick={reload}>Retry</button>
          </Notice>
        </Band>
      ) : (
        <>
          <Band>
            <SectionHeader
              eyebrow="Dataset"
              title="What the models were trained on"
              lead={`Files snapshotted on ${fmtDay(data.dataset.snapshot_date)}; labels count bug-fix commits until ${fmtDay(data.dataset.window_end)}. Trained ${fmtDate(data.trained_at)}.`}
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile label="Python files" value={data.dataset.n_samples.toLocaleString()} sub="labelled samples" />
              <StatTile label="Repositories" value={data.dataset.repos.length} sub="open-source projects" />
              <StatTile
                label="Train / test"
                value={
                  <span>
                    {data.dataset.n_train.toLocaleString()}
                    <span className="text-[#6b6a6a]"> / </span>
                    {data.dataset.n_test.toLocaleString()}
                  </span>
                }
                sub="stratified 80 / 20 split"
              />
              <div className="rounded-sm bg-accent-mint p-6 md:p-8">
                <p className="eyebrow mb-4 text-[#4a4a4a]">Class distribution</p>
                <ClassDistributionBar dist={data.dataset.class_distribution} />
              </div>
            </div>
            {data.dataset.repos.length > 0 && <RepoStrip repos={data.dataset.repos} />}
          </Band>

          <Band className="border-t border-hairline">
            <SectionHeader eyebrow="Comparison" title="Head-to-head on the test set" />
            <ComparisonTable models={data.models} best={data.best_model} defaultKey={data.default_model} />
            <div className="mt-8 card p-6">
              <CardTitle eyebrow="Main metrics" title="Accuracy, precision, recall, F1 and ROC-AUC per model" />
              <GroupedMetricsChart models={data.models} />
            </div>
          </Band>

          <Band className="border-t border-hairline">
            <SectionHeader eyebrow="Errors" title="Where each model goes wrong" />
            <div className="grid gap-6 xl:grid-cols-2">
              <div className="card p-6">
                <CardTitle eyebrow="Confusion matrix" title="True vs predicted class" />
                <ConfusionMatrixPanel models={data.models} initial={focus} />
              </div>
              <div className="card p-6">
                <CardTitle eyebrow="ROC curves" title="One-vs-rest, per class" />
                <RocPanel models={data.models} initial={focus} />
              </div>
            </div>
          </Band>

          <Band className="border-t border-hairline">
            <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
              <div className="card p-6">
                <CardTitle
                  eyebrow={`Feature importance · ${def?.name ?? focus}`}
                  title={data.default_model ? "Which features the default model relies on" : "Which features the best model relies on"}
                />
                <FeatureImportanceChart items={data.feature_importance} modelName={def?.name ?? focus} />
              </div>
              <div className="card p-6">
                <CardTitle eyebrow="Tuned hyper-parameters" title="GridSearchCV winners" />
                <ul className="divide-y divide-hairline">
                  {data.models.map((m) => (
                    <li key={m.key} className="py-3">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: modelColor(m.key) }} aria-hidden />
                        <span className="font-medium">{m.name}</span>
                      </div>
                      <p className="mt-1 text-caption text-[#555]">{m.description}</p>
                      <p className="mt-1 font-mono text-[12px] break-words text-[#2a2a2a]">{fmtParams(m.best_params) || "defaults"}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Band>
        </>
      )}

      <section className="bg-canvas-dark text-on-dark">
        <div className="container-cp py-14 md:py-20">
          <p className="eyebrow mb-3 text-accent-periwinkle">Live experiment</p>
          <h2 className="mb-6 text-display-lg font-medium md:text-display-xl">Watch a grid search run</h2>
          <GridSearchPanel />
        </div>
      </section>
    </>
  );
}

function RepoStrip({ repos }: { repos: { name: string; files: number }[] }) {
  const sorted = [...repos].sort((a, b) => b.files - a.files);
  const max = sorted[0]?.files || 1;
  return (
    <div className="mt-8 card p-6">
      <p className="eyebrow mb-4 text-body">Files per repository</p>
      <div className="grid gap-x-8 gap-y-2 md:grid-cols-2">
        {sorted.map((r) => (
          <div key={r.name} className="grid grid-cols-[150px_1fr_56px] items-center gap-3 text-[13px]">
            <span className="truncate font-mono">{r.name}</span>
            <div className="h-2 rounded-sm bg-hairline">
              <div className="h-2 rounded-sm bg-[#3d4fa8]" style={{ width: `${(r.files / max) * 100}%` }} />
            </div>
            <span className="text-right font-mono tabular-nums text-[#4a4a4a]">{r.files.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
