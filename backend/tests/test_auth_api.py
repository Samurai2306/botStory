from fastapi.testclient import TestClient


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
