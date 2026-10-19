"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getScan } from "@/lib/api";
import { useAsync } from "@/lib/useAsync";
import { Band, HeroBand, Notice } from "./ui";
import { ResultsSkeleton, ResultsView } from "./results/ResultsView";

export function ScanDetail({ id }: { id: string }) {
  const { data, error, offline, status, loading, reload } = useAsync(() => getScan(id), [id]);

  return (
    <>
      <HeroBand compact ribbon={false} eyebrow={`Scan ${id}`} title={data ? data.filename || "Untitled file" : "Scan report"}>
        <Link href="/history" className="btn btn-ghost-dark">
          <ArrowLeft size={16} aria-hidden /> All scans
        </Link>
      </HeroBand>
      <Band tone="soft">
        {loading ? (
          <ResultsSkeleton />
        ) : error || !data ? (
          <Notice
            kind={offline ? "offline" : "error"}
            title={offline ? "Backend not reachable" : status === 404 ? "Scan not found" : "Could not load scan"}
          >
            {status === 404 ? `No stored scan has the id “${id}”.` : error}{" "}
            {status !== 404 && <button type="button" className="underline" onClick={reload}>Retry</button>}
          </Notice>
        ) : (
          <>
            <p className="mb-6 text-caption text-[#6b6a6a]">
              Read-only view of a stored analysis. The original source code is not stored, so the editor is not shown.
            </p>
            <ResultsView result={data} />
          </>
        )}
      </Band>
    </>
  );
}

export function ScanDetailSkeleton() {
  return (
    <>
      <section className="bg-canvas-dark">
        <div className="container-cp py-14 md:py-16">
          <div className="skeleton-dark mb-5 h-3 w-32" />
          <div className="skeleton-dark h-14 w-2/3" />
        </div>
      </section>
      <Band tone="soft">
        <ResultsSkeleton />
      </Band>
    </>
  );
}
