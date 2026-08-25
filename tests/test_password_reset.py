import re
from unittest.mock import patch

from conftest import get_csrf_token, post_json


def request_reset_and_capture_token(client, email):
    """Requests a password reset and extracts the raw token from the email
    body, the same way a real user would get it from their inbox — send_email
    is mocked since no real SMTP is configured in tests."""
    token = get_csrf_token(client, "/forgot-password")
    with patch("app.send_email") as mock_send:
        resp = post_json(client, "/forgot-password", {"email": email}, token)
    assert resp.status_code == 200
    assert mock_send.called
    body = mock_send.call_args.args[2]
    match = re.search(r"/reset-password\?token=([^\s]+)", body)
    assert match, f"no reset link found in email body: {body}"
    return match.group(1)


def test_forgot_password_sends_email_for_existing_account(client, register_and_login):
    register_and_login(username="oliver")
    token = request_reset_and_capture_token(client, "oliver@example.com")
    assert token


def test_forgot_password_same_response_for_unknown_email(client):
    """No account-enumeration: same response whether or not the email
    matches an account, and no email attempted for an unknown one."""
    csrf = get_csrf_token(client, "/forgot-password")
    with patch("app.send_email") as mock_send:
        resp = post_json(client, "/forgot-password", {"email": "nobody@example.com"}, csrf)
    assert resp.status_code == 200
    assert not mock_send.called
    assert "reset link" in resp.get_json()["message"].lower()


def test_reset_password_with_valid_token_allows_login_with_new_password(client, register_and_login):
    username, _ = register_and_login(username="petra")
    reset_token = request_reset_and_capture_token(client, "petra@example.com")

    csrf = get_csrf_token(client, f"/reset-password?token={reset_token}")
    resp = post_json(client, "/reset-password", {"token": reset_token, "password": "NewStrongPass1"}, csrf)
    assert resp.status_code == 200

    csrf = get_csrf_token(client, "/login")
    resp = post_json(client, "/login", {"username": username, "password": "NewStrongPass1"}, csrf)
    assert resp.status_code == 200

    # Old password must no longer work.
    csrf = get_csrf_token(client, "/login")
    resp = post_json(client, "/login", {"username": username, "password": "Testpass123!"}, csrf)
    assert resp.status_code == 401


def test_reset_token_is_single_use(client, register_and_login):
    register_and_login(username="quinn")
    reset_token = request_reset_and_capture_token(client, "quinn@example.com")

    csrf = get_csrf_token(client, f"/reset-password?token={reset_token}")
    resp = post_json(client, "/reset-password", {"token": reset_token, "password": "NewStrongPass1"}, csrf)
    assert resp.status_code == 200

    csrf = get_csrf_token(client, f"/reset-password?token={reset_token}")
    resp = post_json(client, "/reset-password", {"token": reset_token, "password": "AnotherPass2"}, csrf)
    assert resp.status_code == 400


def test_reset_password_rejects_invalid_token(client):
    csrf = get_csrf_token(client, "/reset-password?token=not-a-real-token")
    resp = post_json(client, "/reset-password", {"token": "not-a-real-token", "password": "NewStrongPass1"}, csrf)
    assert resp.status_code == 400


def test_reset_password_rejects_weak_new_password(client, register_and_login):
    register_and_login(username="ruth")
    reset_token = request_reset_and_capture_token(client, "ruth@example.com")

    csrf = get_csrf_token(client, f"/reset-password?token={reset_token}")
    resp = post_json(client, "/reset-password", {"token": reset_token, "password": "weak"}, csrf)
    assert resp.status_code == 400


def test_forgot_password_page_loads(client):
    resp = client.get("/forgot-password")
    assert resp.status_code == 200


def test_reset_password_page_loads_with_token(client):
    resp = client.get("/reset-password?token=abc123")
    assert resp.status_code == 200


def test_reset_password_page_handles_missing_token(client):
    resp = client.get("/reset-password")
    assert resp.status_code == 200
    assert b"missing its token" in resp.data
