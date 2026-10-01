"""FastAPI app. Run: uvicorn app.main:create_app --factory --reload"""
import logging
import os
import secrets
from typing import Literal

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import chat, gateway
from .ingest import MAX_BYTES, IngestError, ingest
from .store import Store

log = logging.getLogger("cargomate")


class Turn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=6000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[Turn] = Field(default_factory=list, max_length=20)


def _lazy(factory):
    cache = []

    def get():
        if not cache:
            cache.append(factory())
        return cache[0]

    return get


def create_app(store: Store | None = None, embed=None, claude=None) -> FastAPI:
    """Arguments exist so tests can inject fakes; in production they are built from the environment."""
    load_dotenv()
    if store is None:
        data_dir = os.environ.get("DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "data"))
        os.makedirs(data_dir, exist_ok=True)
        store = Store(os.path.join(data_dir, "knowledge.db"))

    get_embed = (lambda: embed) if embed else _lazy(gateway.embedder)
    get_claude = (lambda: claude) if claude else _lazy(gateway.chat_client)
    model = gateway.answer_model()

    app = FastAPI(title="CargoMate")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(","),
        allow_methods=["*"],
        allow_headers=["*"],
    )

    def admin(x_admin_token: str = Header(default="")):
        expected = os.environ.get("ADMIN_TOKEN", "")
        if not expected:
            raise HTTPException(503, "ADMIN_TOKEN is not set on the server.")
        if not secrets.compare_digest(x_admin_token.encode(), expected.encode()):
            raise HTTPException(401, "Wrong admin token.")

    @app.post("/api/chat")
    def post_chat(req: ChatRequest):
        history = [t.model_dump() for t in req.history]
        try:
            hits = chat.retrieve(store, get_embed(), req.message, history)
            return chat.answer(req.message, history, hits, get_claude(), model)
        except gateway.GatewayConfigError as e:
            log.error("gateway not configured: %s", e)  # details stay in the log; chat users aren't admins
            raise HTTPException(503, "The assistant isn't set up yet. Ask an administrator to configure the gateway.") from None
        except Exception:
            log.exception("chat failed")
            raise HTTPException(502, "The assistant could not produce an answer. Please try again.") from None

    @app.get("/api/documents", dependencies=[Depends(admin)])
    def list_documents():
        return store.list_docs()

    @app.post("/api/documents", dependencies=[Depends(admin)])
    def upload_document(file: UploadFile = File(...), category: str = Form(...), effective_date: str = Form(...)):
        data = file.file.read(MAX_BYTES + 1)
        try:
            status, n = ingest(store, get_embed(), file.filename or "", data, category, effective_date)
        except IngestError as e:
            raise HTTPException(400, str(e)) from None
        except gateway.GatewayConfigError as e:
            raise HTTPException(503, str(e)) from None  # the caller is an admin, so name the missing setting
        except Exception:
            log.exception("ingest failed")
            raise HTTPException(502, "Embedding failed. The existing version of this document is unchanged.") from None
        name = os.path.basename((file.filename or "").replace("\\", "/")).strip()
        if status == "unchanged":
            n = next((d["n_chunks"] for d in store.list_docs() if d["name"] == name), 0)
        return {"name": name, "status": status, "chunks": n}

    @app.delete("/api/documents/{name}", dependencies=[Depends(admin)])
    def delete_document(name: str):
        if not store.delete(name):
            raise HTTPException(404, "No such document.")
        return {"deleted": name}

    return app
