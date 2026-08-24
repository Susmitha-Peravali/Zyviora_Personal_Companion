import os
import re
import tempfile

import pytest

# Must be set before `app` is imported: app.py reads these via os.getenv()
# at module import time (SQLALCHEMY_DATABASE_URI, REDIS_URL branch, etc).
_db_fd, _db_path = tempfile.mkstemp(suffix=".db")
os.environ["DATABASE_URL"] = f"sqlite:///{_db_path}"
os.environ["SECRET_KEY"] = "test-secret-key"
os.environ.pop("REDIS_URL", None)
# Empty key exercises the deterministic "no Gemini key configured" fallback
# in /chat instead of making a real network call.
os.environ["GEMINI_API_KEY"] = ""

import app as app_module  # noqa: E402  (must import after env vars are set)


@pytest.fixture()
def app():
    app_module.app.config.update(TESTING=True)
    yield app_module.app


@pytest.fixture()
def client(app):
    return app.test_client()


def get_csrf_token(client, page_url="/login"):
    resp = client.get(page_url)
    match = re.search(r'name="csrf-token" content="([^"]+)"', resp.get_data(as_text=True))
    assert match, f"no csrf-token meta tag found on {page_url}"
    return match.group(1)


@pytest.fixture()
def csrf_token(client):
    return get_csrf_token(client)


def post_json(client, url, payload, token):
    return client.post(url, json=payload, headers={"X-CSRFToken": token})


@pytest.fixture()
def register_and_login(client):
    """Registers and logs in a fresh user, returning (client, username)."""
    def _do(username="testuser", password="Testpass123!"):
        token = get_csrf_token(client, "/register")
        resp = post_json(client, "/register", {"username": username, "password": password}, token)
        assert resp.status_code == 200, resp.get_data(as_text=True)

        token = get_csrf_token(client, "/login")
        resp = post_json(client, "/login", {"username": username, "password": password}, token)
        assert resp.status_code == 200, resp.get_data(as_text=True)
        return username, token
    return _do
