// Types mirroring docs/api.md (CodePulse API v1).

export type RiskLevel = "low" | "medium" | "high";
export const RISK_LEVELS: RiskLevel[] = ["low", "medium", "high"];

export type ModelKey = "logreg" | "random_forest" | "gradient_boosting" | "svm" | "monotonic_gbdt";
// Fallback order only; the UI prefers the list the backend reports in /health and /metrics.
export const MODEL_KEYS: ModelKey[] = ["logreg", "random_forest", "gradient_boosting", "svm", "monotonic_gbdt"];

export type ClassProbabilities = Record<RiskLevel, number>;

export interface HealthResponse {
  status: string;
  models_loaded: ModelKey[];
  best_model: ModelKey; // highest test macro-F1
  default_model?: ModelKey; // model used when the request omits `model`
}

export interface AnalyzeRequest {
  code: string;
  filename?: string;
  model?: ModelKey;
}

export interface ModelRef {
  key: ModelKey;
  name: string;
}

export type MetricStatus = "ok" | "warn";

export interface MetricItem {
  key: string;
  label: string;
  group: string;
  value: number;
  ideal: number | null;
  higher_is_better: boolean;
  status: MetricStatus;
}

export interface RiskFactor {
  feature: string; // "vocabulary" = grouped TF-IDF features
  label: string;
  value: number | null;
  impact: number; // risk-score points; positive = increases risk
  direction: "increases" | "decreases";
  description: string;
}

export type FunctionFlag = "complexity" | "length" | "nesting" | "params";

export interface FunctionInfo {
  name: string;
  lineno: number;
  complexity: number;
  length: number;
  nesting: number;
  params: number;
  flags: FunctionFlag[];
}

export interface ModelVote {
  key: ModelKey;
  name: string;
  risk_level: RiskLevel;
  risk_score: number;
  probabilities: ClassProbabilities;
}

export interface AnalyzeResponse {
  id: string;
  created_at: string;
  filename: string | null;
  model: ModelRef;
  risk_score: number;
  risk_level: RiskLevel;
  probabilities: ClassProbabilities;
  metrics: MetricItem[];
  risk_factors: RiskFactor[];
  functions: FunctionInfo[];
  model_votes: ModelVote[];
  latency_ms: number;
}

export interface ApiErrorDetail {
  message: string;
  line: number | null;
  column: number | null;
}

export interface PerClassMetrics {
  precision: number;
  recall: number;
  f1: number;
  support: number;
}

export interface RocCurve {
  fpr: number[];
  tpr: number[];
}

export interface ModelMetrics {
  key: ModelKey;
  name: string;
  family: string;
  description: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  roc_auc: number;
  cv_f1_mean: number;
  cv_f1_std: number;
  // 5-fold GroupKFold with whole repositories held out (optional for safety)
  cross_repo_f1_mean?: number;
  cross_repo_f1_std?: number;
  latency_ms: number;
  train_time_s: number;
  best_params: Record<string, unknown>;
  confusion_matrix: number[][]; // [true][pred], order low, medium, high
  per_class: Partial<Record<RiskLevel, Partial<PerClassMetrics>>>;
  roc_curves: Partial<Record<RiskLevel, Partial<RocCurve>>>;
}

export interface RepoCount {
  name: string;
  files: number;
}

export interface DatasetSummary {
  n_samples: number;
  n_train: number;
  n_test: number;
  snapshot_date: string;
  window_end: string;
  label_definition: string;
  class_distribution: ClassProbabilities;
  repos: RepoCount[];
}

export interface FeatureImportance {
  feature: string;
  label: string;
  importance: number;
}

export interface MetricsResponse {
  trained_at: string;
  best_model: ModelKey; // highest test macro-F1
  default_model?: ModelKey; // served default; feature_importance is computed for it
  dataset: DatasetSummary;
  models: ModelMetrics[];
  feature_importance: FeatureImportance[];
}

export interface GridRow {
  params: Record<string, unknown>;
  mean_f1: number;
  std_f1: number;
}

export interface TrainBaselineResponse {
  model: ModelKey;
  duration_s: number;
  best_params: Record<string, unknown>;
  best_cv_f1: number;
  test_f1: number;
  grid: GridRow[];
}

export interface ScanSummary {
  id: string;
  created_at: string;
  filename: string | null;
  risk_score: number;
  risk_level: RiskLevel;
  // The contract lists `model` without a shape; accept either a key or a ModelRef.
  model: ModelKey | string | ModelRef;
  loc: number;
}
