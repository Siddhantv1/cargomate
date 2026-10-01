"""The gateway wiring: where requests go, how they authenticate, which upstream provider they ask for.
Real SDKs against a mock HTTP transport, so nothing leaves the machine."""
import json

import httpx2 as httpx  # the SDKs use httpx2, not httpx
import pytest
from fastapi.testclient import TestClient

from app import gateway
from app.main import create_app
from tests.conftest import FakeClaude, make_answer

BASE, TOKEN = "https://gw.example.test", "tok-123"


@pytest.fixture(autouse=True)
def env(monkeypatch):
    for k in ("CHAT_PROVIDER", "EMBED_PROVIDER", "EMBED_MODEL", "ANSWER_MODEL"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("GATEWAY_BASE_URL", BASE)
    monkeypatch.setenv("GATEWAY_AUTH_TOKEN", TOKEN)
    monkeypatch.setenv("ADMIN_TOKEN", "secret")


def transport(reply, seen):
    def handler(request: httpx.Request):
        seen.append(request)
        return httpx.Response(200, json=reply(request))

    return httpx.Client(transport=httpx.MockTransport(handler))


def message_reply(_):
    return {"id": "m", "type": "message", "role": "assistant", "model": "x", "stop_reason": "end_turn",
            "stop_sequence": None, "content": [{"type": "text", "text": "hi"}],
            "usage": {"input_tokens": 1, "output_tokens": 1}}


def embedding_reply(request):
    inputs = json.loads(request.content)["input"]
    data = [{"object": "embedding", "index": i, "embedding": [float(t)]} for i, t in enumerate(inputs)]
    return {"object": "list", "model": "m", "data": data[::-1], "usage": {"prompt_tokens": 1, "total_tokens": 1}}


def test_chat_goes_to_the_gateway_with_bearer_token_and_dsvertex_provider():
    seen = []
    gateway.chat_client(http_client=transport(message_reply, seen)).messages.create(
        model="m", max_tokens=5, messages=[{"role": "user", "content": "hi"}])
    req = seen[0]
    assert str(req.url) == f"{BASE}/v1/messages"
    assert req.headers["authorization"] == f"Bearer {TOKEN}"
    assert req.headers["x-portkey-provider"] == "@dsvertex"
    assert "x-api-key" not in req.headers


def test_embeddings_go_to_the_gateway_with_azure_openai_provider_and_default_model():
    seen = []
    gateway.embedder(http_client=transport(embedding_reply, seen))(["1"])
    req = seen[0]
    assert str(req.url) == f"{BASE}/v1/embeddings"
    assert req.headers["authorization"] == f"Bearer {TOKEN}"
    assert req.headers["x-portkey-provider"] == "@azure-openai"
    assert json.loads(req.content)["model"] == "text-embedding-3-small"


def test_embeddings_are_batched_and_returned_in_input_order():
    seen = []
    texts = [str(i) for i in range(200)]
    out = gateway.embedder(http_client=transport(embedding_reply, seen))(texts)
    assert [len(json.loads(r.content)["input"]) for r in seen] == [96, 96, 8]
    assert out == [[float(i)] for i in range(200)]  # the mock answers in reverse; order must be restored


def test_trailing_slash_on_the_base_url_does_not_double_up(monkeypatch):
    monkeypatch.setenv("GATEWAY_BASE_URL", BASE + "/")
    seen = []
    gateway.embedder(http_client=transport(embedding_reply, seen))(["1"])
    assert str(seen[0].url) == f"{BASE}/v1/embeddings"


def test_providers_and_models_can_be_overridden_from_the_environment(monkeypatch):
    monkeypatch.setenv("CHAT_PROVIDER", "@other-chat")
    monkeypatch.setenv("EMBED_PROVIDER", "@other-embed")
    monkeypatch.setenv("EMBED_MODEL", "my-deployment")
    monkeypatch.setenv("ANSWER_MODEL", "anthropic.claude-opus-5")
    chat_seen, embed_seen = [], []
    gateway.chat_client(http_client=transport(message_reply, chat_seen)).messages.create(
        model=gateway.answer_model(), max_tokens=5, messages=[{"role": "user", "content": "hi"}])
    gateway.embedder(http_client=transport(embedding_reply, embed_seen))(["1"])
    assert chat_seen[0].headers["x-portkey-provider"] == "@other-chat"
    assert json.loads(chat_seen[0].content)["model"] == "anthropic.claude-opus-5"
    assert embed_seen[0].headers["x-portkey-provider"] == "@other-embed"
    assert json.loads(embed_seen[0].content)["model"] == "my-deployment"


def test_default_answer_model_is_the_one_in_the_gateway_catalogue():
    assert gateway.answer_model() == "anthropic.claude-sonnet-5-5"


@pytest.mark.parametrize("name", ["GATEWAY_BASE_URL", "GATEWAY_AUTH_TOKEN"])
@pytest.mark.parametrize("value", [None, "", "   "])
@pytest.mark.parametrize("build", [gateway.chat_client, gateway.embedder])
def test_missing_or_blank_settings_fail_fast_naming_the_setting(monkeypatch, name, value, build):
    monkeypatch.delenv(name) if value is None else monkeypatch.setenv(name, value)
    with pytest.raises(gateway.GatewayConfigError, match=name):
        build()


def test_unconfigured_gateway_tells_the_admin_which_setting_is_missing(store, monkeypatch):
    monkeypatch.delenv("GATEWAY_AUTH_TOKEN")
    c = TestClient(create_app(store))
    r = c.post("/api/documents", headers={"X-Admin-Token": "secret"},
               files={"file": ("a.txt", b"hello")}, data={"category": "dgft", "effective_date": "2026-01-01"})
    assert r.status_code == 503 and "GATEWAY_AUTH_TOKEN" in r.json()["detail"]
    assert store.list_docs() == []


def test_unconfigured_gateway_does_not_leak_settings_to_chat_users(store, monkeypatch):
    monkeypatch.delenv("GATEWAY_BASE_URL")
    r = TestClient(create_app(store)).post("/api/chat", json={"message": "hs code"})
    assert r.status_code == 503 and "GATEWAY" not in r.text and "administrator" in r.json()["detail"]


def test_a_later_fix_to_the_environment_is_picked_up_without_a_restart(store, embed, monkeypatch):
    """The failed client build must not be cached, or one bad start would stick."""
    monkeypatch.delenv("GATEWAY_BASE_URL")
    c = TestClient(create_app(store, claude=FakeClaude(make_answer())))
    assert c.post("/api/chat", json={"message": "hs"}).status_code == 503
    monkeypatch.setenv("GATEWAY_BASE_URL", BASE)
    # now configured, so it tries the (nonexistent .test) host and fails as a gateway error, not a config error
    assert c.post("/api/chat", json={"message": "hs"}).status_code == 502
