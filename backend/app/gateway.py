"""The only place that knows how to reach the LLM gateway (Portkey).

Chat uses the native Anthropic API and embeddings use the OpenAI-compatible API, both on the same gateway.
Portkey picks the upstream with the `x-portkey-provider` header, and the token goes in as a bearer token,
the same way Claude Code is pointed at it (ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, ANTHROPIC_CUSTOM_HEADERS).

Environment (backend/.env):
    GATEWAY_BASE_URL     gateway root, no /v1
    GATEWAY_AUTH_TOKEN   bearer token
    CHAT_PROVIDER        default @dsvertex
    EMBED_PROVIDER       default @azure-openai
    ANSWER_MODEL         default anthropic.claude-sonnet-5-5
    EMBED_MODEL          default text-embedding-3-small (the Azure deployment name)
"""
import os

BATCH = 96
PROVIDER_HEADER = "x-portkey-provider"


class GatewayConfigError(RuntimeError):
    """A required gateway setting is missing. The message names it and is safe to show an admin."""


def _need(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise GatewayConfigError(f"{name} is not set. Add it to backend/.env.")
    return value


def answer_model() -> str:
    return os.environ.get("ANSWER_MODEL", "anthropic.claude-sonnet-5-5")


def chat_client(http_client=None):
    import anthropic

    return anthropic.Anthropic(
        base_url=_need("GATEWAY_BASE_URL"),
        auth_token=_need("GATEWAY_AUTH_TOKEN"),
        default_headers={PROVIDER_HEADER: os.environ.get("CHAT_PROVIDER", "@dsvertex")},
        http_client=http_client,
    )


def embedder(http_client=None):
    """Returns embed(list[str]) -> list[list[float]]; callers take it as an argument so tests can fake it."""
    from openai import OpenAI

    client = OpenAI(
        base_url=_need("GATEWAY_BASE_URL").rstrip("/") + "/v1",
        api_key=_need("GATEWAY_AUTH_TOKEN"),
        default_headers={PROVIDER_HEADER: os.environ.get("EMBED_PROVIDER", "@azure-openai")},
        http_client=http_client,
    )
    model = os.environ.get("EMBED_MODEL", "text-embedding-3-small")

    def embed(texts: list[str]) -> list[list[float]]:
        out = []
        for i in range(0, len(texts), BATCH):
            resp = client.embeddings.create(model=model, input=texts[i : i + BATCH])
            out += [d.embedding for d in sorted(resp.data, key=lambda d: d.index)]
        return out

    return embed
