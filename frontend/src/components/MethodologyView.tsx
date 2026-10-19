"use client";

import Link from "next/link";
import { getMetrics } from "@/lib/api";
import { fmtDay } from "@/lib/format";
import { modelColor, MODEL_NAMES, RISK_COLORS } from "@/lib/theme";
import { RISK_LEVELS, type MetricsResponse, type ModelKey } from "@/lib/types";
import { useAsync } from "@/lib/useAsync";
import { HeroBand, Notice, StatTile } from "./ui";

const REPOS = [
  "django", "flask", "requests", "scikit-learn", "sympy", "matplotlib", "pytest",
  "black", "httpx", "fastapi", "celery", "scrapy", "pandas", "home-assistant/core",
];

const STEPS = [
  { n: "01", title: "Collect", body: "Clone 14 mature open-source Python repositories and check out the last commit before the snapshot date." },
  { n: "02", title: "Label", body: "Count bug-fix commits that touch each file in the two years after the snapshot. Bucket into low / medium / high." },
  { n: "03", title: "Featurise", body: "28 structural metrics from radon and Python’s ast, plus TF-IDF over identifiers, keywords and docstrings." },
  { n: "04", title: "Train & tune", body: "Five scikit-learn pipelines, GridSearchCV with stratified 5-fold CV, evaluated once on a 20% held-out test set." },
];

const MODELS: { key: ModelKey; why: string }[] = [
  { key: "logreg", why: "A linear, fully interpretable baseline. Multinomial logistic regression on standardised metrics and sparse TF-IDF; regularisation strength C is tuned." },
  { key: "random_forest", why: "Bagged decision trees with feature subsampling. Captures non-linear interactions (e.g. long and deeply nested) and is robust to unscaled features." },
  { key: "gradient_boosting", why: "scikit-learn’s HistGradientBoostingClassifier — histogram-binned, leaf-wise boosting in the style of LightGBM. Usually the strongest model on tabular data." },
  { key: "svm", why: "Support vector classifier with an RBF kernel; probabilities via Platt scaling. A strong non-linear margin-based learner, but the slowest to train and predict." },
  { key: "monotonic_gbdt", why: "An ordinal, monotonically constrained gradient-boosted model (Frank & Hall decomposition into two binary HistGradientBoosting models). More size or complexity can never lower its predicted risk, so its explanations stay consistent with software-engineering knowledge." },
];

export function MethodologyView() {
  const { data, error, offline, loading } = useAsync(getMetrics);
  const ds = data?.dataset;

  return (
    <>
      <HeroBand
        eyebrow="Methodology"
        title="How CodePulse learns which files break"
        lead="A supervised learning pipeline that turns the history of 14 open-source projects into a risk model for Python files — built so that no information from the future leaks into training."
      />

      <section className="bg-white">
        <div className="container-cp py-14 md:py-20">
          <p className="eyebrow mb-3 text-body">Pipeline</p>
          <h2 className="mb-10 text-display-lg font-medium md:text-display-xl">Four steps from git history to prediction</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.n} className="card p-6">
                <p className="eyebrow mb-6 text-body">{s.n}</p>
                <h3 className="mb-2 text-display-md font-medium">{s.title}</h3>
                <p className="text-body-md text-[#555]">{s.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Labelled files" value={loading ? "…" : ds ? ds.n_samples.toLocaleString() : "≈9 000"} />
            <StatTile label="Repositories" value={ds ? ds.repos.length || 14 : 14} />
            <StatTile label="Snapshot" value={ds ? fmtDay(ds.snapshot_date) : "Jan 1, 2024"} />
            <StatTile label="Label window ends" value={ds ? fmtDay(ds.window_end) : "Jan 1, 2026"} tint="periwinkle" />
          </div>
          {!loading && error && (
            <div className="mt-6">
              <Notice kind={offline ? "offline" : "info"} title="Showing default figures">
                Live dataset numbers could not be loaded ({error}). The values above are the planned configuration.
              </Notice>
            </div>
          )}
        </div>
      </section>

      <article className="border-t border-hairline bg-white">
        <div className="container-cp grid gap-12 py-14 md:py-20 lg:grid-cols-[220px_1fr]">
          <nav aria-label="On this page" className="hidden lg:block">
            <ul className="sticky top-24 space-y-3">
              {[
                ["data", "Data source"],
                ["labels", "Labels"],
                ["features", "Features"],
                ["models", "Models"],
                ["monotonic", "Monotonic model"],
                ["evaluation", "Evaluation"],
                ["score", "Risk score"],
                ["factors", "Risk factors"],
                ["limitations", "Limitations"],
              ].map(([id, label]) => (
                <li key={id}>
                  <a href={`#${id}`} className="eyebrow text-body hover:text-ink">{label}</a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="prose-cp max-w-[760px]">
            <Section id="data" eyebrow="1 · Data source" title="Fourteen mature Python projects">
              <p>
                Training data comes from {ds?.repos.length || 14} widely used open-source Python repositories, chosen to
                span web frameworks, scientific computing, tooling and applications:
              </p>
              <div className="mb-4 flex flex-wrap gap-2">
                {(ds?.repos.length ? ds.repos.map((r) => `${r.name} · ${r.files.toLocaleString()}`) : REPOS).map((r) => (
                  <span key={r} className="rounded-sm border border-hairline px-2 py-0.5 font-mono text-[12px]">{r}</span>
                ))}
              </div>
              <p>
                Each repository is checked out at its last commit before <b>{ds ? fmtDay(ds.snapshot_date) : "1 January 2024"}</b>.
                Every non-test <code>.py</code> file at that snapshot becomes one sample — features are computed from the
                file exactly as it existed on that date.
              </p>
            </Section>

            <Section id="labels" eyebrow="2 · Labels" title="Future bug fixes, and only future bug fixes">
              <p>
                The target is how many bug-fix commits touch each file between the snapshot and{" "}
                <b>{ds ? fmtDay(ds.window_end) : "1 January 2026"}</b>. A commit counts as a bug fix when its message
                matches fix-related keywords.
              </p>
              {ds?.label_definition && (
                <blockquote className="mb-4 border-l-2 border-accent-periwinkle bg-[#f7f7fd] px-4 py-3 text-body-md text-[#2a2a2a]">
                  {ds.label_definition}
                </blockquote>
              )}
              <p>
                Because features come from the snapshot and labels only from commits <i>after</i> it, the model never sees
                information from the period it is asked to predict — there is no temporal leakage. Counts are bucketed
                into three classes:
              </p>
              <div className="mb-4 flex flex-wrap gap-3">
                {RISK_LEVELS.map((l) => (
                  <span key={l} className="inline-flex items-center gap-2 rounded-sm px-2 py-1 font-mono text-[12px] uppercase" style={{ background: RISK_COLORS[l].bg, color: RISK_COLORS[l].text }}>
                    {RISK_COLORS[l].label}
                    {ds && <span className="opacity-70">{ds.class_distribution[l]?.toLocaleString()} files</span>}
                  </span>
                ))}
              </div>
            </Section>

            <Section id="features" eyebrow="3 · Features" title="Structure plus vocabulary">
              <p>Two complementary feature families are concatenated into a single matrix:</p>
              <ul>
                <li>
                  <b>28 structural metrics</b> from <code>radon</code> and Python’s <code>ast</code>: size (SLOC, comment
                  lines, functions, classes, imports), cyclomatic complexity (max, mean), maximum nesting depth, function
                  length and parameter counts, Halstead volume / difficulty / effort, maintainability index, docstring and
                  comment ratios, and code smells such as bare <code>except</code> and <code>global</code> statements.
                </li>
                <li>
                  <b>TF-IDF text features</b> over identifiers (split on camelCase and snake_case), Python keywords and
                  docstring words. These capture <i>what</i> the code is about — parsing, I/O, concurrency — which
                  correlates with how often it changes.
                </li>
              </ul>
              <p>Numeric metrics are standardised inside each pipeline so the scaler is fit only on training folds.</p>
            </Section>

            <Section id="models" eyebrow="4 · Models" title="Classic classifiers, plus a constrained ordinal one">
              <div className="not-prose grid gap-3">
                {[
                  ...MODELS.filter((m) => !data || data.models.some((x) => x.key === m.key)),
                  ...(data?.models ?? [])
                    .filter((x) => !MODELS.some((m) => m.key === x.key))
                    .map((x) => ({ key: x.key, why: x.description })),
                ].map((m) => {
                  const live = data?.models.find((x) => x.key === m.key);
                  return (
                    <div key={m.key} className="card relative overflow-hidden p-5 pl-6">
                      <span className="absolute inset-y-0 left-0 w-1" style={{ background: modelColor(m.key) }} aria-hidden />
                      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                        <h4 className="text-body-lg font-medium">{live?.name ?? MODEL_NAMES[m.key] ?? m.key}</h4>
                        {live && (
                          <span className="font-mono text-[12px] text-[#4a4a4a]">
                            test F1 {live.f1.toFixed(3)} · AUC {live.roc_auc.toFixed(3)}
                            {data?.best_model === m.key && " · best F1"}
                            {data?.default_model === m.key && " · default"}
                          </span>
                        )}
                      </div>
                      <p className="text-body-md text-[#555]">{m.why}</p>
                    </div>
                  );
                })}
              </div>
            </Section>

            <Section id="monotonic" eyebrow="4b · Monotonic model" title="Why the default model is constrained">
              <p>
                Unconstrained trees happily learn local quirks of the training data. Early versions produced explanations
                such as &ldquo;max cyclomatic complexity 45 <i>lowers</i> risk&rdquo; — statistically possible, but
                nonsense to any engineer and impossible to defend in a code review.
              </p>
              <p>
                HistGradientBoosting supports <b>monotonic constraints</b>, but scikit-learn only allows them for binary
                targets. CodePulse therefore uses the <b>Frank &amp; Hall ordinal decomposition</b>: two binary models
                estimate p₁ = P(y &gt; low) and p₂ = P(y &gt; medium), and are combined into three class probabilities:
              </p>
              <div className="mb-4 rounded-sm bg-canvas-dark px-5 py-4 font-mono text-[14px] leading-[24px] text-white">
                P(low) = 1 − p₁<br />
                P(medium) = p₁ − p₂<br />
                P(high) = p₂ &nbsp;<span className="text-white/50">(p₂ clipped so that p₂ ≤ p₁)</span>
              </div>
              <ul>
                <li><b>+1 (risk can only rise)</b> on every size, complexity, control-flow and Halstead feature.</li>
                <li><b>−1 (risk can only fall)</b> on the maintainability index.</li>
                <li><b>Unconstrained</b> on comment metrics and the TF-IDF vocabulary, where there is no agreed direction.</li>
              </ul>
              <p>
                The constrained model gives up roughly 0.02 macro-F1 against the best unconstrained model, but every constrained-feature
                attribution it produces points in a direction a software engineer would accept. That is why it is the
                default on the Analyze page; the other models remain available for comparison.
                {data?.default_model && data.default_model !== data.best_model && <DefaultVsBest data={data} />}
              </p>
            </Section>

            <Section id="evaluation" eyebrow="5 · Evaluation" title="Tuned on folds, judged once">
              <ul>
                <li>
                  A stratified <b>80 / 20 split</b> sets aside{" "}
                  {ds ? <b>{ds.n_test.toLocaleString()} files</b> : "20% of files"} as a test set that is used exactly once,
                  after tuning.
                </li>
                <li>
                  On the remaining {ds ? ds.n_train.toLocaleString() + " files" : "80%"}, <b>GridSearchCV</b> with{" "}
                  <b>stratified 5-fold cross-validation</b> picks each model’s hyper-parameters by macro-F1.
                </li>
                <li>
                  Macro-F1 is the headline metric because the classes are imbalanced — accuracy alone would reward
                  predicting &ldquo;low&rdquo; for everything. We also report precision, recall, one-vs-rest ROC-AUC,
                  confusion matrices and per-file latency.
                </li>
                <li>
                  <b>Cross-repo F1</b> measures generalisation to projects the model has never seen: a 5-fold{" "}
                  <code>GroupKFold</code> where every file of a repository lands in the same fold, so each fold is scored
                  on entirely held-out repositories. It is typically lower than the random-split score, and the gap shows
                  how much the model relies on project-specific habits.
                  {data && <CrossRepoNote data={data} />}
                </li>
              </ul>
              <p>
                All numbers are on the <Link href="/benchmarks" className="underline">benchmark page</Link>, where you can
                also re-run a live grid search.
              </p>
            </Section>

            <Section id="score" eyebrow="6 · Risk score" title="From three probabilities to one number">
              <p>Every model outputs class probabilities. CodePulse collapses them into a single 0–100 score:</p>
              <div className="mb-4 rounded-sm bg-canvas-dark px-5 py-4 font-mono text-[15px] text-white">
                risk = 100 × ( 0.5 · P(medium) + 1.0 · P(high) )
              </div>
              <p>
                A file the model is sure is low-risk scores 0, a certain high-risk file scores 100, and uncertainty lands
                in between. The category badge is the most probable class.
              </p>
              <p>
                <b>Risk is about the whole file.</b> The label counts bug-fix commits that touch <i>any part</i> of the
                file over two years, so larger files accumulate more fixes and the score grows with file size. A short but
                tangled snippet can therefore still score low. The per-function flags (CC &gt; 10, &gt; 50 lines, nesting
                &gt; 4, &gt; 5 params) measure local complexity independently of the model and are worth reading alongside
                the score.
              </p>
            </Section>

            <Section id="factors" eyebrow="7 · Risk factors" title="Explaining a single prediction">
              <p>
                To explain why a file scored the way it did, CodePulse uses <b>baseline substitution</b>: each feature in
                turn is replaced by its <b>training-set median</b>, the file is re-scored, and the change in risk score is
                attributed to that feature. All TF-IDF columns are substituted together and reported as one
                &ldquo;vocabulary&rdquo; factor.
              </p>
              <p>
                A factor of +8.2 means &ldquo;if this metric were typical, the score would be 8.2 points lower&rdquo;. It
                is model-agnostic and cheap, but it ignores interactions between features — attributions need not add up
                to the total score.
              </p>
            </Section>

            <Section id="limitations" eyebrow="8 · Limitations" title="What this model cannot tell you">
              <ul>
                <li>Commit-message keywords are a noisy proxy for real defects; some fixes are mislabelled and some bugs are never fixed.</li>
                <li>Files that change often get more fix commits simply because they change often — the model partly learns activity, not only quality.</li>
                <li>Fourteen popular, well-maintained projects are not representative of all Python code (e.g. notebooks, scripts, closed-source code).</li>
                <li>Predictions are correlational. Lowering a metric does not guarantee fewer bugs.</li>
                <li>Risk-factor attributions are one-at-a-time and ignore feature interactions.</li>
              </ul>
            </Section>
          </div>
        </div>
      </article>
    </>
  );
}

function DefaultVsBest({ data }: { data: MetricsResponse }) {
  const def = data.models.find((m) => m.key === data.default_model);
  const best = data.models.find((m) => m.key === data.best_model);
  if (!def || !best) return null;
  return (
    <>
      {" "}On this training run: {def.name} macro-F1 <b>{def.f1.toFixed(3)}</b> vs {best.name} <b>{best.f1.toFixed(3)}</b>.
    </>
  );
}

function CrossRepoNote({ data }: { data: MetricsResponse }) {
  const best = data.models.find((m) => m.key === (data.default_model ?? data.best_model));
  if (!best || best.cross_repo_f1_mean === undefined || best.cross_repo_f1_mean === null) return null;
  return (
    <>
      {" "}For {best.name}, cross-repo macro-F1 is <b>{best.cross_repo_f1_mean.toFixed(3)}</b>
      {best.cross_repo_f1_std !== undefined && <> ± {best.cross_repo_f1_std.toFixed(3)}</>} versus{" "}
      <b>{best.cv_f1_mean.toFixed(3)}</b> with stratified CV.
    </>
  );
}

function Section({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-b border-hairline pb-10 mb-10 last:border-b-0">
      <p className="eyebrow mb-3 text-body">{eyebrow}</p>
      <h2 className="mb-5 text-display-lg font-medium">{title}</h2>
      {children}
    </section>
  );
}
