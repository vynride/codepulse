import type { Metadata } from "next";
import { MethodologyView } from "@/components/MethodologyView";

export const metadata: Metadata = { title: "Methodology — CodePulse" };

export default function MethodologyPage() {
  return <MethodologyView />;
}
