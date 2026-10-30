"use client";

import { monaco } from "@/lib/monaco-setup";
import { useEffect, useLayoutEffect, useRef } from "react";

export interface EditorApi {
  revealLine: (line: number, endLine?: number) => void;
  setError: (line: number, column: number | null, message: string) => void;
  clearError: () => void;
}

type MonacoEditor = monaco.editor.IStandaloneCodeEditor;

const THEME = "codepulse-dark";

monaco.editor.defineTheme(THEME, {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "6f6e8f", fontStyle: "italic" },
    { token: "keyword", foreground: "ef7ad9" },
    { token: "string", foreground: "c8f6f9" },
    { token: "number", foreground: "fd8a5a" },
    { token: "type", foreground: "bdbbff" },
    { token: "identifier", foreground: "e8e8f4" },
    { token: "delimiter", foreground: "9a99b8" },
  ],
  colors: {
    "editor.background": "#010120",
    "editor.foreground": "#e8e8f4",
    "editorLineNumber.foreground": "#4a4a6a",
    "editorLineNumber.activeForeground": "#bdbbff",
    "editor.lineHighlightBackground": "#0b0b30",
    "editor.lineHighlightBorder": "#0b0b30",
    "editor.selectionBackground": "#3d3a8a",
    "editor.inactiveSelectionBackground": "#26264a",
    "editorCursor.foreground": "#bdbbff",
    "editorIndentGuide.background1": "#1a1a3a",
    "editorIndentGuide.activeBackground1": "#3a3a5e",
    "editorGutter.background": "#010120",
    "scrollbarSlider.background": "#31364188",
    "scrollbarSlider.hoverBackground": "#313641cc",
    "editorWidget.background": "#0b0b30",
    "editorWidget.border": "#26263a",
    "editorError.foreground": "#e8336f",
  },
});

const OPTIONS: monaco.editor.IStandaloneEditorConstructionOptions = {
  language: "python",
  theme: THEME,
  fontFamily: "var(--font-jetbrains), ui-monospace, Menlo, monospace",
  fontSize: 13,
  lineHeight: 20,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  glyphMargin: true,
  padding: { top: 16, bottom: 16 },
  renderLineHighlight: "all",
  tabSize: 4,
  automaticLayout: true,
  smoothScrolling: true,
  scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
};

function makeApi(ed: MonacoEditor, highlightTimer: { current: ReturnType<typeof setTimeout> | null }): EditorApi {
  let highlightIds: string[] = [];
  let errorIds: string[] = [];
  return {
    revealLine(line, endLine) {
      const last = Math.max(line, endLine ?? line);
      ed.revealLineInCenter(line);
      ed.setPosition({ lineNumber: line, column: 1 });
      highlightIds = ed.deltaDecorations(highlightIds, [
        { range: new monaco.Range(line, 1, last, 1), options: { isWholeLine: true, className: "cp-line-highlight" } },
      ]);
      ed.focus();
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
      highlightTimer.current = setTimeout(() => {
        highlightIds = ed.deltaDecorations(highlightIds, []);
      }, 4000);
    },
    setError(line, column, message) {
      const model = ed.getModel();
      if (!model) return;
      const safeLine = Math.min(Math.max(1, line), model.getLineCount());
      const col = Math.max(1, column ?? 1);
      monaco.editor.setModelMarkers(model, "codepulse", [
        {
          startLineNumber: safeLine,
          startColumn: col,
          endLineNumber: safeLine,
          endColumn: model.getLineMaxColumn(safeLine),
          message,
          severity: monaco.MarkerSeverity.Error,
        },
      ]);
      errorIds = ed.deltaDecorations(errorIds, [
        {
          range: new monaco.Range(safeLine, 1, safeLine, 1),
          options: { isWholeLine: true, className: "cp-line-error", glyphMarginClassName: "cp-glyph-error" },
        },
      ]);
      ed.revealLineInCenter(safeLine);
    },
    clearError() {
      const model = ed.getModel();
      if (!model) return;
      monaco.editor.setModelMarkers(model, "codepulse", []);
      errorIds = ed.deltaDecorations(errorIds, []);
    },
  };
}

export default function CodeEditor({
  value,
  onChange,
  onReady,
  height = 420,
}: {
  value: string;
  onChange: (v: string) => void;
  onReady?: (api: EditorApi) => void;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<MonacoEditor | null>(null);
  const applyingValue = useRef(false);
  const latest = useRef({ value, onChange, onReady });
  useLayoutEffect(() => {
    latest.current = { value, onChange, onReady };
  });

  // The editor is created and disposed by the same effect, so it stays valid when React
  // re-runs effects without remounting (Activity under cacheComponents, Fast Refresh).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ed = monaco.editor.create(el, { ...OPTIONS, value: latest.current.value });
    editorRef.current = ed;
    const highlightTimer: { current: ReturnType<typeof setTimeout> | null } = { current: null };
    const sub = ed.onDidChangeModelContent(() => {
      if (!applyingValue.current) latest.current.onChange(ed.getValue());
    });
    latest.current.onReady?.(makeApi(ed, highlightTimer));
    return () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
      sub.dispose();
      editorRef.current = null;
      ed.getModel()?.dispose();
      ed.dispose();
    };
  }, []);

  // Push external changes (examples, uploads, reset) into the editor as an undoable edit.
  useEffect(() => {
    const ed = editorRef.current;
    const model = ed?.getModel();
    if (!ed || !model || value === ed.getValue()) return;
    applyingValue.current = true;
    ed.executeEdits("", [{ range: model.getFullModelRange(), text: value, forceMoveMarkers: true }]);
    ed.pushUndoStop();
    applyingValue.current = false;
  }, [value]);

  return <div ref={containerRef} style={{ height, width: "100%" }} />;
}
