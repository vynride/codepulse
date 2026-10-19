"use client";

import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { ApiError, errorMessage, trainBaseline } from "@/lib/api";
import { fmtParams } from "@/lib/format";
import type { TrainBaselineResponse } from "@/lib/types";
import { Notice, Spinner } from "../ui";

export function GridSearchPanel() {
  const [running, setRunning] = useState(false);
  const [res, setRes] = useState<TrainBaselineResponse | null>(null);
  const [err, setErr] = useState<{ msg: string; offline: boolean } | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const run = async () => {
    setRunning(true);
    setErr(null);
    setElapsed(0);
    const t0 = Date.now();
    const timer = setInterval(() => setElapsed((Date.now() - t0) / 1000), 200);
    try {
      setRes(await trainBaseline());
    } catch (e) {
      setErr({ msg: errorMessage(e), offline: e instanceof ApiError && e.kind === "network" });
    } finally {
      clearInterval(timer);
      setRunning(false);
    }
  };

  const best = res ? Math.max(...res.grid.map((g) => g.mean_f1)) : 0;
  const sorted = res ? [...res.grid].sort((a, b) => b.mean_f1 - a.mean_f1) : [];

  return (
    <div>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <p className="max-w-2xl text-body-md text-white/70">
          Re-runs <code className="font-mono text-[0.9em] text-white">GridSearchCV</code> for Logistic Regression on the
          cached training set with stratified 5-fold cross-validation, live on the server. Takes about 5–20 seconds and
          does not replace the served models.
        </p>
        <button type="button" className="btn btn-mint shrink-0" onClick={run} disabled={running}>
          {running ? <Spinner /> : <FlaskConical size={16} aria-hidden />}
          {running ? `Running ${elapsed.toFixed(1)}s` : "Run live grid search"}
        </button>
      </div>

      {err && (
        <div className="mt-6">
          <Notice kind={err.offline ? "offline" : "error"} title={err.offline ? "Backend not reachable" : "Grid search failed"}>
            {err.msg}
          </Notice>
        </div>
      )}

      {running && (
        <div className="mt-8 space-y-2" aria-busy="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton-dark h-10" />
          ))}
        </div>
      )}

      {res && !running && (
        <div className="mt-8">
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="Duration" value={`${res.duration_s.toFixed(1)} s`} />
            <Tile label="Best CV F1" value={res.best_cv_f1.toFixed(3)} />
            <Tile label="Test F1" value={res.test_f1.toFixed(3)} />
            <Tile label="Best params" value={<span className="font-mono text-[14px]">{fmtParams(res.best_params)}</span>} />
          </div>
          <div className="overflow-x-auto rounded-sm border border-dark-line">
            <table className="w-full text-left text-[14px]">
              <thead>
                <tr className="bg-dark-soft">
                  {["Rank", "Parameters", "Mean CV F1", "Std", ""].map((h) => (
                    <th key={h} className="eyebrow px-4 py-3 text-white/60">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((g, i) => {
                  const isBest = g.mean_f1 === best;
                  return (
                    <tr key={i} className={`border-t border-dark-line ${isBest ? "bg-white/5" : ""}`}>
                      <td className="px-4 py-2.5 font-mono text-white/60 tabular-nums">{i + 1}</td>
                      <td className="px-4 py-2.5 font-mono text-[13px]">{fmtParams(g.params)}</td>
                      <td className={`px-4 py-2.5 font-mono tabular-nums ${isBest ? "text-white" : "text-white/80"}`}>{g.mean_f1.toFixed(3)}</td>
                      <td className="px-4 py-2.5 font-mono text-white/60 tabular-nums">± {g.std_f1.toFixed(3)}</td>
                      <td className="w-[30%] px-4 py-2.5">
                        <div className="h-2 rounded-sm bg-dark-soft">
                          <div className="h-2 rounded-sm" style={{ width: `${(g.mean_f1 / best) * 100}%`, background: isBest ? "#c8f6f9" : "#7a76f2" }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="card-dark p-5">
      <p className="eyebrow mb-3 text-white/50">{label}</p>
      <div className="text-display-md font-medium">{value}</div>
    </div>
  );
}
