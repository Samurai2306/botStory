from datetime import timedelta

import pytest

from app.core import security
from app.core.config import Settings, settings


def test_verify_password_roundtrip():
    h = security.get_password_hash("my-password")
    assert security.verify_password("my-password", h) is True
    assert security.verify_password("wrong", h) is False


def test_verify_password_empty_rejected():
    assert security.verify_password("", "$2b$12$x" + "0" * 50) is False
    assert security.verify_password("x", "") is False


def test_jwt_encode_decode_roundtrip():
    token = security.create_access_token(
        {"sub": "42", "role": "user"},
        expires_delta=timedelta(minutes=5),
    )
    payload = security.decode_token(token)
    assert payload is not None
    assert payload["sub"] == "42"
    assert payload["role"] == "user"


def test_jwt_invalid_returns_none():
    assert security.decode_token("not-a-jwt") is None
    assert security.decode_token("") is None


def test_create_access_token_uses_settings_ttl_when_no_delta(monkeypatch):
    monkeypatch.setattr(settings, "ACCESS_TOKEN_EXPIRE_MINUTES", 60)
    token = security.create_access_token({"sub": "1"})
    payload = security.decode_token(token)
    assert payload is not None
    assert "exp" in payload


def test_settings_secret_key_rejects_insecure_known_value():
    with pytest.raises(ValueError, match="known insecure value"):
        Settings(SECRET_KEY="changeme")


def test_settings_secret_key_rejects_short_value():
    with pytest.raises(ValueError, match="at least 32 characters"):
        Settings(SECRET_KEY="short-secret-key")
