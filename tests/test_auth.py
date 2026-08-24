from conftest import get_csrf_token, post_json


def test_register_then_duplicate_username_rejected(client):
    token = get_csrf_token(client, "/register")
    resp = post_json(client, "/register", {"username": "alice", "password": "Testpass123!"}, token)
    assert resp.status_code == 200

    token = get_csrf_token(client, "/register")
    resp = post_json(client, "/register", {"username": "alice", "password": "Testpass123!"}, token)
    assert resp.status_code == 400
    assert resp.get_json()["status"] == "error"


def test_login_wrong_password_rejected(client, register_and_login):
    register_and_login(username="bob")
    token = get_csrf_token(client, "/login")
    resp = post_json(client, "/login", {"username": "bob", "password": "wrong"}, token)
    assert resp.status_code == 401


def test_login_success_allows_dashboard_access(client, register_and_login):
    register_and_login(username="carol")
    resp = client.get("/dashboard")
    assert resp.status_code == 200


def test_dashboard_redirects_when_not_logged_in(client):
    resp = client.get("/dashboard", follow_redirects=False)
    assert resp.status_code == 302
    assert "/login" in resp.headers["Location"]


def test_logout_revokes_dashboard_access(client, register_and_login):
    register_and_login(username="dave")
    assert client.get("/dashboard").status_code == 200

    token = get_csrf_token(client, "/dashboard")
    client.post("/logout", headers={"X-CSRFToken": token})

    resp = client.get("/dashboard", follow_redirects=False)
    assert resp.status_code == 302


def test_post_without_csrf_token_is_rejected(client):
    resp = client.post("/login", json={"username": "x", "password": "y"})
    assert resp.status_code == 400
    assert b"CSRF" in resp.data


def test_sync_requires_login(client):
    token = get_csrf_token(client, "/login")
    resp = post_json(client, "/sync", {"foo": "bar"}, token)
    assert resp.status_code == 401
