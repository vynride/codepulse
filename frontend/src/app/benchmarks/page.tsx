import type { Metadata } from "next";
import { BenchmarksView } from "@/components/benchmarks/BenchmarksView";

export const metadata: Metadata = { title: "Model benchmark — CodePulse" };

export default function BenchmarksPage() {
  return <BenchmarksView />;
}
