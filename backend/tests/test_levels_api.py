from fastapi.testclient import TestClient
from app.db.models import User, UserRole
from app.core.security import get_password_hash


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


def test_submit_progress_rejects_fake_steps(client: TestClient, sample_level, auth_headers):
    payload = {
        "level_id": sample_level.id,
        "user_code": "направо\nнаправо\nвперед",
        "steps_count": 999,
    }
    r = client.post(f"/api/v1/levels/{sample_level.id}/progress", json=payload, headers=auth_headers)
    assert r.status_code == 400
    assert r.json()["error_code"] == "BAD_REQUEST"


def test_levels_pagination_cap_enforced(client: TestClient):
    r = client.get("/api/v1/levels/?limit=1000")
    assert r.status_code == 422
    assert r.json()["error_code"] == "VALIDATION_ERROR"


def test_admin_can_include_inactive_levels(client: TestClient, sample_level, db_session):
    sample_level.is_active = False
    db_session.commit()

    guest_view = client.get("/api/v1/levels/?include_inactive=true")
    assert guest_view.status_code == 200
    assert guest_view.json() == []

    admin = User(
        email="admin_levels@example.com",
        username="admin_levels",
        password_hash=get_password_hash("secret123"),
        role=UserRole.ADMIN,
        is_active=True,
    )
    db_session.add(admin)
    db_session.commit()
    login = client.post("/api/v1/auth/login", data={"username": admin.email, "password": "secret123"})
    assert login.status_code == 200, login.text
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    admin_view = client.get("/api/v1/levels/?include_inactive=true", headers=headers)
    assert admin_view.status_code == 200
    assert len(admin_view.json()) == 1
