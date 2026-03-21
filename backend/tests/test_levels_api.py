from fastapi.testclient import TestClient


def test_list_levels_empty(client: TestClient):
    r = client.get("/api/v1/levels/")
    assert r.status_code == 200
    assert r.json() == []


def test_list_levels_with_seed(client: TestClient, sample_level):
    r = client.get("/api/v1/levels/")
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 1
    assert rows[0]["title"] == "Test level"


def test_get_level_detail_hides_golden_for_guest(client: TestClient, sample_level):
    r = client.get(f"/api/v1/levels/{sample_level.id}")
    assert r.status_code == 200
    body = r.json()
    assert body["golden_code"] is None
    assert body["golden_steps_count"] is None
