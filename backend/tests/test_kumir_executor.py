import pytest

from kumir.executor import KumirExecutor, normalize_map, TileType
from app.core.config import settings
from app.api.v1.endpoints.execute import _test_endpoint_hits_by_ip
from app.db.models import User, UserRole
from app.core.security import get_password_hash


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
    original_flag = settings.ENABLE_TEST_ENDPOINTS
    try:
        settings.ENABLE_TEST_ENDPOINTS = False
        r = client.get("/api/v1/execute/test")
        assert r.status_code == 401
    finally:
        settings.ENABLE_TEST_ENDPOINTS = original_flag


def test_execute_test_endpoint_requires_admin_and_flag(client, db_session):
    original_flag = settings.ENABLE_TEST_ENDPOINTS
    try:
        settings.ENABLE_TEST_ENDPOINTS = True
        admin = User(
            email="admin_test_exec@example.com",
            username="admin_test_exec",
            password_hash=get_password_hash("secret123"),
            role=UserRole.ADMIN,
            is_active=True,
        )
        db_session.add(admin)
        db_session.commit()
        login = client.post("/api/v1/auth/login", data={"username": admin.email, "password": "secret123"})
        assert login.status_code == 200
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
        r = client.get("/api/v1/execute/test", headers=headers)
        assert r.status_code == 200
        data = r.json()
        assert data.get("success") is True
    finally:
        settings.ENABLE_TEST_ENDPOINTS = original_flag


def test_execute_test_endpoint_returns_404_for_admin_when_flag_disabled(client, db_session):
    _test_endpoint_hits_by_ip.clear()
    original_flag = settings.ENABLE_TEST_ENDPOINTS
    try:
        settings.ENABLE_TEST_ENDPOINTS = False
        admin = User(
            email="admin_test_exec_off@example.com",
            username="admin_test_exec_off",
            password_hash=get_password_hash("secret123"),
            role=UserRole.ADMIN,
            is_active=True,
        )
        db_session.add(admin)
        db_session.commit()
        login = client.post("/api/v1/auth/login", data={"username": admin.email, "password": "secret123"})
        assert login.status_code == 200
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
        r = client.get("/api/v1/execute/test", headers=headers)
        assert r.status_code == 404
    finally:
        settings.ENABLE_TEST_ENDPOINTS = original_flag


def test_execute_test_endpoint_rate_limited(client, db_session):
    _test_endpoint_hits_by_ip.clear()
    original_flag = settings.ENABLE_TEST_ENDPOINTS
    try:
        settings.ENABLE_TEST_ENDPOINTS = True
        admin = User(
            email="admin_test_exec_rl@example.com",
            username="admin_test_exec_rl",
            password_hash=get_password_hash("secret123"),
            role=UserRole.ADMIN,
            is_active=True,
        )
        db_session.add(admin)
        db_session.commit()
        login = client.post("/api/v1/auth/login", data={"username": admin.email, "password": "secret123"})
        assert login.status_code == 200
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
        for _ in range(20):
            ok = client.get("/api/v1/execute/test", headers=headers)
            assert ok.status_code == 200
        limited = client.get("/api/v1/execute/test", headers=headers)
        assert limited.status_code == 429
        assert limited.json()["error_code"] == "RATE_LIMITED"
    finally:
        settings.ENABLE_TEST_ENDPOINTS = original_flag
