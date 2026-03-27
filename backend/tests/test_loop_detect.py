"""Tests for Kumir loop detection (no full app import)."""
from kumir.loop_detect import kumir_code_contains_loop, preprocess_kumir_lines


def test_no_loop_simple():
    assert not kumir_code_contains_loop("вперед\nналево")


def test_detects_nc_header():
    code = "\u043d\u0446 2 \u0440\u0430\u0437\n  \u0432\u043f\u0435\u0440\u0435\u0434\n\u043a\u0446"
    assert kumir_code_contains_loop(code)


def test_comment_strips_pipe():
    code = "\u0432\u043f\u0435\u0440\u0435\u0434 | \u043a\u043e\u043c\u043c\u0435\u043d\u0442\u0430\u0440\u0438\u0439"
    lines = preprocess_kumir_lines(code)
    assert lines == ["\u0432\u043f\u0435\u0440\u0435\u0434"]
