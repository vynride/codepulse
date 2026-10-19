import type { ReactNode } from "react";
import { AlertTriangle, ServerOff } from "lucide-react";
import { GradientRibbon } from "./GradientRibbon";
import { RISK_COLORS } from "@/lib/theme";
import type { RiskLevel } from "@/lib/types";

export function HeroBand({
  eyebrow,
  title,
  lead,
  children,
  ribbon = true,
  compact = false,
}: {
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  children?: ReactNode;
  ribbon?: boolean;
  compact?: boolean;
}) {
  return (
    <section className="relative overflow-hidden bg-canvas-dark text-on-dark">
      <div className={`container-cp grid items-center gap-10 ${compact ? "py-14 md:py-16" : "py-16 md:py-20"} md:grid-cols-2`}>
        {ribbon && (
          <div className="order-first md:order-last">
            <GradientRibbon className="mx-auto h-auto w-full max-w-[520px]" id={`ribbon-${eyebrow.length}`} />
          </div>
        )}
        <div className={ribbon ? "" : "md:col-span-2 max-w-3xl"}>
          <p className="eyebrow mb-5 text-accent-periwinkle">{eyebrow}</p>
          <h1 className="text-[40px] leading-[46px] font-medium tracking-[-1.1px] md:text-display-xxl md:leading-[70.4px] md:tracking-[-1.92px]">{title}</h1>
          {lead && <p className="mt-4 max-w-xl text-body-lg text-white/70">{lead}</p>}
          {children && <div className="mt-8">{children}</div>}
        </div>
      </div>
    </section>
  );
}

export function SectionHeader({ eyebrow, title, lead, right }: { eyebrow: string; title: ReactNode; lead?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        <p className="eyebrow mb-3 text-body">{eyebrow}</p>
        <h2 className="text-display-lg font-medium md:text-display-xl">{title}</h2>
        {lead && <p className="mt-3 text-body-md text-[#555]">{lead}</p>}
      </div>
      {right}
    </div>
  );
}

export function CardTitle({ eyebrow, title, right }: { eyebrow?: string; title: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        {eyebrow && <p className="eyebrow mb-2 text-body">{eyebrow}</p>}
        <h3 className="text-display-md font-medium">{title}</h3>
      </div>
      {right}
    </div>
  );
}

export function RiskBadge({ level, size = "md" }: { level: RiskLevel; size?: "sm" | "md" | "lg" }) {
  const c = RISK_COLORS[level];
  const pad = size === "lg" ? "px-3 py-1.5 text-[13px]" : size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-[11px]";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm font-mono font-medium uppercase ${pad}`}
      style={{ background: c.bg, color: c.text, letterSpacing: "0.06em" }}
    >
      <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: c.fg }} aria-hidden />
      {c.label} risk
    </span>
  );
}

export function StatTile({ label, value, sub, tint = "mint" }: { label: string; value: ReactNode; sub?: ReactNode; tint?: "mint" | "periwinkle" | "white" }) {
  const bg = tint === "mint" ? "bg-accent-mint" : tint === "periwinkle" ? "bg-[#e6e5ff]" : "bg-white border border-hairline";
  return (
    <div className={`rounded-sm p-6 md:p-8 ${bg}`}>
      <p className="eyebrow mb-4 text-[#4a4a4a]">{label}</p>
      <div className="text-display-lg font-medium md:text-display-xl">{value}</div>
      {sub && <div className="mt-2 text-caption text-[#4a4a4a]">{sub}</div>}
    </div>
  );
}

export function ToggleGroup<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "md",
}: {
  options: { value: T; label: ReactNode; color?: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full flex-wrap gap-1 rounded-sm bg-hairline p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`inline-flex items-center gap-2 rounded-sm font-mono font-medium uppercase transition-colors ${
              size === "sm" ? "min-h-8 px-3 text-[11px]" : "min-h-9 px-4 text-[12px]"
            } ${active ? "bg-ink text-white" : "bg-white text-ink hover:bg-[#f6f6f6]"}`}
            style={{ letterSpacing: "0.05em" }}
          >
            {o.color && <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: o.color }} aria-hidden />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Notice({ kind = "error", title, children }: { kind?: "error" | "offline" | "info"; title: ReactNode; children?: ReactNode }) {
  const Icon = kind === "offline" ? ServerOff : AlertTriangle;
  const color = kind === "info" ? "#3d4fa8" : "#9b0e3e";
  const bg = kind === "info" ? "#eef0fb" : "#fdf0f4";
  return (
    <div role="alert" className="flex gap-3 rounded-sm border p-4" style={{ borderColor: `${color}33`, background: bg }}>
      <Icon size={18} className="mt-0.5 shrink-0" style={{ color }} aria-hidden />
      <div className="min-w-0">
        <p className="text-body-md font-medium" style={{ color }}>{title}</p>
        {children && <div className="mt-1 text-caption text-[#3a3a3a]">{children}</div>}
      </div>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Band({
  children,
  tone = "white",
  className = "",
}: {
  children: ReactNode;
  tone?: "white" | "soft" | "dark";
  className?: string;
}) {
  const bg = tone === "dark" ? "bg-canvas-dark text-on-dark" : tone === "soft" ? "bg-[#fafafa] text-ink" : "bg-white text-ink";
  return (
    <section className={`${bg} ${className}`}>
      <div className="container-cp py-14 md:py-20">{children}</div>
    </section>
  );
}
