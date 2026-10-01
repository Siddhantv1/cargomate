import hashlib
import re
from types import SimpleNamespace

import numpy as np
import pytest

from app.chat import FIELDS, Answer, Section
from app.store import Store


def fake_embed(texts):
    """Hashed bag-of-words: texts sharing words get similar vectors, so retrieval is testable offline."""
    out = []
    for t in texts:
        v = np.zeros(256)
        for w in re.findall(r"[a-z0-9]+", t.lower()):
            v[int(hashlib.md5(w.encode()).hexdigest(), 16) % 256] += 1
        out.append(v.tolist())
    return out


class FakeClaude:
    """Stands in for anthropic.Anthropic(). Replies with the Answer as JSON text, or with `text` verbatim
    (to simulate a model that ignores the schema), and records each call."""

    def __init__(self, answer=None, stop_reason="end_turn", text=None):
        self.text = text if text is not None else (answer.model_dump_json() if answer else "")
        self.stop_reason, self.calls = stop_reason, []
        self.messages = SimpleNamespace(create=self._create)

    def _create(self, **kw):
        self.calls.append(kw)
        return SimpleNamespace(stop_reason=self.stop_reason, content=[SimpleNamespace(type="text", text=self.text)])


def make_answer(**over):
    """Every field not_applicable unless overridden: make_answer(hs_code=("ok", "6109", ["S1"])) or answer=(...)."""
    secs = {s: Section(status="not_applicable", content="", citations=[]) for s in FIELDS}
    follow = over.pop("follow_up_question", "")
    for k, (status, content, cites) in over.items():
        secs[k] = Section(status=status, content=content, citations=cites)
    return Answer(**secs, follow_up_question=follow)


@pytest.fixture(autouse=True)
def hermetic_env(monkeypatch):
    """Never read the developer's real backend/.env. Without this, create_app() refills settings the tests cleared
    and the 'unconfigured' tests end up calling the real gateway."""
    monkeypatch.setattr("app.main.load_dotenv", lambda *a, **k: None)


@pytest.fixture
def store(tmp_path):
    return Store(str(tmp_path / "k.db"))


@pytest.fixture
def embed():
    return fake_embed
