from fastapi.testclient import TestClient


def test_news_pagination_cap_enforced(client: TestClient):
    r = client.get("/api/v1/news/?limit=1000")
    assert r.status_code == 422
    assert r.json()["error_code"] == "VALIDATION_ERROR"


def test_community_posts_pagination_cap_enforced(client: TestClient):
    r = client.get("/api/v1/community/posts?limit=1000")
    assert r.status_code == 422
    assert r.json()["error_code"] == "VALIDATION_ERROR"


def test_notes_pagination_cap_enforced(client: TestClient, auth_headers):
    r = client.get("/api/v1/notes/?limit=1000", headers=auth_headers)
    assert r.status_code == 422
    assert r.json()["error_code"] == "VALIDATION_ERROR"


def test_level_chat_pagination_cap_enforced(client: TestClient, auth_headers):
    r = client.get("/api/v1/messages/level/1?limit=1000", headers=auth_headers)
    assert r.status_code == 422
    assert r.json()["error_code"] == "VALIDATION_ERROR"
