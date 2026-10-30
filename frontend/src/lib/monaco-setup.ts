// Client-only: uses the locally bundled monaco-editor instead of fetching it
// from cdn.jsdelivr.net (classrooms have flaky Wi-Fi).
import * as monaco from "monaco-editor";

declare global {
  interface Window {
    MonacoEnvironment?: { getWorker: (workerId: string, label: string) => Worker };
  }
}

if (typeof window !== "undefined") {
  window.MonacoEnvironment = {
    // Python has no dedicated language worker; every label can use the core editor worker.
    getWorker: () => new Worker(new URL("./monaco.worker.ts", import.meta.url), { type: "module" }),
  };
}

export { monaco };
