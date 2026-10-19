"use client";

import { useMemo, useState } from "react";
import { FLAG_LABELS } from "@/lib/theme";
import type { FunctionInfo } from "@/lib/types";

type SortKey = "lineno" | "complexity" | "length" | "nesting" | "params";

const COLS: { key: SortKey; label: string; threshold?: number }[] = [
  { key: "lineno", label: "Line" },
  { key: "complexity", label: "CC", threshold: 10 },
  { key: "length", label: "Lines", threshold: 50 },
  { key: "nesting", label: "Nesting", threshold: 4 },
  { key: "params", label: "Params", threshold: 5 },
];

export function FunctionsTable({ functions, onSelect }: { functions: FunctionInfo[]; onSelect?: (fn: FunctionInfo) => void }) {
  const [sort, setSort] = useState<SortKey>("complexity");
  const [selected, setSelected] = useState<string | null>(null);
  const rows = useMemo(
    () => [...functions].sort((a, b) => (sort === "lineno" ? a.lineno - b.lineno : b[sort] - a[sort])),
    [functions, sort],
  );

  if (functions.length === 0) {
    return <p className="text-body-md text-body">No functions or methods found — the file is module-level code only.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="table-cp text-[14px]">
        <thead>
          <tr>
            <th>Function</th>
            {COLS.map((c) => (
              <th key={c.key} className="text-right">
                <button
                  type="button"
                  onClick={() => setSort(c.key)}
                  className={`uppercase ${sort === c.key ? "text-ink" : ""}`}
                  aria-label={`Sort by ${c.label}`}
                >
                  {c.label}
                  {sort === c.key ? (c.key === "lineno" ? " ↑" : " ↓") : ""}
                </button>
              </th>
            ))}
            <th>Flags</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((fn) => {
            const id = `${fn.name}:${fn.lineno}`;
            const active = selected === id;
            const clickable = Boolean(onSelect);
            return (
              <tr
                key={id}
                onClick={clickable ? () => { setSelected(id); onSelect?.(fn); } : undefined}
                onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(id); onSelect?.(fn); } } : undefined}
                tabIndex={clickable ? 0 : undefined}
                className={`${clickable ? "cursor-pointer hover:bg-[#f7f7fb] focus:bg-[#f0f0fb] focus:outline-none" : ""} ${active ? "bg-[#f0f0fb]" : ""}`}
                title={clickable ? "Show in editor" : undefined}
              >
                <td className="!py-2.5 font-mono text-[13px]">
                  {active && <span className="mr-2 inline-block h-2 w-2 rounded-[2px] bg-accent-periwinkle align-middle" aria-hidden />}
                  {fn.name}
                </td>
                {COLS.map((c) => {
                  const v = fn[c.key];
                  const over = c.threshold !== undefined && v > c.threshold;
                  return (
                    <td key={c.key} className={`!py-2.5 text-right font-mono tabular-nums ${over ? "font-medium text-[#9b0e3e]" : ""}`}>
                      {v}
                    </td>
                  );
                })}
                <td className="!py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {fn.flags.length === 0 ? (
                      <span className="eyebrow text-body">—</span>
                    ) : (
                      fn.flags.map((f) => (
                        <span key={f} className="eyebrow rounded-sm px-1.5 py-0.5 whitespace-nowrap" style={{ background: "#fde0ea", color: "#9b0e3e" }}>
                          {FLAG_LABELS[f] ?? f}
                        </span>
                      ))
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
