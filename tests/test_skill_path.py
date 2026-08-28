from unittest.mock import patch, MagicMock

from conftest import get_csrf_token, post_json


def test_skill_path_requires_topic(client):
    token = get_csrf_token(client, "/login")
    resp = post_json(client, "/api/skill-path", {}, token)
    assert resp.status_code == 400


def test_skill_path_rejects_overlong_topic(client):
    token = get_csrf_token(client, "/login")
    resp = post_json(client, "/api/skill-path", {"topic": "x" * 201}, token)
    assert resp.status_code == 400


def test_skill_path_unconfigured_when_no_gemini_key(client):
    # GEMINI_API_KEY is "" in the test environment (see conftest.py).
    token = get_csrf_token(client, "/login")
    resp = post_json(client, "/api/skill-path", {"topic": "guitar"}, token)
    assert resp.status_code == 200
    assert resp.get_json()["status"] == "unconfigured"


def _fake_gemini_response(text):
    resp = MagicMock()
    resp.text = text
    return resp


def test_skill_path_returns_parsed_steps_when_configured(client):
    import app as app_module

    fake_json = (
        '[{"title": "Learn the basics", "search_query": "guitar basics for beginners"},'
        ' {"title": "Practice chords", "search_query": "beginner guitar chords"}]'
    )
    fake_model = MagicMock()
    fake_model.generate_content.return_value = _fake_gemini_response(fake_json)

    with patch.object(app_module, "GEMINI_API_KEY", "fake-key-for-test"), \
         patch.object(app_module.genai, "GenerativeModel", return_value=fake_model):
        token = get_csrf_token(client, "/login")
        resp = post_json(client, "/api/skill-path", {"topic": "guitar"}, token)

    assert resp.status_code == 200
    data = resp.get_json()
    assert data["status"] == "success"
    assert data["topic"] == "guitar"
    assert len(data["steps"]) == 2
    assert data["steps"][0]["title"] == "Learn the basics"
    assert data["steps"][0]["search_query"] == "guitar basics for beginners"


def test_skill_path_strips_markdown_code_fences(client):
    import app as app_module

    fenced = '```json\n[{"title": "Step one", "search_query": "step one video"}]\n```'
    fake_model = MagicMock()
    fake_model.generate_content.return_value = _fake_gemini_response(fenced)

    with patch.object(app_module, "GEMINI_API_KEY", "fake-key-for-test"), \
         patch.object(app_module.genai, "GenerativeModel", return_value=fake_model):
        token = get_csrf_token(client, "/login")
        resp = post_json(client, "/api/skill-path", {"topic": "python"}, token)

    assert resp.status_code == 200
    data = resp.get_json()
    assert data["status"] == "success"
    assert len(data["steps"]) == 1


def test_skill_path_handles_malformed_model_output(client):
    import app as app_module

    fake_model = MagicMock()
    fake_model.generate_content.return_value = _fake_gemini_response("not json at all")

    with patch.object(app_module, "GEMINI_API_KEY", "fake-key-for-test"), \
         patch.object(app_module.genai, "GenerativeModel", return_value=fake_model):
        token = get_csrf_token(client, "/login")
        resp = post_json(client, "/api/skill-path", {"topic": "python"}, token)

    assert resp.status_code == 502
