import pytest

from ml.features import NUMERIC_FEATURES, CodeParseError, extract_features, extract_tokens

SIMPLE = '''
def add(a, b):
    """Add two numbers."""
    return a + b
'''

NESTED = '''
def process(items, mode, limit, verbose, retries, timeout):
    for item in items:
        if item:
            while retries:
                try:
                    with open(item) as fh:
                        if mode == "a":
                            return fh.read()
                        elif mode == "b":
                            return None
                except OSError:
                    retries -= 1
    return limit
'''


def test_all_numeric_features_present():
    f = extract_features(SIMPLE)
    assert list(f.numeric) == NUMERIC_FEATURES
    assert all(isinstance(v, float) for v in f.numeric.values())


def test_simple_function_metrics():
    f = extract_features(SIMPLE)
    assert f.numeric["n_functions"] == 1
    assert f.numeric["cc_max"] == 1
    assert f.numeric["params_max"] == 2
    fn = f.functions[0]
    assert (fn.name, fn.lineno, fn.length, fn.flags) == ("add", 2, 3, [])


def test_nesting_and_flags():
    f = extract_features(NESTED)
    fn = f.functions[0]
    # for > if > while > try > with > if  (elif does not add a level)
    assert fn.nesting == 6
    assert fn.params == 6
    assert set(fn.flags) == {"nesting", "params"}


def test_elif_chain_is_not_nesting():
    code = "def f(x):\n    if x == 1:\n        return 1\n    elif x == 2:\n        return 2\n    elif x == 3:\n        return 3\n"
    assert extract_features(code).functions[0].nesting == 1


def test_self_is_not_a_parameter():
    code = "class A:\n    def m(self, a):\n        return a\n"
    f = extract_features(code)
    assert f.functions[0].params == 1
    assert f.numeric["n_classes"] == 1


def test_tokens_split_identifiers_and_mark_keywords():
    toks = extract_tokens("def parseHttpResponse(raw_body):\n    return raw_body  # decode payload\n").split()
    assert {"parse", "http", "response", "raw", "body", "kw_def", "kw_return", "decode", "payload"} <= set(toks)


@pytest.mark.parametrize("code", ["", "   \n\t"])
def test_empty_code_rejected(code):
    with pytest.raises(CodeParseError):
        extract_features(code)


def test_syntax_error_reports_line():
    with pytest.raises(CodeParseError) as exc:
        extract_features("x = 1\ndef broken(:\n    pass\n")
    assert exc.value.line == 2
