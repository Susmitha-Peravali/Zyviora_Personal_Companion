from unittest.mock import patch

from conftest import get_csrf_token, post_json


def test_open_app_rejects_unauthenticated_requests(client):
    """/open-app launches a real process on the server, so an
    unauthenticated caller must never reach it. Assert both the response
    and that subprocess/webbrowser were never touched."""
    token = get_csrf_token(client, "/login")
    with patch("app.subprocess.Popen") as mock_popen, \
         patch("app.webbrowser.open") as mock_open:
        resp = post_json(client, "/open-app", {"app_name": "calculator"}, token)

    assert resp.status_code == 401
    mock_popen.assert_not_called()
    mock_open.assert_not_called()


def test_open_app_launches_whitelisted_app_when_logged_in(client, register_and_login):
    _, token = register_and_login(username="erin")
    with patch("app.subprocess.Popen") as mock_popen:
        resp = post_json(client, "/open-app", {"app_name": "calculator"}, token)

    assert resp.status_code == 200
    assert resp.get_json()["status"] == "success"
    mock_popen.assert_called_once_with("calc.exe")


def test_open_app_rejects_unknown_app_name(client, register_and_login):
    _, token = register_and_login(username="frank")
    with patch("app.subprocess.Popen") as mock_popen, \
         patch("app.webbrowser.open") as mock_open:
        resp = post_json(client, "/open-app", {"app_name": "totally_not_a_real_app"}, token)

    assert resp.status_code == 400
    mock_popen.assert_not_called()
    mock_open.assert_not_called()
