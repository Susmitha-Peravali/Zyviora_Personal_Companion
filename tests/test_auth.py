from conftest import get_csrf_token, post_json


def test_register_then_duplicate_username_rejected(client):
    payload = {"username": "alice", "password": "Testpass123!", "email": "alice@example.com", "fullname": "Alice"}
    token = get_csrf_token(client, "/register")
    resp = post_json(client, "/register", payload, token)
    assert resp.status_code == 200

    token = get_csrf_token(client, "/register")
    resp = post_json(client, "/register", {**payload, "email": "different@example.com"}, token)
    assert resp.status_code == 400
    assert resp.get_json()["status"] == "error"


def test_register_duplicate_email_rejected(client):
    token = get_csrf_token(client, "/register")
    resp = post_json(client, "/register", {
        "username": "userone", "password": "Testpass123!", "email": "shared@example.com", "fullname": "One",
    }, token)
    assert resp.status_code == 200

    token = get_csrf_token(client, "/register")
    resp = post_json(client, "/register", {
        "username": "usertwo", "password": "Testpass123!", "email": "shared@example.com", "fullname": "Two",
    }, token)
    assert resp.status_code == 400


def test_register_requires_email_and_fullname(client):
    token = get_csrf_token(client, "/register")
    resp = post_json(client, "/register", {"username": "incomplete", "password": "Testpass123!"}, token)
    assert resp.status_code == 400


def test_register_rejects_short_password(client):
    token = get_csrf_token(client, "/register")
    resp = post_json(client, "/register", {
        "username": "shortpw", "password": "abc123", "email": "shortpw@example.com", "fullname": "Short",
    }, token)
    assert resp.status_code == 400


def test_register_rejects_password_without_digit(client):
    token = get_csrf_token(client, "/register")
    resp = post_json(client, "/register", {
        "username": "nodigit", "password": "abcdefgh", "email": "nodigit@example.com", "fullname": "NoDigit",
    }, token)
    assert resp.status_code == 400


def test_login_locks_account_after_repeated_failures(client, register_and_login):
    username, _ = register_and_login(username="henry")

    for _ in range(5):
        token = get_csrf_token(client, "/login")
        resp = post_json(client, "/login", {"username": username, "password": "wrongpass1"}, token)
        assert resp.status_code == 401

    # Even the CORRECT password must now be rejected while locked out.
    token = get_csrf_token(client, "/login")
    resp = post_json(client, "/login", {"username": username, "password": "Testpass123!"}, token)
    assert resp.status_code == 403
    assert "Too many failed attempts" in resp.get_json()["message"]


def test_successful_login_resets_failed_attempts(client, register_and_login):
    import app as app_module
    username, _ = register_and_login(username="iris")

    token = get_csrf_token(client, "/login")
    post_json(client, "/login", {"username": username, "password": "wrong"}, token)

    token = get_csrf_token(client, "/login")
    resp = post_json(client, "/login", {"username": username, "password": "Testpass123!"}, token)
    assert resp.status_code == 200

    with app_module.app.app_context():
        user = app_module.User.query.filter_by(username=username).first()
        assert user.failed_login_attempts == 0


def test_login_returns_stored_full_name(client, register_and_login):
    username, token = register_and_login(username="grace")
    resp = post_json(client, "/login", {"username": username, "password": "Testpass123!"}, token)
    assert resp.get_json()["fullName"] == "Grace"


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


def test_sync_accepts_valid_payload(client, register_and_login):
    _, token = register_and_login(username="jack")
    resp = post_json(client, "/sync", {"zyviora_goals": "[]", "zyviora_tasks": "[]"}, token)
    assert resp.status_code == 200


def test_sync_rejects_non_object_payload(client, register_and_login):
    _, token = register_and_login(username="kate")
    resp = client.post("/sync", data="[1, 2, 3]", content_type="application/json",
                        headers={"X-CSRFToken": token})
    assert resp.status_code == 400


def test_sync_rejects_oversized_payload(client, register_and_login):
    _, token = register_and_login(username="liam")
    huge_payload = {"blob": "x" * (300 * 1024)}  # over the 256KB cap
    resp = post_json(client, "/sync", huge_payload, token)
    assert resp.status_code == 413


def test_privacy_page_loads(client):
    resp = client.get("/privacy")
    assert resp.status_code == 200
    assert b"Privacy Policy" in resp.data
