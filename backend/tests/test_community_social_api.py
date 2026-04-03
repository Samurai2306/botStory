from app.db.models import CommunityPost, User, PostCategory


def test_public_profile_by_id_and_privacy_flags(client, db_session, auth_headers, auth_user):
    auth_user.bio = "secret bio"
    auth_user.tagline = "secret tag"
    db_session.commit()

    r = client.patch(
        "/api/v1/users/me",
        headers=auth_headers,
        json={
            "profile_preferences": {
                "privacy": {
                    "hide_bio_on_public": True,
                    "hide_tagline_on_public": True,
                }
            }
        },
    )
    assert r.status_code == 200, r.text

    r = client.get(f"/api/v1/users/by-id/{auth_user.id}/public")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["id"] == auth_user.id
    assert body["canonical_username"] == auth_user.username
    assert body["bio"] is None
    assert body["tagline"] is None


def test_avatar_catalog_and_set_avatar(client, db_session, auth_headers):
    r = client.get("/api/v1/users/avatars/catalog")
    assert r.status_code == 200, r.text
    data = r.json()
    assert "robots" in data
    assert len(data["robots"]) == 10
    assert len(data["cats"]) == 5

    r = client.patch("/api/v1/users/me", headers=auth_headers, json={"avatar_key": "robots_01"})
    assert r.status_code == 200, r.text
    assert r.json()["avatar_url"].endswith("/api/v1/users/avatars/robots_01.svg")

    r = client.get("/api/v1/users/avatars/robots_01.svg")
    assert r.status_code == 200
    assert "<svg" in r.text


def test_posts_filter_author_and_search(client, db_session, auth_user):
    other = User(email="other@x.com", username="otheruser", password_hash="x", role=auth_user.role, is_active=True)
    db_session.add(other)
    db_session.commit()
    db_session.refresh(other)

    p1 = CommunityPost(author_id=auth_user.id, title="Alpha topic", content="hello world", category=PostCategory.DISCUSSION)
    p2 = CommunityPost(author_id=other.id, title="Beta topic", content="something else", category=PostCategory.DISCUSSION)
    db_session.add_all([p1, p2])
    db_session.commit()

    r = client.get(f"/api/v1/community/posts?author_id={auth_user.id}")
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 1
    assert rows[0]["author_id"] == auth_user.id

    r = client.get("/api/v1/community/posts?q=Alpha")
    assert r.status_code == 200
    rows = r.json()
    assert any(x["title"] == "Alpha topic" for x in rows)


def test_mentions_bookmarks_reputation_and_leaderboard(client, db_session, auth_headers, auth_user):
    second = User(email="second@x.com", username="seconduser", password_hash="x", role=auth_user.role, is_active=True)
    db_session.add(second)
    db_session.commit()
    db_session.refresh(second)

    r = client.post(
        "/api/v1/community/posts",
        headers=auth_headers,
        json={"title": "hello @seconduser", "content": "ping @seconduser", "category": "discussion"},
    )
    assert r.status_code == 201, r.text
    post_id = r.json()["id"]

    # bookmark toggle
    rb = client.post(f"/api/v1/community/posts/{post_id}/bookmark", headers=auth_headers)
    assert rb.status_code == 204
    rb = client.get("/api/v1/community/bookmarks", headers=auth_headers)
    assert rb.status_code == 200
    assert any(x["post_id"] == post_id for x in rb.json())

    # subscribe
    rs = client.post("/api/v1/community/subscriptions/discussion", headers=auth_headers)
    assert rs.status_code == 204
    rs = client.get("/api/v1/community/subscriptions", headers=auth_headers)
    assert rs.status_code == 200
    assert any(x["category"] == "discussion" for x in rs.json())

    # reputation leaderboard exists
    rl = client.get("/api/v1/community/reputation/leaderboard")
    assert rl.status_code == 200
    assert isinstance(rl.json(), list)


def test_poll_author_can_close_and_reopen_poll(client, auth_headers):
    created = client.post(
        "/api/v1/community/polls",
        headers=auth_headers,
        json={"title": "Голосование", "options": [{"text": "A"}, {"text": "B"}]},
    )
    assert created.status_code == 201, created.text
    poll_id = created.json()["id"]

    close_resp = client.patch(f"/api/v1/community/polls/{poll_id}/close", headers=auth_headers, json={"closed": True})
    assert close_resp.status_code == 200, close_resp.text
    assert close_resp.json()["closed"] is True

    reopen_resp = client.patch(f"/api/v1/community/polls/{poll_id}/close", headers=auth_headers, json={"closed": False})
    assert reopen_resp.status_code == 200, reopen_resp.text
    assert reopen_resp.json()["closed"] is False
