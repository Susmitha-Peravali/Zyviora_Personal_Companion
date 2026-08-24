from conftest import get_csrf_token, post_json


def test_chat_requires_message_field(client):
    token = get_csrf_token(client, "/login")
    resp = post_json(client, "/chat", {}, token)
    assert resp.status_code == 400


def test_chat_routes_emotion_keywords_through_prolog(client):
    token = get_csrf_token(client, "/login")
    resp = post_json(client, "/chat", {"message": "I feel really sad today"}, token)
    assert resp.status_code == 200
    reply = resp.get_json()["response"]
    assert reply and reply != "[unhandled_intent]"


def test_chat_falls_back_to_no_key_message_when_unhandled(client):
    # GEMINI_API_KEY is empty in the test environment (see conftest.py), so an
    # unhandled-intent message should hit the deterministic "no key" fallback
    # rather than attempting a real network call to Gemini.
    token = get_csrf_token(client, "/login")
    resp = post_json(
        client, "/chat",
        {"message": "asdkjfh qwoeiru unmatched gibberish zzzxx"},
        token,
    )
    assert resp.status_code == 200
    assert "Gemini API key" in resp.get_json()["response"]


def test_chat_rejects_disallowed_characters(client):
    # preprocess_text() strips non-word characters already, but the explicit
    # guard in app.py should still reject anything that somehow survives with
    # non [\w\s] characters before it reaches the Prolog query string.
    import app as app_module
    from unittest.mock import patch

    token = get_csrf_token(client, "/login")
    with patch.object(app_module, "preprocess_text", return_value="hi; !bad!"):
        resp = post_json(client, "/chat", {"message": "irrelevant"}, token)
    assert resp.status_code == 400
