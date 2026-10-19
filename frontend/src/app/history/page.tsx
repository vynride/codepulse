import type { Metadata } from "next";
import { HistoryView } from "@/components/HistoryView";

export const metadata: Metadata = { title: "Scan history — CodePulse" };

export default function HistoryPage() {
  return <HistoryView />;
}
