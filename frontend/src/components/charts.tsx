import type { ReactNode } from "react";

export const AXIS_TICK = { fill: "#6b6a6a", fontSize: 11, fontFamily: "var(--font-jetbrains)" } as const;

export function ChartTooltip({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <div className="pointer-events-none rounded-sm border border-hairline bg-white px-3 py-2 text-[12px] leading-[18px] text-ink shadow-[0_4px_10px_rgba(1,1,32,0.1)]">
      {title && <div className="mb-1 font-medium">{title}</div>}
      {children}
    </div>
  );
}

export function LegendItem({ color, label, dashed = false }: { color: string; label: ReactNode; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-caption text-[#2a2a2a]">
      {dashed ? (
        <span className="w-4 border-t-2 border-dashed" style={{ borderColor: color }} />
      ) : (
        <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: color }} />
      )}
      {label}
    </span>
  );
}
