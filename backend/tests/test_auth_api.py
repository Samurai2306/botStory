from fastapi.testclient import TestClient
from app.core.config import settings
from app.core.login_protection import reset_login_protection_state


def test_register_and_login(client: TestClient):
    reg = client.post(
        "/api/v1/auth/register",
        json={
            "email": "newuser@example.com",
            "username": "newuser",
            "password": "pass12345",
        },
    )
    assert reg.status_code == 201, reg.text

    bad_login = client.post(
        "/api/v1/auth/login",
        data={"username": "newuser@example.com", "password": "wrong"},
    )
    assert bad_login.status_code == 401

    ok = client.post(
        "/api/v1/auth/login",
        data={"username": "newuser@example.com", "password": "pass12345"},
    )
    assert ok.status_code == 200
    assert "access_token" in ok.json()


def test_register_duplicate_email(client: TestClient):
    body = {
        "email": "dup@example.com",
        "username": "user_a",
        "password": "pass12345",
    }
    assert client.post("/api/v1/auth/register", json=body).status_code == 201
    body2 = {**body, "username": "user_b"}
    r = client.post("/api/v1/auth/register", json=body2)
    assert r.status_code == 400
    assert "Email already registered" in r.json().get("detail", "")


def test_login_bruteforce_rate_limit(client: TestClient):
    reset_login_protection_state()
    original_ip_limit = settings.LOGIN_MAX_ATTEMPTS_PER_IP
    original_window = settings.LOGIN_RATE_LIMIT_WINDOW_SECONDS
    settings.LOGIN_MAX_ATTEMPTS_PER_IP = 2
    settings.LOGIN_RATE_LIMIT_WINDOW_SECONDS = 60
    try:
        body = {"username": "ghost@example.com", "password": "wrong"}
        r1 = client.post("/api/v1/auth/login", data=body)
        assert r1.status_code == 401
        r2 = client.post("/api/v1/auth/login", data=body)
        assert r2.status_code == 401
        r3 = client.post("/api/v1/auth/login", data=body)
        assert r3.status_code == 429
        payload = r3.json()
        assert payload["error_code"] == "RATE_LIMITED"
    finally:
        settings.LOGIN_MAX_ATTEMPTS_PER_IP = original_ip_limit
        settings.LOGIN_RATE_LIMIT_WINDOW_SECONDS = original_window
        reset_login_protection_state()


def test_login_account_lockout_returns_retry_after(client: TestClient):
    reset_login_protection_state()
    original_ip_limit = settings.LOGIN_MAX_ATTEMPTS_PER_IP
    original_account_limit = settings.LOGIN_MAX_ATTEMPTS_PER_ACCOUNT
    original_lockout = settings.LOGIN_LOCKOUT_SECONDS
    original_window = settings.LOGIN_RATE_LIMIT_WINDOW_SECONDS
    settings.LOGIN_MAX_ATTEMPTS_PER_IP = 100
    settings.LOGIN_MAX_ATTEMPTS_PER_ACCOUNT = 2
    settings.LOGIN_LOCKOUT_SECONDS = 30
    settings.LOGIN_RATE_LIMIT_WINDOW_SECONDS = 60
    try:
        body = {"username": "victim@example.com", "password": "wrong"}
        r1 = client.post("/api/v1/auth/login", data=body)
        assert r1.status_code == 401
        r2 = client.post("/api/v1/auth/login", data=body)
        assert r2.status_code == 401
        r3 = client.post("/api/v1/auth/login", data=body)
        assert r3.status_code == 429
        assert r3.json()["error_code"] == "RATE_LIMITED"
        assert r3.headers.get("Retry-After")
    finally:
        settings.LOGIN_MAX_ATTEMPTS_PER_IP = original_ip_limit
        settings.LOGIN_MAX_ATTEMPTS_PER_ACCOUNT = original_account_limit
        settings.LOGIN_LOCKOUT_SECONDS = original_lockout
        settings.LOGIN_RATE_LIMIT_WINDOW_SECONDS = original_window
        reset_login_protection_state()
