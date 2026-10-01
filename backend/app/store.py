"""SQLite document registry + chunk/embedding store with numpy cosine search."""
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

import numpy as np

CATEGORIES = ("hs_code", "dgft", "freight", "port", "compliance")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
    name TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, category TEXT NOT NULL,
    effective_date TEXT NOT NULL, n_chunks INTEGER NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc TEXT NOT NULL REFERENCES documents(name) ON DELETE CASCADE,
    category TEXT NOT NULL, effective_date TEXT NOT NULL, text TEXT NOT NULL, emb BLOB NOT NULL);
CREATE INDEX IF NOT EXISTS chunks_doc ON chunks(doc);
"""


def _unit(v) -> np.ndarray:
    a = np.asarray(v, dtype=np.float32)
    n = np.linalg.norm(a)
    return a / n if n else a


class Store:
    def __init__(self, path: str):
        self.path = path
        with self._db() as db:
            db.executescript(_SCHEMA)

    @contextmanager
    def _db(self):
        db = sqlite3.connect(self.path, timeout=30)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
        try:
            with db:  # one transaction: commit on success, roll back on error
                yield db
        finally:
            db.close()

    def fingerprint(self, name: str) -> str | None:
        with self._db() as db:
            row = db.execute("SELECT fingerprint FROM documents WHERE name=?", (name,)).fetchone()
        return row["fingerprint"] if row else None

    def upsert(self, name, fingerprint, category, effective_date, texts, vectors) -> None:
        """Replace everything stored for `name` atomically."""
        assert len(texts) == len(vectors)
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        with self._db() as db:
            db.execute("DELETE FROM documents WHERE name=?", (name,))  # cascades to chunks
            db.execute(
                "INSERT INTO documents VALUES (?,?,?,?,?,?)",
                (name, fingerprint, category, effective_date, len(texts), now),
            )
            db.executemany(
                "INSERT INTO chunks (doc, category, effective_date, text, emb) VALUES (?,?,?,?,?)",
                [(name, category, effective_date, t, _unit(v).tobytes()) for t, v in zip(texts, vectors)],
            )

    def delete(self, name: str) -> bool:
        with self._db() as db:
            return db.execute("DELETE FROM documents WHERE name=?", (name,)).rowcount > 0

    def list_docs(self) -> list[dict]:
        with self._db() as db:
            rows = db.execute(
                "SELECT name, category, effective_date, n_chunks, updated_at FROM documents ORDER BY category, name"
            ).fetchall()
        return [dict(r) for r in rows]

    def search(self, qvec, per_category: int = 4, min_score: float = 0.25) -> list[dict]:
        """Top `per_category` chunks in each category above `min_score`.

        ponytail: loads a category's vectors per query; fine for ~10^4 chunks, move to an ANN index beyond that.
        """
        q = _unit(qvec)
        hits = []
        with self._db() as db:
            for cat in CATEGORIES:
                rows = db.execute(
                    "SELECT id, doc, category, effective_date, text, emb FROM chunks WHERE category=?", (cat,)
                ).fetchall()
                if not rows:
                    continue
                mat = np.vstack([np.frombuffer(r["emb"], dtype=np.float32) for r in rows])
                scores = mat @ q
                for i in np.argsort(-scores)[:per_category]:
                    if scores[i] >= min_score:
                        hits.append(_hit(rows[i], float(scores[i])))
        return hits

    def exact(self, heading: str, categories=("hs_code", "dgft"), limit: int = 3) -> list[dict]:
        """Chunks that literally mention a 4-digit HS heading (vectors are weak on numbers)."""
        marks = ",".join("?" * len(categories))
        with self._db() as db:
            rows = db.execute(
                f"SELECT id, doc, category, effective_date, text FROM chunks "
                f"WHERE category IN ({marks}) AND text LIKE ? LIMIT ?",
                (*categories, f"%{heading}%", limit),
            ).fetchall()
        return [_hit(r, 1.0) for r in rows]


def _hit(row, score: float) -> dict:
    return {k: row[k] for k in ("id", "doc", "category", "effective_date", "text")} | {"score": score}
