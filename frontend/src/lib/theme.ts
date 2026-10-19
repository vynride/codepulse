import type { ModelKey, RiskLevel } from "./types";

// Categorical model palette — derived from the brand palette and validated
// (dataviz validate_palette.js, light surface: lightness, chroma, CVD, contrast all PASS).
export const MODEL_COLORS: Record<ModelKey, string> = {
  logreg: "#3d4fa8", // navy-indigo
  random_forest: "#fc4c02", // brand orange
  gradient_boosting: "#c81fa3", // brand magenta (deepened for contrast)
  svm: "#7a76f2", // brand periwinkle (deepened for contrast)
  monotonic_gbdt: "#b07800", // amber — 5th slot, validated (adjacent pairs) with the four above
};

export const MODEL_SHORT: Record<ModelKey, string> = {
  logreg: "LogReg",
  random_forest: "Random Forest",
  gradient_boosting: "Grad. Boosting",
  svm: "SVM (RBF)",
  monotonic_gbdt: "Monotonic GBDT",
};

export const MODEL_NAMES: Record<ModelKey, string> = {
  logreg: "Logistic Regression",
  random_forest: "Random Forest",
  gradient_boosting: "Gradient Boosting",
  svm: "SVM (RBF kernel)",
  monotonic_gbdt: "Monotonic GBDT",
};

export function modelColor(key: string): string {
  return MODEL_COLORS[key as ModelKey] ?? "#959494";
}

// Risk palette — used everywhere a risk level is shown.
export const RISK_COLORS: Record<RiskLevel, { fg: string; bg: string; text: string; label: string }> = {
  low: { fg: "#0f9e8e", bg: "#c8f6f9", text: "#04524a", label: "Low" },
  medium: { fg: "#7b78f0", bg: "#e6e5ff", text: "#2f2b9c", label: "Medium" },
  high: { fg: "#e8336f", bg: "#fde0ea", text: "#9b0e3e", label: "High" },
};

export const FLAG_LABELS: Record<string, string> = {
  complexity: "CC > 10",
  length: "> 50 lines",
  nesting: "Nesting > 4",
  params: "> 5 params",
};

export const GROUP_LABELS: Record<string, string> = {
  size: "Size",
  complexity: "Complexity",
  halstead: "Halstead",
  structure: "Structure",
  documentation: "Documentation",
  maintainability: "Maintainability",
  style: "Style",
};

export function groupLabel(g: string): string {
  return GROUP_LABELS[g] ?? g.charAt(0).toUpperCase() + g.slice(1).replace(/_/g, " ");
}
