from fastapi.testclient import TestClient


def test_execute_requires_auth(client: TestClient, sample_level):
    r = client.post(
        "/api/v1/execute/",
        json={"level_id": sample_level.id, "code": "вперед"},
    )
    assert r.status_code == 401


def test_execute_unknown_level(client: TestClient, auth_headers):
    r = client.post(
        "/api/v1/execute/",
        headers=auth_headers,
        json={"level_id": 99999, "code": "вперед"},
    )
    assert r.status_code == 404


def test_execute_success_reaches_finish(client: TestClient, sample_level, auth_headers):
    code = """
    направо
    направо
    вперед
    """
    r = client.post(
        "/api/v1/execute/",
        headers=auth_headers,
        json={"level_id": sample_level.id, "code": code},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["success"] is True
    assert data["reached_finish"] is True
    assert data["is_optimal"] is True
    assert data["golden_steps_count"] == 5
