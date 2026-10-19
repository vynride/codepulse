import type {
  AnalyzeRequest,
  AnalyzeResponse,
  ApiErrorDetail,
  HealthResponse,
  MetricsResponse,
  ScanSummary,
  TrainBaselineResponse,
} from "./types";

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1"
).replace(/\/+$/, "");

export const API_DOCS_URL = API_BASE_URL.replace(/\/api\/v\d+$/, "") + "/docs";

export const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "1";

export type ApiErrorKind = "network" | "http";

export class ApiError extends Error {
  kind: ApiErrorKind;
  status: number | null;
  line: number | null;
  column: number | null;

  constructor(
    message: string,
    opts: { kind: ApiErrorKind; status?: number | null; line?: number | null; column?: number | null },
  ) {
    super(message);
    this.name = "ApiError";
    this.kind = opts.kind;
    this.status = opts.status ?? null;
    this.line = opts.line ?? null;
    this.column = opts.column ?? null;
  }
}

export function networkErrorMessage(): string {
  return `Backend not running at ${API_BASE_URL}. Start the FastAPI server (uvicorn) and try again.`;
}

function parseDetail(body: unknown, status: number): ApiErrorDetail {
  const fallback: ApiErrorDetail = { message: `Request failed with status ${status}.`, line: null, column: null };
  if (!body || typeof body !== "object") return fallback;
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string") return { ...fallback, message: detail };
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const d = detail as Partial<ApiErrorDetail>;
    return {
      message: typeof d.message === "string" ? d.message : fallback.message,
      line: typeof d.line === "number" ? d.line : null,
      column: typeof d.column === "number" ? d.column : null,
    };
  }
  // FastAPI validation errors: detail is an array
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: string };
    return { ...fallback, message: first.msg ?? fallback.message };
  }
  return fallback;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      cache: "no-store",
    });
  } catch {
    throw new ApiError(networkErrorMessage(), { kind: "network" });
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    if (res.status === 413) {
      throw new ApiError("File is too large — the limit is 200 000 characters.", { kind: "http", status: 413 });
    }
    const d = parseDetail(body, res.status);
    throw new ApiError(d.message, { kind: "http", status: res.status, line: d.line, column: d.column });
  }
  return body as T;
}

async function mock() {
  return import("./mock");
}

export async function getHealth(): Promise<HealthResponse> {
  if (USE_MOCK) return (await mock()).mockHealth();
  return request<HealthResponse>("/health");
}

export async function analyze(req: AnalyzeRequest): Promise<AnalyzeResponse> {
  if (USE_MOCK) return (await mock()).mockAnalyze(req);
  return request<AnalyzeResponse>("/analyze", { method: "POST", body: JSON.stringify(req) });
}

export async function getMetrics(): Promise<MetricsResponse> {
  if (USE_MOCK) return (await mock()).mockMetrics();
  return request<MetricsResponse>("/metrics");
}

export async function trainBaseline(): Promise<TrainBaselineResponse> {
  if (USE_MOCK) return (await mock()).mockTrainBaseline();
  return request<TrainBaselineResponse>("/train-baseline", { method: "POST", body: "{}" });
}

export async function getScans(limit = 20): Promise<ScanSummary[]> {
  if (USE_MOCK) return (await mock()).mockScans(limit);
  return request<ScanSummary[]>(`/scans?limit=${limit}`);
}

export async function getScan(id: string): Promise<AnalyzeResponse> {
  if (USE_MOCK) return (await mock()).mockScan(id);
  return request<AnalyzeResponse>(`/scans/${encodeURIComponent(id)}`);
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}
