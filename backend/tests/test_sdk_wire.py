"""Drives the real anthropic SDK against a mock HTTP transport, so the request body and the
response parsing are checked without network access or an API key."""
import json

from app import gateway
import pytest
import httpx2 as httpx  # anthropic 1.x uses httpx2, not httpx

from app.chat import SECTIONS, AnswerFormatError, answer
from tests.conftest import make_answer

HITS = [{"id": 1, "doc": "hs.csv", "category": "hs_code", "effective_date": "2026-01-01", "text": "6109 t-shirts", "score": .9}]


@pytest.fixture(autouse=True)
def gateway_env(monkeypatch):
    monkeypatch.setenv("GATEWAY_BASE_URL", "https://gw.example.test")
    monkeypatch.setenv("GATEWAY_AUTH_TOKEN", "tok")


def sdk_client(reply_text, stop_reason="end_turn", seen=None):
    """The real client as the app builds it for the gateway, over a mock transport."""
    def handler(request: httpx.Request):
        if seen is not None:
            seen.append(json.loads(request.content))
        return httpx.Response(200, json={
            "id": "msg_1", "type": "message", "role": "assistant", "model": "anthropic.claude-sonnet-5-5",
            "content": [{"type": "text", "text": reply_text}], "stop_reason": stop_reason, "stop_sequence": None,
            "usage": {"input_tokens": 1, "output_tokens": 1},
        })

    return gateway.chat_client(http_client=httpx.Client(transport=httpx.MockTransport(handler)))


def test_request_carries_schema_and_response_parses_into_answer():
    seen = []
    reply = make_answer(hs_code=("ok", "6109 10", ["S1"])).model_dump_json()
    out = answer("HS for t-shirts", [], HITS, sdk_client(reply, seen=seen), "anthropic.claude-sonnet-5-5")

    body = seen[0]
    assert body["model"] == "anthropic.claude-sonnet-5-5" and "tool_choice" not in body and "thinking" not in body
    assert "one JSON object" in body["system"]  # instruction in the prompt, in case the provider ignores the schema
    schema = body["output_config"]["format"]["schema"]
    assert set(SECTIONS) <= set(schema["properties"]) and schema["additionalProperties"] is False
    assert "<sources>" in body["messages"][0]["content"] and body["system"].startswith("You are CargoMate")

    assert out["sections"]["hs_code"] == {"status": "ok", "content": "6109 10", "citations": ["S1"]}
    assert out["sources"][0]["document"] == "hs.csv"


@pytest.mark.parametrize("text", ["", "{}"])
def test_refusal_from_the_wire_gives_a_safe_answer(text):
    out = answer("q", [], HITS, sdk_client(text, stop_reason="refusal"), "anthropic.claude-sonnet-5-5")
    assert {s["status"] for s in out["sections"].values()} == {"no_data"} and out["disclaimer"]


@pytest.mark.parametrize("stop_reason, text", [
    ("max_tokens", '{"hs_code": {"sta'),
    ("end_turn", "hs_code:\nstatus: not_applicable\n\nfollow_up_question:"),  # the reply seen from the real gateway
])
def test_truncated_or_non_json_reply_from_the_wire_is_an_error(stop_reason, text):
    with pytest.raises(AnswerFormatError):
        answer("q", [], HITS, sdk_client(text, stop_reason=stop_reason), "anthropic.claude-sonnet-5-5")
