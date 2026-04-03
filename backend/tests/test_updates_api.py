from app.core.security import get_password_hash
from app.db.models import User, UserRole


def _admin_headers(client, db_session):
    admin = User(
        email="admin_updates@example.com",
        username="admin_updates",
        password_hash=get_password_hash("secret123"),
        role=UserRole.ADMIN,
        is_active=True,
    )
    db_session.add(admin)
    db_session.commit()
    r = client.post(
        "/api/v1/auth/login",
        data={"username": admin.email, "password": "secret123"},
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_updates_admin_create_and_public_visibility(client, db_session):
    admin_headers = _admin_headers(client, db_session)
    payload = {
        "title": "Release 2.2",
        "summary": "Timeline-based release log",
        "content": "Major update with timeline and theming.",
        "topic": "release",
        "is_published": False,
        "timeline_events": [
            {
                "date": "2026-03-27T10:00:00Z",
                "title": "API ready",
                "description": "Public/admin update API added",
                "type": "feature",
            }
        ],
        "theme_config": {
            "accent_color": "#8B7ED8",
            "secondary_color": "#B8A9E8",
            "background_gradient": "linear-gradient(135deg,#151127,#211a3b,#151127)",
            "icon": "◉",
            "timeline_style": "neon",
        },
        "layout_blocks": [{"type": "hero", "title": "Header", "content": "Hero block"}],
    }
    create = client.post("/api/v1/updates/", json=payload, headers=admin_headers)
    assert create.status_code == 201, create.text
    created = create.json()
    assert created["title"] == "Release 2.2"
    assert created["is_published"] is False

    public_list = client.get("/api/v1/updates/")
    assert public_list.status_code == 200
    assert public_list.json() == []

    publish = client.post(f"/api/v1/updates/{created['id']}/publish", headers=admin_headers)
    assert publish.status_code == 200, publish.text
    assert publish.json()["is_published"] is True

    public_list = client.get("/api/v1/updates/")
    assert public_list.status_code == 200
    assert len(public_list.json()) == 1
    assert public_list.json()[0]["title"] == "Release 2.2"

    latest = client.get("/api/v1/updates/latest")
    assert latest.status_code == 200
    assert latest.json()["id"] == created["id"]
