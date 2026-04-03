from fastapi.testclient import TestClient

from app.db.models import User, UserNotification, UserNotificationType, UserRole
from app.core.security import get_password_hash


def test_notification_list_includes_pinned_and_pin_endpoint(client: TestClient, db_session, auth_headers, auth_user):
    u = db_session.query(User).filter(User.id == auth_user.id).first()
    assert u is not None
    n1 = UserNotification(
        user_id=u.id,
        type=UserNotificationType.UPDATE,
        title="Test A",
        body="Body",
        is_read=False,
        is_pinned=False,
    )
    n2 = UserNotification(
        user_id=u.id,
        type=UserNotificationType.UPDATE,
        title="Test B",
        body=None,
        is_read=True,
        is_pinned=True,
    )
    db_session.add_all([n1, n2])
    db_session.commit()
    db_session.refresh(n1)
    db_session.refresh(n2)

    r = client.get("/api/v1/community/notifications", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 2
    ids = {row["id"]: row for row in data}
    assert ids[n2.id]["is_pinned"] is True
    assert ids[n1.id]["is_pinned"] is False

    pin = client.post(f"/api/v1/community/notifications/{n1.id}/pin", json={"pinned": True}, headers=auth_headers)
    assert pin.status_code == 200
    assert pin.json()["is_pinned"] is True


def _login_headers(client: TestClient, email: str, password: str) -> dict:
    r = client.post("/api/v1/auth/login", data={"username": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_notification_broadcast_admin_creates_for_all_non_guest(client: TestClient, db_session, auth_user):
    admin = User(
        email="admin_bc@example.com",
        username="admin_bc",
        password_hash=get_password_hash("secret123"),
        role=UserRole.ADMIN,
        is_active=True,
    )
    db_session.add(admin)
    db_session.commit()
    db_session.refresh(admin)

    admin_headers = _login_headers(client, admin.email, "secret123")
    user_headers = _login_headers(client, auth_user.email, "secret123")

    r = client.post(
        "/api/v1/community/notifications/broadcast",
        json={"title": "Серверные работы", "body": "Краткий текст", "theme": "maintenance"},
        headers=admin_headers,
    )
    assert r.status_code == 201, r.text
    assert r.json()["recipients"] == 2

    mine = client.get("/api/v1/community/notifications", headers=user_headers)
    assert mine.status_code == 200
    rows = mine.json()
    titles = [row["title"] for row in rows]
    assert "Серверные работы" in titles
    broadcast_rows = [row for row in rows if row.get("payload", {}).get("admin_broadcast")]
    assert len(broadcast_rows) >= 1
    assert broadcast_rows[0]["body"] == "Краткий текст"
    assert broadcast_rows[0]["type"] == "maintenance"
    assert broadcast_rows[0]["payload"].get("broadcast_theme") == "maintenance"


def test_notification_broadcast_forbidden_for_non_admin(client: TestClient, auth_headers):
    r = client.post(
        "/api/v1/community/notifications/broadcast",
        json={"title": "X"},
        headers=auth_headers,
    )
    assert r.status_code == 403
