from unittest.mock import patch, MagicMock

from conftest import get_csrf_token, post_json


def test_learning_resources_requires_topic(client):
    token = get_csrf_token(client, "/login")
    resp = post_json(client, "/api/learning-resources", {}, token)
    assert resp.status_code == 400


def test_learning_resources_rejects_overlong_topic(client):
    token = get_csrf_token(client, "/login")
    resp = post_json(client, "/api/learning-resources", {"topic": "x" * 201}, token)
    assert resp.status_code == 400


def test_learning_resources_unconfigured_when_no_api_key(client):
    # YOUTUBE_API_KEY is unset in the test environment (see conftest.py's
    # env setup / no .env loaded over it) — the route should degrade
    # gracefully rather than erroring, so the frontend's fallback kicks in.
    token = get_csrf_token(client, "/login")
    resp = post_json(client, "/api/learning-resources", {"topic": "python programming"}, token)
    assert resp.status_code == 200
    assert resp.get_json()["status"] == "unconfigured"


def test_learning_resources_returns_real_videos_when_configured(client):
    import app as app_module

    fake_response = MagicMock()
    fake_response.raise_for_status.return_value = None
    fake_response.json.return_value = {
        "items": [
            {
                "id": {"videoId": "abc123"},
                "snippet": {
                    "title": "Learn Python &amp; Flask",
                    "channelTitle": "Test Channel",
                    "thumbnails": {"medium": {"url": "https://example.com/thumb.jpg"}},
                },
            },
            # An item missing a videoId should be skipped, not crash the route.
            {"id": {}, "snippet": {"title": "No video id"}},
        ]
    }

    with patch.object(app_module, "YOUTUBE_API_KEY", "fake-key-for-test"), \
         patch.object(app_module.requests, "get", return_value=fake_response) as mock_get:
        token = get_csrf_token(client, "/login")
        resp = post_json(client, "/api/learning-resources", {"topic": "python"}, token)

    assert resp.status_code == 200
    data = resp.get_json()
    assert data["status"] == "success"
    assert len(data["videos"]) == 1
    video = data["videos"][0]
    assert video["title"] == "Learn Python & Flask"  # HTML-unescaped
    assert video["channel"] == "Test Channel"
    assert video["url"] == "https://www.youtube.com/watch?v=abc123"
    mock_get.assert_called_once()


def test_learning_resources_handles_upstream_failure(client):
    import app as app_module
    import requests as requests_module

    with patch.object(app_module, "YOUTUBE_API_KEY", "fake-key-for-test"), \
         patch.object(app_module.requests, "get", side_effect=requests_module.RequestException("boom")):
        token = get_csrf_token(client, "/login")
        resp = post_json(client, "/api/learning-resources", {"topic": "python"}, token)

    assert resp.status_code == 502
