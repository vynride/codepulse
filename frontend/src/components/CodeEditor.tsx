"use client";

import "@/lib/monaco-setup";
import Editor, { type BeforeMount, type OnMount } from "@monaco-editor/react";
import { useCallback, useRef } from "react";

export interface EditorApi {
  revealLine: (line: number, endLine?: number) => void;
  setError: (line: number, column: number | null, message: string) => void;
  clearError: () => void;
}

type MonacoEditor = Parameters<OnMount>[0];
type MonacoNs = Parameters<OnMount>[1];

const THEME = "codepulse-dark";

const defineTheme: BeforeMount = (monaco) => {
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
};

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
  const editorRef = useRef<MonacoEditor | null>(null);
  const monacoRef = useRef<MonacoNs | null>(null);
  const highlightIds = useRef<string[]>([]);
  const errorIds = useRef<string[]>([]);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      const api: EditorApi = {
        revealLine(line, endLine) {
          const ed = editorRef.current;
          const m = monacoRef.current;
          if (!ed || !m) return;
          const last = Math.max(line, endLine ?? line);
          ed.revealLineInCenter(line);
          ed.setPosition({ lineNumber: line, column: 1 });
          highlightIds.current = ed.deltaDecorations(highlightIds.current, [
            {
              range: new m.Range(line, 1, last, 1),
              options: { isWholeLine: true, className: "cp-line-highlight" },
            },
          ]);
          ed.focus();
          if (highlightTimer.current) clearTimeout(highlightTimer.current);
          highlightTimer.current = setTimeout(() => {
            highlightIds.current = ed.deltaDecorations(highlightIds.current, []);
          }, 4000);
        },
        setError(line, column, message) {
          const ed = editorRef.current;
          const m = monacoRef.current;
          const model = ed?.getModel();
          if (!ed || !m || !model) return;
          const safeLine = Math.min(Math.max(1, line), model.getLineCount());
          const col = Math.max(1, column ?? 1);
          m.editor.setModelMarkers(model, "codepulse", [
            {
              startLineNumber: safeLine,
              startColumn: col,
              endLineNumber: safeLine,
              endColumn: model.getLineMaxColumn(safeLine),
              message,
              severity: m.MarkerSeverity.Error,
            },
          ]);
          errorIds.current = ed.deltaDecorations(errorIds.current, [
            {
              range: new m.Range(safeLine, 1, safeLine, 1),
              options: { isWholeLine: true, className: "cp-line-error", glyphMarginClassName: "cp-glyph-error" },
            },
          ]);
          ed.revealLineInCenter(safeLine);
        },
        clearError() {
          const ed = editorRef.current;
          const m = monacoRef.current;
          const model = ed?.getModel();
          if (!ed || !m || !model) return;
          m.editor.setModelMarkers(model, "codepulse", []);
          errorIds.current = ed.deltaDecorations(errorIds.current, []);
        },
      };
      onReady?.(api);
    },
    [onReady],
  );

  return (
    <Editor
      height={height}
      language="python"
      theme={THEME}
      value={value}
      onChange={(v) => onChange(v ?? "")}
      beforeMount={defineTheme}
      onMount={handleMount}
      loading={<div className="h-full w-full animate-pulse bg-canvas-dark" />}
      options={{
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
      }}
    />
  );
}
