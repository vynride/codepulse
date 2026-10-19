import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-hairline bg-white text-ink">
      <div className="container-cp grid gap-10 py-16 md:grid-cols-4">
        <div className="md:col-span-2">
          <p className="eyebrow mb-3 text-body">About</p>
          <p className="max-w-md text-body-md text-[#3a3a3a]">
            CodePulse is an academic machine-learning project. It ranks Python files by their likelihood of needing
            bug fixes, using static-analysis metrics and classic scikit-learn classifiers.
          </p>
        </div>
        <div>
          <p className="eyebrow mb-3 text-body">Product</p>
          <ul className="space-y-2 text-body-md">
            <li><Link href="/" className="hover:underline">Analyze a file</Link></li>
            <li><Link href="/history" className="hover:underline">Scan history</Link></li>
          </ul>
        </div>
        <div>
          <p className="eyebrow mb-3 text-body">Research</p>
          <ul className="space-y-2 text-body-md">
            <li><Link href="/benchmarks" className="hover:underline">Model benchmark</Link></li>
            <li><Link href="/methodology" className="hover:underline">Methodology</Link></li>
          </ul>
        </div>
      </div>
      <div className="overflow-hidden" aria-hidden>
        <p
          className="select-none text-center font-medium leading-[0.78] whitespace-nowrap text-[#ebebeb]"
          style={{ fontSize: "clamp(64px, 21vw, 300px)", letterSpacing: "-0.05em" }}
        >
          codepulse
        </p>
      </div>
    </footer>
  );
}
