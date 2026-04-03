from fastapi.testclient import TestClient


def test_root(client: TestClient):
    r = client.get("/")
    assert r.status_code == 200
    body = r.json()
    assert body.get("message") == "Algorithmic Robot API"
    assert body.get("docs") == "/docs"


def test_health(client: TestClient):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "healthy"}


def test_error_contract_has_request_id(client: TestClient):
    r = client.get("/api/v1/levels/999999")
    assert r.status_code == 404
    body = r.json()
    assert "error_code" in body
    assert "message" in body
    assert "request_id" in body
    assert r.headers.get("X-Request-Id")


def test_error_contract_respects_incoming_request_id(client: TestClient):
    request_id = "req-sec-03-test"
    r = client.get("/api/v1/levels/999999", headers={"X-Request-Id": request_id})
    assert r.status_code == 404
    assert r.headers.get("X-Request-Id") == request_id
    assert r.json().get("request_id") == request_id


def test_validation_error_contract_does_not_leak_internal_details(client: TestClient):
    r = client.post("/api/v1/auth/register", json={"email": "bad@example.com"})
    assert r.status_code == 422
    body = r.json()
    assert body["error_code"] == "VALIDATION_ERROR"
    assert body["message"] == "Request validation failed"
    assert "errors" not in body
