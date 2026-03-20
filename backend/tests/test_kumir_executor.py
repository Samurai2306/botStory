import pytest

from kumir.executor import KumirExecutor, normalize_map, TileType


def _minimal_old_map():
    return {
        "width": 3,
        "height": 3,
        "cells": [
            ["empty", "empty", "empty"],
            ["empty", "start", "empty"],
            ["empty", "finish", "empty"],
        ],
    }


def test_normalize_map_legacy_to_tiles_and_objects():
    n = normalize_map(_minimal_old_map())
    assert n["width"] == 3 and n["height"] == 3
    assert n["cells"][1][1] == TileType.PLATFORM.value
    types = {o["type"] for o in n["objects"]}
    assert "start" in types and "finish" in types


def test_preprocess_strips_comments():
    ex = KumirExecutor(_minimal_old_map())
    lines = ex._preprocess("вперед | comment\n| full line comment\n  направо  ")
    assert lines == ["вперед", "направо"]


def test_execute_forward_turn_reaches_finish():
    code = """
    направо
    направо
    вперед
    """
    r = KumirExecutor(_minimal_old_map()).execute(code)
    assert r["success"] is True
    assert r["reached_finish"] is True
    assert r["error"] is None


def test_unknown_command_fails():
    r = KumirExecutor(_minimal_old_map()).execute("прыжок")
    assert r["success"] is False
    assert "Неизвестная команда" in (r["error"] or "")


def test_loop_nc_kc_runs_inner_body():
    code = """
    нц 2 раз
    направо
    кц
    вперед
    """
    r = KumirExecutor(_minimal_old_map()).execute(code)
    assert r["success"] is True
    assert r["error"] is None


def test_missing_start_raises():
    bad = {"width": 1, "height": 1, "cells": [["empty"]]}
    with pytest.raises(ValueError, match="Start position"):
        KumirExecutor(bad)


def test_execute_test_endpoint_map_from_api(client):
    r = client.get("/api/v1/execute/test")
    assert r.status_code == 200
    data = r.json()
    assert data.get("success") is True
    assert data.get("reached_finish") is True
