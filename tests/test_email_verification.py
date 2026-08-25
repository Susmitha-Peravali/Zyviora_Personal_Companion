import re
from unittest.mock import patch

from conftest import get_csrf_token, post_json


def register_and_capture_verify_link(client, username, password="Testpass123!"):
    token = get_csrf_token(client, "/register")
    with patch("app.send_email") as mock_send:
        resp = post_json(client, "/register", {
            "username": username,
            "password": password,
            "email": f"{username}@example.com",
            "fullname": username.capitalize(),
        }, token)
    assert resp.status_code == 200, resp.get_data(as_text=True)
    assert mock_send.called
    body = mock_send.call_args.args[2]
    match = re.search(r"/verify-email\?token=([^\s]+)", body)
    assert match, f"no verify link found in email body: {body}"
    return match.group(1)


def test_registration_sends_verification_email(client):
    verify_token = register_and_capture_verify_link(client, "sam")
    assert verify_token


def test_new_account_starts_unverified(client, register_and_login):
    import app as app_module
    username, token = register_and_login(username="tara")
    resp = post_json(client, "/login", {"username": username, "password": "Testpass123!"}, token)
    assert resp.get_json()["emailVerified"] is False


def test_verify_email_with_valid_token_marks_verified(client):
    verify_token = register_and_capture_verify_link(client, "uma")

    resp = client.get(f"/verify-email?token={verify_token}")
    assert resp.status_code == 200
    assert b"Email Verified" in resp.data

    csrf = get_csrf_token(client, "/login")
    resp = post_json(client, "/login", {"username": "uma", "password": "Testpass123!"}, csrf)
    assert resp.get_json()["emailVerified"] is True


def test_verify_email_token_is_single_use(client):
    verify_token = register_and_capture_verify_link(client, "victor")

    resp = client.get(f"/verify-email?token={verify_token}")
    assert b"Email Verified" in resp.data

    resp = client.get(f"/verify-email?token={verify_token}")
    assert b"Link Invalid or Expired" in resp.data


def test_verify_email_rejects_invalid_token(client):
    resp = client.get("/verify-email?token=not-a-real-token")
    assert resp.status_code == 200
    assert b"Link Invalid or Expired" in resp.data


def test_verify_email_does_not_block_login_or_dashboard(client, register_and_login):
    """Verification is a soft nudge, not a gate — an unverified account
    must still be able to log in and use the app normally."""
    register_and_login(username="wendy")
    resp = client.get("/dashboard")
    assert resp.status_code == 200
