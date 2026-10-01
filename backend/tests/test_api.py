import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import FakeClaude, make_answer

H = {"X-Admin-Token": "secret"}
CSV = b"code,desc\n6109,cotton knitted t-shirts\n"


@pytest.fixture(autouse=True)
def token(monkeypatch):
    monkeypatch.setenv("ADMIN_TOKEN", "secret")


def client(store, embed, claude=None):
    return TestClient(create_app(store, embed, claude or FakeClaude(make_answer(hs_code=("ok", "6109", ["S1"])))))


def upload(c, name="hs.csv", data=CSV, cat="hs_code", day="2026-01-01", headers=H):
    return c.post("/api/documents", headers=headers, files={"file": (name, data)}, data={"category": cat, "effective_date": day})


def test_upload_chat_reupload_delete_round_trip(store, embed):
    c = client(store, embed)
    assert upload(c).json() == {"name": "hs.csv", "status": "created", "chunks": 1}
    assert upload(c).json() == {"name": "hs.csv", "status": "unchanged", "chunks": 1}
    body = c.post("/api/chat", json={"message": "HS code for cotton knitted t-shirts"}).json()
    assert body["sections"]["hs_code"]["status"] == "ok" and body["sources"][0]["document"] == "hs.csv"
    assert "not legal" in body["disclaimer"]
    assert [d["name"] for d in c.get("/api/documents", headers=H).json()] == ["hs.csv"]
    assert c.delete("/api/documents/hs.csv", headers=H).status_code == 200
    assert c.delete("/api/documents/hs.csv", headers=H).status_code == 404
    gone = c.post("/api/chat", json={"message": "cotton knitted t-shirts"}).json()
    assert gone["answer"]["status"] == "no_data"


@pytest.mark.parametrize("headers", [{}, {"X-Admin-Token": "wrong"}])
def test_admin_routes_reject_missing_or_wrong_token(store, embed, headers):
    c = client(store, embed)
    assert upload(c, headers=headers).status_code == 401
    assert c.get("/api/documents", headers=headers).status_code == 401
    assert c.delete("/api/documents/x", headers=headers).status_code == 401
    assert store.list_docs() == []


def test_admin_disabled_when_token_unset(store, embed, monkeypatch):
    monkeypatch.delenv("ADMIN_TOKEN")
    assert upload(client(store, embed), headers={"X-Admin-Token": ""}).status_code == 503


def test_chat_needs_no_token(store, embed):
    assert client(store, embed).post("/api/chat", json={"message": "hi"}).status_code == 200


def test_bad_upload_is_a_400_with_a_readable_message(store, embed):
    r = upload(client(store, embed), name="x.exe")
    assert r.status_code == 400 and "Unsupported file type" in r.json()["detail"]


def test_embedding_outage_is_a_502_and_keeps_the_old_version(store, embed):
    upload(client(store, embed))

    def boom(_):
        raise RuntimeError("down")

    broken = TestClient(create_app(store, boom, FakeClaude(make_answer())))
    r = upload(broken, data=CSV + b"6110,jerseys\n")
    assert r.status_code == 502 and "unchanged" in r.json()["detail"]
    assert store.list_docs()[0]["n_chunks"] == 1


def test_model_failure_is_a_502_without_leaking_details(store, embed):
    class Boom:
        class messages:
            @staticmethod
            def parse(**_):
                raise RuntimeError("secret internal detail")

    c = client(store, embed, Boom)
    upload(c)
    r = c.post("/api/chat", json={"message": "cotton knitted t-shirts"})
    assert r.status_code == 502 and "secret" not in r.text


def test_an_unreadable_model_reply_is_a_502_not_a_misleading_no_data_answer(store, embed):
    yaml_reply = "hs_code:\nstatus: not_applicable\n\nfollow_up_question:"
    c = client(store, embed, FakeClaude(text=yaml_reply))
    upload(c)
    r = c.post("/api/chat", json={"message": "cotton knitted t-shirts"})
    assert r.status_code == 502 and "try again" in r.json()["detail"] and "sections" not in r.text


@pytest.mark.parametrize(
    "payload",
    [{"message": ""}, {"message": "x" * 2001}, {}, {"message": "hi", "history": [{"role": "system", "content": "x"}]}],
)
def test_chat_validates_input(store, embed, payload):
    assert client(store, embed).post("/api/chat", json=payload).status_code == 422
