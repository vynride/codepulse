"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { getScans } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { MODEL_NAMES, modelColor, RISK_COLORS } from "@/lib/theme";
import type { ModelKey, ScanSummary } from "@/lib/types";
import { useAsync } from "@/lib/useAsync";
import { Band, HeroBand, Notice, RiskBadge, Skeleton } from "./ui";

function modelKeyOf(m: ScanSummary["model"]): string {
  return typeof m === "string" ? m : m.key;
}
function modelNameOf(m: ScanSummary["model"]): string {
  if (typeof m === "string") return MODEL_NAMES[m as ModelKey] ?? m;
  return m.name;
}

export function HistoryView() {
  const router = useRouter();
  const { data, error, offline, loading, reload } = useAsync(() => getScans(50));

  return (
    <>
      <HeroBand
        compact
        ribbon={false}
        eyebrow="History"
        title="Past scans"
        lead="Every analysis is stored by the backend. Open one to see its full report again."
      />
      <Band>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
          </div>
        ) : error || !data ? (
          <Notice kind={offline ? "offline" : "error"} title={offline ? "Backend not reachable" : "Could not load scans"}>
            {error} <button type="button" className="underline" onClick={reload}>Retry</button>
          </Notice>
        ) : data.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="mb-6 text-body-lg text-[#555]">No scans yet.</p>
            <Link href="/" className="btn btn-primary">Analyze a file</Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-sm border border-hairline">
            <table className="table-cp text-[14px]">
              <thead>
                <tr>
                  <th>File</th>
                  <th>When</th>
                  <th>Model</th>
                  <th className="text-right">LOC</th>
                  <th className="text-right">Risk score</th>
                  <th>Level</th>
                </tr>
              </thead>
              <tbody>
                {data.map((s) => (
                  <tr
                    key={s.id}
                    tabIndex={0}
                    className="cursor-pointer hover:bg-[#f7f7fb] focus:bg-[#f0f0fb] focus:outline-none"
                    onClick={() => router.push(`/history/${s.id}`)}
                    onKeyDown={(e) => { if (e.key === "Enter") router.push(`/history/${s.id}`); }}
                  >
                    <td>
                      <Link href={`/history/${s.id}`} className="font-mono text-[13px] hover:underline" onClick={(e) => e.stopPropagation()}>
                        {s.filename || "untitled.py"}
                      </Link>
                      <div className="font-mono text-[11px] text-body">{s.id}</div>
                    </td>
                    <td className="whitespace-nowrap text-[#4a4a4a]">{fmtDate(s.created_at)}</td>
                    <td className="whitespace-nowrap">
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: modelColor(modelKeyOf(s.model)) }} aria-hidden />
                        {modelNameOf(s.model)}
                      </span>
                    </td>
                    <td className="text-right font-mono tabular-nums">{s.loc ? s.loc.toLocaleString() : "—"}</td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-3">
                        <div className="hidden h-2 w-20 rounded-sm bg-hairline sm:block">
                          <div className="h-2 rounded-sm" style={{ width: `${s.risk_score}%`, background: RISK_COLORS[s.risk_level].fg }} />
                        </div>
                        <span className="w-10 font-mono tabular-nums">{s.risk_score.toFixed(1)}</span>
                      </div>
                    </td>
                    <td><RiskBadge level={s.risk_level} size="sm" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Band>
    </>
  );
}
