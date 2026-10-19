"""Static feature extraction for Python source files.

The same code path is used offline (dataset building) and online (the
/analyze endpoint), so training and inference features are guaranteed to match.

Two feature families are produced:
  * structural / complexity metrics (tabular) via `radon` and the `ast` module
  * a token document (identifiers split into words, keywords, docstring words)
    that the model pipeline turns into TF-IDF vectors
"""

from __future__ import annotations

import ast
import io
import keyword
import re
import tokenize
from dataclasses import asdict, dataclass, field

from radon.complexity import cc_visit
from radon.metrics import h_visit, mi_visit
from radon.raw import analyze

# Order matters: this is the column order of the tabular feature matrix.
NUMERIC_FEATURES: list[str] = [
    "loc",
    "sloc",
    "lloc",
    "comment_lines",
    "blank_lines",
    "comment_ratio",
    "n_functions",
    "n_classes",
    "n_imports",
    "cc_total",
    "cc_mean",
    "cc_max",
    "n_complex_functions",
    "max_nesting",
    "mean_nesting",
    "params_mean",
    "params_max",
    "func_len_mean",
    "func_len_max",
    "n_try",
    "n_branches",
    "n_loops",
    "n_returns",
    "halstead_volume",
    "halstead_difficulty",
    "halstead_effort",
    "halstead_bugs",
    "maintainability_index",
]

# Human-readable metadata used by the API / UI. `ideal` is the commonly cited
# upper threshold for a single function or file (lower is better unless noted).
FEATURE_INFO: dict[str, dict] = {
    "loc": {"label": "Lines of code", "group": "size"},
    "sloc": {"label": "Source lines", "group": "size"},
    "lloc": {"label": "Logical lines", "group": "size"},
    "comment_lines": {"label": "Comment lines", "group": "documentation"},
    "blank_lines": {"label": "Blank lines", "group": "size"},
    "comment_ratio": {"label": "Comment-to-code ratio", "group": "documentation", "ideal": 0.1, "higher_is_better": True},
    "n_functions": {"label": "Functions", "group": "structure"},
    "n_classes": {"label": "Classes", "group": "structure"},
    "n_imports": {"label": "Imports", "group": "structure"},
    "cc_total": {"label": "Total cyclomatic complexity", "group": "complexity"},
    "cc_mean": {"label": "Mean cyclomatic complexity", "group": "complexity", "ideal": 5},
    "cc_max": {"label": "Max cyclomatic complexity", "group": "complexity", "ideal": 10},
    "n_complex_functions": {"label": "Functions with CC > 10", "group": "complexity", "ideal": 0},
    "max_nesting": {"label": "Max nesting depth", "group": "complexity", "ideal": 4},
    "mean_nesting": {"label": "Mean nesting depth", "group": "complexity"},
    "params_mean": {"label": "Mean parameters / function", "group": "structure"},
    "params_max": {"label": "Max parameters / function", "group": "structure", "ideal": 5},
    "func_len_mean": {"label": "Mean function length", "group": "size", "ideal": 25},
    "func_len_max": {"label": "Longest function (lines)", "group": "size", "ideal": 50},
    "n_try": {"label": "try blocks", "group": "control flow"},
    "n_branches": {"label": "Branches (if)", "group": "control flow"},
    "n_loops": {"label": "Loops", "group": "control flow"},
    "n_returns": {"label": "return statements", "group": "control flow"},
    "halstead_volume": {"label": "Halstead volume", "group": "halstead"},
    "halstead_difficulty": {"label": "Halstead difficulty", "group": "halstead", "ideal": 30},
    "halstead_effort": {"label": "Halstead effort", "group": "halstead"},
    "halstead_bugs": {"label": "Halstead est. bugs", "group": "halstead"},
    "maintainability_index": {"label": "Maintainability index", "group": "maintainability", "ideal": 65, "higher_is_better": True},
}

# Per-function thresholds used for the function table in the UI.
FUNCTION_THRESHOLDS = {"complexity": 10, "length": 50, "nesting": 4, "params": 5}

_NESTING_NODES = (ast.If, ast.For, ast.AsyncFor, ast.While, ast.With, ast.AsyncWith, ast.Try, ast.Match)
_FUNC_NODES = (ast.FunctionDef, ast.AsyncFunctionDef)
_CAMEL_RE = re.compile(r"[A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+|\d+")
_WORD_RE = re.compile(r"[A-Za-z]{2,}")


class CodeParseError(ValueError):
    """Raised when the submitted code is not valid Python."""

    def __init__(self, message: str, line: int | None = None, column: int | None = None):
        super().__init__(message)
        self.line = line
        self.column = column


@dataclass
class FunctionMetrics:
    name: str
    lineno: int
    complexity: int
    length: int
    nesting: int
    params: int
    flags: list[str] = field(default_factory=list)


@dataclass
class FileFeatures:
    numeric: dict[str, float]
    tokens: str
    functions: list[FunctionMetrics]

    def to_dict(self) -> dict:
        return {"numeric": self.numeric, "tokens": self.tokens, "functions": [asdict(f) for f in self.functions]}


def _max_nesting(node: ast.AST, depth: int = 0) -> int:
    best = depth
    for child in ast.iter_child_nodes(node):
        if isinstance(child, _FUNC_NODES + (ast.ClassDef, ast.Lambda)):
            continue  # nested definitions are measured separately
        inc = 1 if isinstance(child, _NESTING_NODES) else 0
        # `elif` is parsed as an If nested in the parent's orelse; it is not deeper nesting.
        if isinstance(node, ast.If) and isinstance(child, ast.If) and node.orelse == [child]:
            inc = 0
        best = max(best, _max_nesting(child, depth + inc))
    return best


def _param_count(fn: ast.FunctionDef | ast.AsyncFunctionDef) -> int:
    a = fn.args
    names = [*a.posonlyargs, *a.args, *a.kwonlyargs]
    count = len(names) + (1 if a.vararg else 0) + (1 if a.kwarg else 0)
    if names and names[0].arg in ("self", "cls"):
        count -= 1
    return count


def _split_identifier(name: str) -> list[str]:
    parts: list[str] = []
    for chunk in name.split("_"):
        parts.extend(p.lower() for p in _CAMEL_RE.findall(chunk))
    return [p for p in parts if len(p) > 1]


def extract_tokens(source: str) -> str:
    """Build the text document fed to TF-IDF: keywords (prefixed `kw_`),
    identifier sub-words, and words from comments / docstrings."""
    out: list[str] = []
    try:
        for tok in tokenize.generate_tokens(io.StringIO(source).readline):
            if tok.type == tokenize.NAME:
                if keyword.iskeyword(tok.string):
                    out.append(f"kw_{tok.string}")
                else:
                    out.extend(_split_identifier(tok.string))
            elif tok.type == tokenize.COMMENT:
                out.extend(w.lower() for w in _WORD_RE.findall(tok.string))
            elif tok.type == tokenize.STRING and tok.string.lstrip("rbuRBUfF").startswith(('"""', "'''")):
                out.extend(w.lower() for w in _WORD_RE.findall(tok.string))
    except (tokenize.TokenError, IndentationError, SyntaxError):
        pass
    return " ".join(out)


def extract_features(source: str) -> FileFeatures:
    """Compute all features for one Python source file.

    Raises CodeParseError for empty input or code that fails to parse.
    """
    if not source or not source.strip():
        raise CodeParseError("No code submitted.")
    source = source.replace("\r\n", "\n").expandtabs(4)
    try:
        tree = ast.parse(source)
    except SyntaxError as exc:
        raise CodeParseError(f"Syntax error: {exc.msg}", exc.lineno, exc.offset) from exc

    raw = analyze(source)
    comment_lines = raw.comments + raw.multi
    code_lines = max(raw.sloc, 1)

    # Cyclomatic complexity per function/method (radon flattens methods with
    # `cc_visit`; classes are reported separately and skipped here).
    blocks = [b for b in cc_visit(source) if b.letter in ("F", "M")]
    cc_by_line = {b.lineno: b.complexity for b in blocks}

    functions: list[FunctionMetrics] = []
    for node in ast.walk(tree):
        if isinstance(node, _FUNC_NODES):
            length = (node.end_lineno or node.lineno) - node.lineno + 1
            fm = FunctionMetrics(
                name=node.name,
                lineno=node.lineno,
                complexity=cc_by_line.get(node.lineno, 1),
                length=length,
                nesting=_max_nesting(node),
                params=_param_count(node),
            )
            t = FUNCTION_THRESHOLDS
            if fm.complexity > t["complexity"]:
                fm.flags.append("complexity")
            if fm.length > t["length"]:
                fm.flags.append("length")
            if fm.nesting > t["nesting"]:
                fm.flags.append("nesting")
            if fm.params > t["params"]:
                fm.flags.append("params")
            functions.append(fm)
    functions.sort(key=lambda f: f.lineno)

    counts = {"imports": 0, "try": 0, "if": 0, "loops": 0, "returns": 0, "classes": 0}
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            counts["imports"] += 1
        elif isinstance(node, ast.Try):
            counts["try"] += 1
        elif isinstance(node, (ast.If, ast.IfExp)):
            counts["if"] += 1
        elif isinstance(node, (ast.For, ast.AsyncFor, ast.While, ast.comprehension)):
            counts["loops"] += 1
        elif isinstance(node, ast.Return):
            counts["returns"] += 1
        elif isinstance(node, ast.ClassDef):
            counts["classes"] += 1

    cc_values = [f.complexity for f in functions] or [0]
    nest_values = [f.nesting for f in functions] or [0]
    param_values = [f.params for f in functions] or [0]
    len_values = [f.length for f in functions] or [0]

    try:
        hal = h_visit(source).total
        h_volume, h_difficulty, h_effort, h_bugs = hal.volume, hal.difficulty, hal.effort, hal.bugs
    except Exception:  # radon can choke on exotic syntax; treat as zero
        h_volume = h_difficulty = h_effort = h_bugs = 0.0
    try:
        mi = float(mi_visit(source, multi=True))
    except Exception:
        mi = 100.0

    numeric = {
        "loc": raw.loc,
        "sloc": raw.sloc,
        "lloc": raw.lloc,
        "comment_lines": comment_lines,
        "blank_lines": raw.blank,
        "comment_ratio": comment_lines / code_lines,
        "n_functions": len(functions),
        "n_classes": counts["classes"],
        "n_imports": counts["imports"],
        "cc_total": sum(cc_values),
        "cc_mean": sum(cc_values) / max(len(functions), 1),
        "cc_max": max(cc_values),
        "n_complex_functions": sum(1 for c in cc_values if c > FUNCTION_THRESHOLDS["complexity"]),
        "max_nesting": max(max(nest_values), _max_nesting(tree)),
        "mean_nesting": sum(nest_values) / max(len(functions), 1),
        "params_mean": sum(param_values) / max(len(functions), 1),
        "params_max": max(param_values),
        "func_len_mean": sum(len_values) / max(len(functions), 1),
        "func_len_max": max(len_values),
        "n_try": counts["try"],
        "n_branches": counts["if"],
        "n_loops": counts["loops"],
        "n_returns": counts["returns"],
        "halstead_volume": h_volume,
        "halstead_difficulty": h_difficulty,
        "halstead_effort": h_effort,
        "halstead_bugs": h_bugs,
        "maintainability_index": mi,
    }
    numeric = {k: float(numeric[k]) for k in NUMERIC_FEATURES}
    return FileFeatures(numeric=numeric, tokens=extract_tokens(source), functions=functions)
