import type { AnalyzeResponse, FunctionInfo } from "@/lib/types";
import { fmtDate } from "@/lib/format";
import { CardTitle, Skeleton } from "../ui";
import { RiskSummary } from "./RiskSummary";
import { MetricsSection } from "./MetricsSection";
import { RiskFactors } from "./RiskFactors";
import { FunctionsTable } from "./FunctionsTable";
import { ModelVotes } from "./ModelVotes";

export function ResultsView({
  result,
  onSelectFunction,
}: {
  result: AnalyzeResponse;
  onSelectFunction?: (fn: FunctionInfo) => void;
}) {
  const flagged = result.functions.filter((f) => f.flags.length > 0).length;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[12px] text-[#6b6a6a] uppercase" style={{ letterSpacing: "0.04em" }}>
        <span>File <b className="font-medium text-ink normal-case">{result.filename || "untitled.py"}</b></span>
        <span>Model <b className="font-medium text-ink">{result.model.name}</b></span>
        <span>Scan <b className="font-medium text-ink normal-case">{result.id}</b></span>
        <span>{fmtDate(result.created_at)}</span>
        <span>{result.latency_ms.toFixed(1)} ms</span>
      </div>

      <RiskSummary result={result} />

      <div className="card p-6">
        <CardTitle eyebrow="Top risk factors" title="What drives this score" />
        <RiskFactors factors={result.risk_factors} />
      </div>

      <MetricsSection metrics={result.metrics} />

      <div className="card p-6">
        <CardTitle
          eyebrow="Functions"
          title={`${result.functions.length} function${result.functions.length === 1 ? "" : "s"}${flagged ? `, ${flagged} flagged` : ""}`}
          right={onSelectFunction ? <span className="hidden text-caption text-body md:block">Click a row to jump to it in the editor</span> : undefined}
        />
        <FunctionsTable functions={result.functions} onSelect={onSelectFunction} />
      </div>

      <div className="card p-6">
        <CardTitle eyebrow="What every model says" title={`${result.model_votes.length} models, one file`} />
        <ModelVotes votes={result.model_votes} selected={result.model.key} />
      </div>
    </div>
  );
}

export function ResultsSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading results">
      <Skeleton className="h-4 w-1/2" />
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Skeleton className="h-[300px]" />
        <Skeleton className="h-[300px]" />
      </div>
      <Skeleton className="h-[320px]" />
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Skeleton className="h-[420px]" />
        <Skeleton className="h-[420px]" />
      </div>
      <Skeleton className="h-[240px]" />
    </div>
  );
}
