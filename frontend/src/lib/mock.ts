// Dev-only fixtures, enabled with NEXT_PUBLIC_USE_MOCK=1. Shapes follow docs/api.md.
import { ApiError } from "./api";
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  ClassProbabilities,
  FunctionFlag,
  FunctionInfo,
  HealthResponse,
  MetricItem,
  MetricsResponse,
  ModelKey,
  ModelMetrics,
  ModelVote,
  RiskFactor,
  RiskLevel,
  ScanSummary,
  TrainBaselineResponse,
} from "./types";
import { MODEL_NAMES } from "./theme";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const store = new Map<string, AnalyzeResponse>();

function riskScore(p: ClassProbabilities) {
  return Math.round(100 * (0.5 * p.medium + p.high) * 10) / 10;
}
function argmax(p: ClassProbabilities): RiskLevel {
  return (Object.entries(p) as [RiskLevel, number][]).sort((a, b) => b[1] - a[1])[0][0];
}
function softmax3(z: [number, number, number]): ClassProbabilities {
  const m = Math.max(...z);
  const e = z.map((v) => Math.exp(v - m));
  const s = e[0] + e[1] + e[2];
  return { low: e[0] / s, medium: e[1] / s, high: e[2] / s };
}
const r2 = (v: number) => Math.round(v * 100) / 100;

export async function mockHealth(): Promise<HealthResponse> {
  await delay(100);
  return { status: "ok", models_loaded: ["logreg", "random_forest", "gradient_boosting", "svm", "monotonic_gbdt"], best_model: "gradient_boosting", default_model: "monotonic_gbdt" };
}

function checkSyntax(code: string) {
  const stack: { ch: string; line: number; col: number }[] = [];
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  const lines = code.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/#.*$/, "").replace(/(["'])(?:\\.|(?!\1).)*\1/g, '""');
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if ("([{".includes(ch)) stack.push({ ch, line: i + 1, col: j + 1 });
      else if (pairs[ch]) {
        const top = stack.pop();
        if (!top || top.ch !== pairs[ch]) {
          throw new ApiError(`Syntax error: unmatched '${ch}'`, { kind: "http", status: 422, line: i + 1, column: j + 1 });
        }
      }
    }
  }
  if (stack.length) {
    const t = stack[stack.length - 1];
    throw new ApiError(`Syntax error: '${t.ch}' was never closed`, { kind: "http", status: 422, line: t.line, column: t.col });
  }
}

function extractFunctions(lines: string[]): FunctionInfo[] {
  const fns: FunctionInfo[] = [];
  const indentOf = (s: string) => s.match(/^\s*/)![0].length;
  lines.forEach((l, i) => {
    const m = l.match(/^(\s*)(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)/);
    if (!m) return;
    const base = m[1].length;
    let end = i + 1;
    let maxIndent = base;
    let cc = 1;
    while (end < lines.length && (lines[end].trim() === "" || indentOf(lines[end]) > base)) {
      const s = lines[end];
      if (s.trim()) {
        maxIndent = Math.max(maxIndent, indentOf(s));
        cc += (s.match(/\b(if|elif|for|while|except|and|or)\b/g) || []).length;
      }
      end++;
    }
    const params = m[3].split(",").map((p) => p.trim()).filter((p) => p && p !== "self" && p !== "cls").length;
    const length = end - i;
    const nesting = Math.max(0, Math.round((maxIndent - base) / 4) - 1);
    const flags: FunctionFlag[] = [];
    if (cc > 10) flags.push("complexity");
    if (length > 50) flags.push("length");
    if (nesting > 4) flags.push("nesting");
    if (params > 5) flags.push("params");
    fns.push({ name: m[2], lineno: i + 1, complexity: cc, length, nesting, params, flags });
  });
  return fns;
}

export async function mockAnalyze(req: AnalyzeRequest): Promise<AnalyzeResponse> {
  await delay(450);
  if (!req.code.trim()) throw new ApiError("No code submitted.", { kind: "http", status: 400 });
  if (req.code.length > 200_000) throw new ApiError("File is too large — the limit is 200 000 characters.", { kind: "http", status: 413 });
  checkSyntax(req.code);

  const lines = req.code.split("\n");
  const sloc = lines.filter((l) => l.trim() && !l.trim().startsWith("#")).length;
  const comments = lines.filter((l) => l.trim().startsWith("#")).length;
  const docstrings = (req.code.match(/"""/g) || []).length / 2;
  const fns = extractFunctions(lines);
  const ccMax = Math.max(1, ...fns.map((f) => f.complexity));
  const ccMean = fns.length ? fns.reduce((a, f) => a + f.complexity, 0) / fns.length : 1;
  const nestMax = Math.max(0, ...fns.map((f) => f.nesting));
  const lenMax = Math.max(0, ...fns.map((f) => f.length));
  const paramsMax = Math.max(0, ...fns.map((f) => f.params));
  const bareExcept = (req.code.match(/except\s*:/g) || []).length;
  const globals = (req.code.match(/^\s*global\s/gm) || []).length;
  const imports = lines.filter((l) => /^\s*(import|from)\s/.test(l)).length;
  const mi = Math.max(0, Math.min(100, 171 - 5.2 * Math.log(sloc * 8 + 1) - 0.23 * ccMax * 3 - 16.2 * Math.log(sloc + 1)) * 100 / 171 + 25);
  const docRatio = fns.length ? Math.min(1, docstrings / fns.length) : 1;

  const metrics: MetricItem[] = [
    { key: "sloc", label: "Source lines of code", group: "size", value: sloc, ideal: 300, higher_is_better: false, status: sloc > 300 ? "warn" : "ok" },
    { key: "n_functions", label: "Functions", group: "size", value: fns.length, ideal: null, higher_is_better: false, status: "ok" },
    { key: "n_imports", label: "Imports", group: "size", value: imports, ideal: 15, higher_is_better: false, status: imports > 15 ? "warn" : "ok" },
    { key: "cc_max", label: "Max cyclomatic complexity", group: "complexity", value: ccMax, ideal: 10, higher_is_better: false, status: ccMax > 10 ? "warn" : "ok" },
    { key: "cc_mean", label: "Mean cyclomatic complexity", group: "complexity", value: r2(ccMean), ideal: 5, higher_is_better: false, status: ccMean > 5 ? "warn" : "ok" },
    { key: "nesting_max", label: "Max nesting depth", group: "complexity", value: nestMax, ideal: 4, higher_is_better: false, status: nestMax > 4 ? "warn" : "ok" },
    { key: "func_len_max", label: "Longest function (lines)", group: "structure", value: lenMax, ideal: 50, higher_is_better: false, status: lenMax > 50 ? "warn" : "ok" },
    { key: "params_max", label: "Max parameters", group: "structure", value: paramsMax, ideal: 5, higher_is_better: false, status: paramsMax > 5 ? "warn" : "ok" },
    { key: "n_globals", label: "Global statements", group: "structure", value: globals, ideal: 0.5, higher_is_better: false, status: globals > 0 ? "warn" : "ok" },
    { key: "bare_except", label: "Bare except clauses", group: "structure", value: bareExcept, ideal: 0.5, higher_is_better: false, status: bareExcept > 0 ? "warn" : "ok" },
    { key: "halstead_volume", label: "Halstead volume", group: "halstead", value: Math.round(sloc * 38.4), ideal: 8000, higher_is_better: false, status: sloc * 38.4 > 8000 ? "warn" : "ok" },
    { key: "halstead_difficulty", label: "Halstead difficulty", group: "halstead", value: r2(4 + ccMax * 1.6), ideal: 25, higher_is_better: false, status: 4 + ccMax * 1.6 > 25 ? "warn" : "ok" },
    { key: "comment_ratio", label: "Comment ratio", group: "documentation", value: r2(comments / Math.max(1, sloc)), ideal: 0.1, higher_is_better: true, status: comments / Math.max(1, sloc) < 0.1 ? "warn" : "ok" },
    { key: "docstring_ratio", label: "Docstring coverage", group: "documentation", value: r2(docRatio), ideal: 0.6, higher_is_better: true, status: docRatio < 0.6 ? "warn" : "ok" },
    { key: "maintainability_index", label: "Maintainability index", group: "maintainability", value: r2(mi), ideal: 65, higher_is_better: true, status: mi < 65 ? "warn" : "ok" },
  ];

  const z = 0.09 * ccMax + 0.25 * nestMax + 0.012 * sloc + 0.5 * bareExcept + 0.4 * globals - 1.4 * docRatio;


  const keys: ModelKey[] = ["logreg", "random_forest", "gradient_boosting", "svm", "monotonic_gbdt"];
  const jitter: Record<ModelKey, number> = { logreg: -0.35, random_forest: 0.15, gradient_boosting: 0, svm: 0.3, monotonic_gbdt: 0.05 };
  const votes: ModelVote[] = keys.map((k) => {
    const p = softmax3([1.2 - z - jitter[k], 0.4, -1.4 + z + jitter[k]]);
    return { key: k, name: MODEL_NAMES[k], risk_level: argmax(p), risk_score: riskScore(p), probabilities: p };
  });
  const chosen = req.model ?? "monotonic_gbdt";
  const selected = votes.find((v) => v.key === chosen)!;

  const factors: RiskFactor[] = [
    { feature: "cc_max", label: "Max cyclomatic complexity", value: ccMax, impact: r2((ccMax - 6) * 0.9), direction: ccMax >= 6 ? "increases" : "decreases", description: "" },
    { feature: "nesting_max", label: "Max nesting depth", value: nestMax, impact: r2((nestMax - 2) * 2.1), direction: nestMax >= 2 ? "increases" : "decreases", description: "" },
    { feature: "sloc", label: "Source lines of code", value: sloc, impact: r2((sloc - 120) * 0.04), direction: sloc >= 120 ? "increases" : "decreases", description: "" },
    { feature: "docstring_ratio", label: "Docstring coverage", value: r2(docRatio), impact: r2((0.4 - docRatio) * 9), direction: docRatio <= 0.4 ? "increases" : "decreases", description: "" },
    { feature: "vocabulary", label: "Identifier & keyword vocabulary", value: null, impact: r2(z * 1.8 - 1), direction: z * 1.8 - 1 >= 0 ? "increases" : "decreases", description: "" },
    { feature: "bare_except", label: "Bare except clauses", value: bareExcept, impact: r2(bareExcept * 1.7), direction: "increases", description: "" },
  ]
    .filter((f) => Math.abs(f.impact) > 0.05)
    .map((f) => ({
      ...f,
      direction: (f.impact >= 0 ? "increases" : "decreases") as RiskFactor["direction"],
      description:
        f.feature === "vocabulary"
          ? `The words used in identifiers, keywords and docstrings ${f.impact >= 0 ? "resemble" : "do not resemble"} historically bug-prone files. ${f.impact >= 0 ? "Raises" : "Lowers"} the risk score by ${Math.abs(f.impact).toFixed(1)} points.`
          : `${f.label} is ${f.value}. ${f.impact >= 0 ? "Raises" : "Lowers"} the risk score by ${Math.abs(f.impact).toFixed(1)} points.`,
    }))
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
    .slice(0, 8);

  const res: AnalyzeResponse = {
    id: Math.random().toString(16).slice(2, 10),
    created_at: new Date().toISOString(),
    filename: req.filename ?? "snippet.py",
    model: { key: chosen, name: MODEL_NAMES[chosen] },
    risk_score: selected.risk_score,
    risk_level: selected.risk_level,
    probabilities: selected.probabilities,
    metrics,
    risk_factors: factors,
    functions: fns,
    model_votes: votes,
    latency_ms: 11.8,
  };
  store.set(res.id, res);
  return res;
}

function rocCurve(auc: number, seed: number) {
  // Smooth concave ROC whose area approximates `auc`: tpr = fpr^k with k = (1-auc)/auc.
  const k = (1 - auc) / auc;
  const fpr: number[] = [];
  const tpr: number[] = [];
  for (let i = 0; i <= 40; i++) {
    const x = i / 40;
    const wobble = i > 0 && i < 40 ? Math.sin(i * 1.7 + seed) * 0.012 : 0;
    fpr.push(r2(x * 1000) / 1000);
    tpr.push(Math.min(1, Math.max(0, Math.pow(x, k) + wobble)));
  }
  return { fpr, tpr };
}

function modelMetrics(
  key: ModelKey,
  family: string,
  description: string,
  m: { acc: number; p: number; r: number; f1: number; auc: number; cv: number; sd: number; xr: number; xsd: number; lat: number; tt: number },
  cm: number[][],
  params: Record<string, unknown>,
  seed: number,
): ModelMetrics {
  const classes: RiskLevel[] = ["low", "medium", "high"];
  const per_class = Object.fromEntries(
    classes.map((c, i) => {
      const tp = cm[i][i];
      const support = cm[i].reduce((a, b) => a + b, 0);
      const predicted = cm.reduce((a, row) => a + row[i], 0);
      const precision = tp / predicted;
      const recall = tp / support;
      return [c, { precision: r2(precision), recall: r2(recall), f1: r2((2 * precision * recall) / (precision + recall)), support }];
    }),
  );
  const aucByClass = { low: m.auc + 0.04, medium: m.auc - 0.08, high: m.auc + 0.03 };
  return {
    key,
    name: MODEL_NAMES[key],
    family,
    description,
    accuracy: m.acc,
    precision: m.p,
    recall: m.r,
    f1: m.f1,
    roc_auc: m.auc,
    cv_f1_mean: m.cv,
    cv_f1_std: m.sd,
    cross_repo_f1_mean: m.xr,
    cross_repo_f1_std: m.xsd,
    latency_ms: m.lat,
    train_time_s: m.tt,
    best_params: params,
    confusion_matrix: cm,
    per_class,
    roc_curves: {
      low: rocCurve(aucByClass.low, seed),
      medium: rocCurve(aucByClass.medium, seed + 1),
      high: rocCurve(aucByClass.high, seed + 2),
    },
  };
}

export async function mockMetrics(): Promise<MetricsResponse> {
  await delay(350);
  return {
    trained_at: "2026-10-19T09:42:00Z",
    best_model: "gradient_boosting",
    default_model: "monotonic_gbdt",
    dataset: {
      n_samples: 9124,
      n_train: 7299,
      n_test: 1825,
      snapshot_date: "2024-01-01",
      window_end: "2026-01-01",
      label_definition:
        "Number of bug-fix commits (message matches fix|bug|issue|error|crash|regression) touching the file between 2024-01-01 and 2026-01-01. Low = 0, Medium = 1–2, High = 3+.",
      class_distribution: { low: 4210, medium: 3011, high: 1903 },
      repos: [
        { name: "home-assistant/core", files: 1890 }, { name: "django", files: 1210 }, { name: "sympy", files: 1040 },
        { name: "pandas", files: 980 }, { name: "scikit-learn", files: 860 }, { name: "matplotlib", files: 720 },
        { name: "scrapy", files: 410 }, { name: "celery", files: 395 }, { name: "pytest", files: 380 },
        { name: "fastapi", files: 330 }, { name: "black", files: 290 }, { name: "httpx", files: 240 },
        { name: "flask", files: 205 }, { name: "requests", files: 174 },
      ],
    },
    models: [
      modelMetrics("logreg", "Linear", "Multinomial logistic regression on standardized metrics + TF-IDF.",
        { acc: 0.642, p: 0.621, r: 0.612, f1: 0.615, auc: 0.792, cv: 0.607, sd: 0.014, xr: 0.571, xsd: 0.041, lat: 0.21, tt: 4.8 },
        [[640, 152, 50], [190, 330, 82], [52, 116, 213]], { clf__C: 1.0, clf__class_weight: "balanced" }, 1),
      modelMetrics("random_forest", "Tree ensemble (bagged)", "500 fully-grown trees with feature subsampling.",
        { acc: 0.693, p: 0.681, r: 0.664, f1: 0.669, auc: 0.836, cv: 0.659, sd: 0.012, xr: 0.602, xsd: 0.038, lat: 3.4, tt: 38.2 },
        [[690, 120, 32], [160, 368, 74], [38, 104, 239]], { clf__n_estimators: 500, clf__max_depth: null, clf__min_samples_leaf: 2 }, 4),
      modelMetrics("gradient_boosting", "Tree ensemble (boosted)", "HistGradientBoosting — histogram-based boosting, LightGBM-style.",
        { acc: 0.712, p: 0.698, r: 0.687, f1: 0.691, auc: 0.851, cv: 0.676, sd: 0.011, xr: 0.618, xsd: 0.035, lat: 0.42, tt: 21.6 },
        [[701, 112, 29], [151, 381, 70], [33, 96, 252]], { clf__learning_rate: 0.1, clf__max_iter: 300, clf__max_leaf_nodes: 31 }, 7),
      modelMetrics("svm", "Kernel method", "Support vector classifier with RBF kernel and Platt-scaled probabilities.",
        { acc: 0.668, p: 0.652, r: 0.641, f1: 0.645, auc: 0.812, cv: 0.634, sd: 0.016, xr: 0.583, xsd: 0.044, lat: 6.9, tt: 112.4 },
        [[662, 140, 40], [175, 352, 75], [45, 108, 228]], { clf__C: 10, clf__gamma: "scale" }, 10),
      modelMetrics("monotonic_gbdt", "Ordinal tree ensemble (constrained)", "Two binary HistGradientBoosting models (Frank & Hall) with monotonic constraints.",
        { acc: 0.701, p: 0.684, r: 0.672, f1: 0.674, auc: 0.846, cv: 0.661, sd: 0.012, xr: 0.611, xsd: 0.033, lat: 0.6, tt: 26.3 },
        [[695, 118, 29], [158, 372, 72], [36, 101, 244]], { gt__learning_rate: 0.1, gt__max_iter: 300 }, 13),
    ],
    feature_importance: [
      ["sloc", "Source lines of code", 0.041], ["cc_max", "Max cyclomatic complexity", 0.033], ["vocabulary", "Identifier & keyword vocabulary", 0.029],
      ["halstead_volume", "Halstead volume", 0.024], ["n_functions", "Functions", 0.019], ["nesting_max", "Max nesting depth", 0.016],
      ["n_imports", "Imports", 0.013], ["func_len_max", "Longest function (lines)", 0.011], ["maintainability_index", "Maintainability index", 0.0095],
      ["cc_mean", "Mean cyclomatic complexity", 0.008], ["docstring_ratio", "Docstring coverage", 0.0062], ["n_classes", "Classes", 0.0051],
      ["comment_ratio", "Comment ratio", 0.0039], ["params_max", "Max parameters", 0.0031], ["bare_except", "Bare except clauses", 0.0022],
      ["n_globals", "Global statements", 0.0012],
    ].map(([feature, label, importance]) => ({ feature: feature as string, label: label as string, importance: importance as number })),
  };
}

export async function mockTrainBaseline(): Promise<TrainBaselineResponse> {
  await delay(2200);
  const Cs = [0.01, 0.1, 1, 10];
  const weights = [null, "balanced"];
  const grid = Cs.flatMap((C, i) =>
    weights.map((w, j) => ({
      params: { clf__C: C, clf__class_weight: w },
      mean_f1: r2(0.55 + 0.02 * i - (i === 3 ? 0.035 : 0) + j * 0.012) ,
      std_f1: 0.01 + ((i + j) % 3) * 0.003,
    })),
  );
  const best = grid.reduce((a, b) => (b.mean_f1 > a.mean_f1 ? b : a));
  return { model: "logreg", duration_s: 6.4, best_params: best.params, best_cv_f1: best.mean_f1, test_f1: r2(best.mean_f1 - 0.006), grid };
}

export async function mockScans(limit: number): Promise<ScanSummary[]> {
  await delay(250);
  const live: ScanSummary[] = [...store.values()].reverse().map((s) => ({
    id: s.id, created_at: s.created_at, filename: s.filename, risk_score: s.risk_score, risk_level: s.risk_level, model: s.model.key, loc: 0,
  }));
  const seed: ScanSummary[] = [
    { id: "9f3a12bc", created_at: "2026-10-19T10:12:00Z", filename: "order_processing.py", risk_score: 78.2, risk_level: "high", model: "monotonic_gbdt", loc: 374 },
    { id: "4c7e0d21", created_at: "2026-10-19T09:58:00Z", filename: "api_client.py", risk_score: 44.6, risk_level: "medium", model: "random_forest", loc: 92 },
    { id: "0b19e7aa", created_at: "2026-10-18T17:21:00Z", filename: "slugs.py", risk_score: 12.9, risk_level: "low", model: "gradient_boosting", loc: 31 },
  ];
  return [...live, ...seed].slice(0, limit);
}

export async function mockScan(id: string): Promise<AnalyzeResponse> {
  const hit = store.get(id);
  if (hit) return hit;
  const { EXAMPLES } = await import("./examples");
  const ex = id === "0b19e7aa" ? EXAMPLES[0] : id === "4c7e0d21" ? EXAMPLES[1] : id === "9f3a12bc" ? EXAMPLES[2] : null;
  if (!ex) throw new ApiError("Scan not found.", { kind: "http", status: 404 });
  const res = await mockAnalyze({ code: ex.code, filename: ex.filename });
  return { ...res, id };
}
