"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { FileUp, Play, RotateCcw } from "lucide-react";
import { analyze, ApiError, errorMessage, getHealth, USE_MOCK } from "@/lib/api";
import { DEFAULT_EXAMPLE, EXAMPLES } from "@/lib/examples";
import { MODEL_COLORS, MODEL_SHORT } from "@/lib/theme";
import { MODEL_KEYS, type AnalyzeResponse, type FunctionInfo, type ModelKey } from "@/lib/types";
import type { EditorApi } from "./CodeEditor";
import { HeroBand, Notice, Spinner, ToggleGroup } from "./ui";
import { ResultsSkeleton, ResultsView } from "./results/ResultsView";

const CodeEditor = dynamic(() => import("./CodeEditor"), {
  ssr: false,
  loading: () => <div className="h-[420px] w-full animate-pulse bg-canvas-dark" />,
});

const MAX_CHARS = 200_000;

type ErrorState = { message: string; kind: "syntax" | "network" | "other"; line?: number | null; column?: number | null };

export function AnalyzeView() {
  const [code, setCode] = useState(DEFAULT_EXAMPLE.code);
  const [filename, setFilename] = useState(DEFAULT_EXAMPLE.filename);
  const [model, setModel] = useState<ModelKey>("monotonic_gbdt");
  const [available, setAvailable] = useState<ModelKey[]>(MODEL_KEYS);
  const [defaultModel, setDefaultModel] = useState<ModelKey | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);
  const editorApi = useRef<EditorApi | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  // Default to the backend's best model when it is reachable.
  useEffect(() => {
    let alive = true;
    getHealth()
      .then((h) => {
        if (!alive) return;
        if (h.models_loaded?.length) setAvailable(h.models_loaded);
        const preferred = h.default_model ?? h.best_model;
        if (preferred) {
          setModel(preferred);
          setDefaultModel(preferred);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const onReady = useCallback((api: EditorApi) => {
    editorApi.current = api;
  }, []);

  const clearError = () => {
    setError(null);
    editorApi.current?.clearError();
  };

  const loadCode = (next: string, name: string) => {
    setCode(next);
    setFilename(name);
    clearError();
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.name.endsWith(".py")) {
      setError({ kind: "other", message: "Please choose a Python (.py) file." });
      return;
    }
    const text = await file.text();
    if (text.length > MAX_CHARS) {
      setError({ kind: "other", message: `That file has ${text.length.toLocaleString()} characters — the limit is 200 000.` });
      return;
    }
    loadCode(text, file.name);
  };

  const run = async () => {
    if (!code.trim() || loading) return;
    clearError();
    setLoading(true);
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    try {
      const res = await analyze({ code, filename: filename || undefined, model });
      setResult(res);
    } catch (err) {
      if (err instanceof ApiError && err.kind === "network") {
        setError({ kind: "network", message: err.message });
      } else if (err instanceof ApiError && err.status === 422) {
        setError({ kind: "syntax", message: err.message, line: err.line, column: err.column });
        if (err.line) editorApi.current?.setError(err.line, err.column, err.message);
      } else {
        setError({ kind: "other", message: errorMessage(err) });
      }
    } finally {
      setLoading(false);
    }
  };

  const onSelectFunction = (fn: FunctionInfo) => {
    editorApi.current?.revealLine(fn.lineno, fn.lineno + Math.max(0, fn.length - 1));
    document.getElementById("editor")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const empty = !code.trim();
  const lines = code ? code.split("\n").length : 0;

  return (
    <>
      <HeroBand
        eyebrow="Static analysis × machine learning"
        title="Find the Python files most likely to break next"
        lead="Paste a Python file. CodePulse measures 28 structural metrics and its vocabulary, then asks a panel of classic scikit-learn models how likely the file is to need bug fixes over the next two years."
      >
        <div className="flex flex-wrap gap-3">
          <a href="#editor" className="btn btn-mint">Analyze a file</a>
          <Link href="/methodology" className="btn btn-white">How it works</Link>
        </div>
        {USE_MOCK && <p className="eyebrow mt-6 text-accent-periwinkle">Mock mode — responses are local fixtures</p>}
      </HeroBand>

      <section className="bg-white">
        <div className="container-cp py-14 md:py-20">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="eyebrow mb-3 text-body">Input</p>
              <h2 className="text-display-lg font-medium md:text-display-xl">Paste or upload a file</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="eyebrow mr-1 text-body">Load example</span>
              {EXAMPLES.map((ex) => (
                <button key={ex.id} type="button" className="btn btn-outline min-h-9 px-3 text-[11px]" onClick={() => loadCode(ex.code, ex.filename)}>
                  {ex.label}
                </button>
              ))}
            </div>
          </div>

          <div id="editor" className="scroll-mt-24 overflow-hidden rounded-sm border border-dark-line bg-canvas-dark">
            <div className="flex items-center justify-between gap-3 border-b border-dark-line px-4 py-2.5">
              <input
                aria-label="File name"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                className="w-56 rounded-sm bg-transparent font-mono text-[12px] text-white/80 outline-none placeholder:text-white/30 focus:bg-dark-soft focus:px-2"
                placeholder="filename.py"
              />
              <span className="font-mono text-[11px] text-white/40 tabular-nums">
                {lines} lines · {code.length.toLocaleString()} chars
              </span>
            </div>
            <CodeEditor value={code} onChange={(v) => { setCode(v); if (error?.kind === "syntax") clearError(); }} onReady={onReady} />
          </div>

          <div className="mt-6 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-2">
              <span className="eyebrow text-body">Model</span>
              <ToggleGroup
                label="Model"
                value={model}
                onChange={setModel}
                options={available.map((k) => ({
                  value: k,
                  label: k === defaultModel ? `${MODEL_SHORT[k] ?? k} · default` : (MODEL_SHORT[k] ?? k),
                  color: MODEL_COLORS[k],
                }))}
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <input ref={fileInput} type="file" accept=".py,text/x-python" className="hidden" onChange={onUpload} />
              <button type="button" className="btn btn-outline" onClick={() => fileInput.current?.click()}>
                <FileUp size={16} aria-hidden /> Upload .py
              </button>
              <button type="button" className="btn btn-outline" onClick={() => loadCode("", "untitled.py")} disabled={empty}>
                <RotateCcw size={16} aria-hidden /> Clear
              </button>
              <button type="button" className="btn btn-primary min-w-[150px]" onClick={run} disabled={empty || loading}>
                {loading ? <Spinner /> : <Play size={16} aria-hidden />}
                {loading ? "Analyzing" : "Analyze"}
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-6">
              {error.kind === "network" ? (
                <Notice kind="offline" title="Backend not reachable">{error.message}</Notice>
              ) : error.kind === "syntax" ? (
                <Notice title={error.message}>
                  {error.line ? (
                    <>
                      The file could not be parsed at <b>line {error.line}</b>
                      {error.column ? <>, column {error.column}</> : null}. The line is marked in the editor.
                    </>
                  ) : (
                    "The file could not be parsed."
                  )}
                </Notice>
              ) : (
                <Notice title={error.message} />
              )}
            </div>
          )}
        </div>
      </section>

      <section ref={resultsRef} className="scroll-mt-16 border-t border-hairline bg-[#fafafa]">
        <div className="container-cp py-14 md:py-20">
          <p className="eyebrow mb-3 text-body">Results</p>
          <h2 className="mb-8 text-display-lg font-medium md:text-display-xl">
            {result ? "Defect-risk report" : "Your report will appear here"}
          </h2>
          {loading ? (
            <ResultsSkeleton />
          ) : result ? (
            <ResultsView result={result} onSelectFunction={onSelectFunction} />
          ) : (
            <div className="card p-10 text-center md:p-12">
              <p className="text-body-lg text-[#555]">Run an analysis to see the risk score, the metrics that drive it, and what each model thinks.</p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
