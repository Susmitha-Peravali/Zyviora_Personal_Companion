def test_healthz_returns_ok(client):
    resp = client.get("/healthz")
    assert resp.status_code == 200
    assert resp.get_json()["status"] == "ok"


def test_healthz_survives_being_polled_past_the_default_rate_limit(client):
    """Regression test: default_limits (50/hour) applied globally, including
    to whatever a load balancer/orchestrator polls for health. A checker
    hitting the app every few seconds trips that limit fast, gets 429'd, and
    the orchestrator cycles the instance thinking it's unhealthy — this is
    exactly what happened in production against the real health check."""
    for _ in range(60):
        resp = client.get("/healthz")
        assert resp.status_code == 200


def test_home_page_also_survives_repeated_polling(client):
    """Some platforms default to polling '/' itself as the health check."""
    for _ in range(60):
        resp = client.get("/")
        assert resp.status_code == 200
