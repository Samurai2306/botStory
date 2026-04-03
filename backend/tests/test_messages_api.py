from app.db.models import User, UserRole
from app.core.security import get_password_hash


def test_admin_can_moderate_delete_chat_message(client, db_session, auth_headers, auth_user, sample_level):
    created = client.post(
        "/api/v1/messages/",
        headers=auth_headers,
        json={"level_id": sample_level.id, "content": "Тест модерации"},
    )
    assert created.status_code == 201, created.text
    message_id = created.json()["id"]

    admin = User(
        email="admin_chat@example.com",
        username="admin_chat",
        password_hash=get_password_hash("secret123"),
        role=UserRole.ADMIN,
        is_active=True,
    )
    db_session.add(admin)
    db_session.commit()

    login = client.post("/api/v1/auth/login", data={"username": admin.email, "password": "secret123"})
    assert login.status_code == 200, login.text
    admin_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    deleted = client.delete(f"/api/v1/messages/{message_id}", headers=admin_headers)
    assert deleted.status_code == 204, deleted.text
