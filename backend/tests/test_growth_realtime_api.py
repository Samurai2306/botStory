from app.db.models import LevelProgress, Message, UserNotification, UserNotificationType


def test_levels_offline_package_contains_levels_and_progress(client, db_session, auth_headers, auth_user, sample_level):
    progress = LevelProgress(
        user_id=auth_user.id,
        level_id=sample_level.id,
        completed=True,
        best_steps_count=7,
    )
    db_session.add(progress)
    db_session.commit()

    r = client.get("/api/v1/levels/offline-package", headers=auth_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body.get("levels"), list)
    assert any(x["id"] == sample_level.id for x in body["levels"])
    assert any(x["level_id"] == sample_level.id and x["completed"] is True for x in body["progress"])


def test_notifications_mark_read_bulk(client, db_session, auth_headers, auth_user):
    db_session.add_all(
        [
            UserNotification(user_id=auth_user.id, type=UserNotificationType.UPDATE, title="n1", is_read=False),
            UserNotification(user_id=auth_user.id, type=UserNotificationType.UPDATE, title="n2", is_read=False),
        ]
    )
    db_session.commit()

    mark = client.post("/api/v1/community/notifications/mark-read-bulk", headers=auth_headers)
    assert mark.status_code == 204, mark.text

    rows = db_session.query(UserNotification).filter(UserNotification.user_id == auth_user.id).all()
    assert rows and all(r.is_read for r in rows)


def test_users_search_exclude_user_id(client, db_session, auth_headers, auth_user):
    r = client.get(f"/api/v1/users/search?q={auth_user.username}&exclude_user_id={auth_user.id}", headers=auth_headers)
    assert r.status_code == 200, r.text
    assert r.json() == []


def test_realtime_notifications_ws_emits_unread_count(client, db_session, auth_user):
    login = client.post("/api/v1/auth/login", data={"username": auth_user.email, "password": "secret123"})
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]

    db_session.add(UserNotification(user_id=auth_user.id, type=UserNotificationType.UPDATE, title="ws", is_read=False))
    db_session.commit()

    with client.websocket_connect(f"/api/v1/realtime/notifications/ws?token={token}") as ws:
        msg = ws.receive_json()
        assert msg["type"] == "notifications_unread"
        assert msg["unread_count"] >= 1


def test_realtime_level_chat_ws_emits_snapshot(client, db_session, auth_user, sample_level):
    login = client.post("/api/v1/auth/login", data={"username": auth_user.email, "password": "secret123"})
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]

    db_session.add(Message(level_id=sample_level.id, user_id=auth_user.id, content="hello ws"))
    db_session.commit()

    with client.websocket_connect(f"/api/v1/realtime/levels/{sample_level.id}/chat/ws?token={token}") as ws:
        msg = ws.receive_json()
        assert msg["type"] == "chat_snapshot"
        assert any(row["content"] == "hello ws" for row in msg["messages"])
