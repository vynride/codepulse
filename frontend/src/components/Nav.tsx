"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { API_DOCS_URL } from "@/lib/api";

const LINKS = [
  { href: "/", label: "Analyze" },
  { href: "/benchmarks", label: "Benchmarks" },
  { href: "/methodology", label: "Methodology" },
  { href: "/history", label: "History" },
] as const;

function isActive(pathname: string, href: string) {
  if (!pathname) return false;
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Nav() {
  return (
    <Suspense fallback={<NavBar pathname="" />}>
      <NavWithPath />
    </Suspense>
  );
}

function NavWithPath() {
  const pathname = usePathname() ?? "/";
  return <NavBar pathname={pathname} />;
}

function NavBar({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-dark-line bg-canvas-dark text-on-dark">
      <nav className="container-cp flex h-16 items-center justify-between gap-6" aria-label="Main">
        <Link href="/" className="flex items-center gap-2 text-[20px] font-medium tracking-[-0.6px]" onClick={() => setOpen(false)}>
          <PulseMark />
          codepulse
        </Link>

        <ul className="hidden items-center gap-6 md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className={`text-body-md transition-colors ${
                  isActive(pathname, l.href) ? "text-white" : "text-white/60 hover:text-white"
                }`}
                aria-current={isActive(pathname, l.href) ? "page" : undefined}
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="hidden md:block">
          <a href={API_DOCS_URL} target="_blank" rel="noreferrer" className="btn btn-ghost-dark min-h-9 px-4 text-[12px]">
            API docs <ArrowUpRight size={14} aria-hidden />
          </a>
        </div>

        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-sm md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>

      {open && (
        <div className="border-t border-dark-line bg-canvas-dark md:hidden">
          <ul className="container-cp flex flex-col py-4">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className={`block py-3 text-display-md ${isActive(pathname, l.href) ? "text-white" : "text-white/60"}`}
                >
                  {l.label}
                </Link>
              </li>
            ))}
            <li className="pt-3">
              <a href={API_DOCS_URL} target="_blank" rel="noreferrer" className="btn btn-ghost-dark w-full">
                API docs <ArrowUpRight size={14} aria-hidden />
              </a>
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}

function PulseMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <rect x="0.5" y="0.5" width="21" height="21" rx="4" fill="none" stroke="#bdbbff" strokeOpacity="0.5" />
      <path d="M3 12h4l2-5 3 9 2-5h5" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
