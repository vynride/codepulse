import { Suspense } from "react";
import { ScanDetail, ScanDetailSkeleton } from "@/components/ScanDetail";

export default function ScanPage({ params }: PageProps<"/history/[id]">) {
  return (
    <Suspense fallback={<ScanDetailSkeleton />}>
      {params.then(({ id }) => (
        <ScanDetail id={id} />
      ))}
    </Suspense>
  );
}
