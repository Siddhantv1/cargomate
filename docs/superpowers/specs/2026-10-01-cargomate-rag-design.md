# CargoMate AI Bot: RAG chat for an Indian import-export company

Source requirement: spec §4.1.1 (screenshot in repo root).

## Intent
Users ask trade questions (HS code, DGFT incentives, air vs sea freight, port waits). The bot answers in a fixed
structure, grounded only in uploaded documents, with citations. Admins upload documents; every upload refreshes the
knowledge base without a full rebuild. Prototype quality, built so real documents can replace the samples.

## Decisions (agreed with user)
- Backend: Python, FastAPI. Frontend: React (Vite), separate app.
- LLM: Claude via `messages.parse` + Pydantic schema. Forced tool use is rejected by current models, so structured
  output is used instead.
- Gateway (added 2026-10-01): all LLM calls go through the company Portkey gateway, configured like Claude Code:
  `GATEWAY_BASE_URL` + bearer `GATEWAY_AUTH_TOKEN`, upstream chosen by the `x-portkey-provider` header.
  Chat: native Anthropic API, provider `@dsvertex`, model `anthropic.claude-sonnet-5-5` (env `ANSWER_MODEL`).
  Embeddings: OpenAI-compatible API on the same gateway, provider `@azure-openai`, model `text-embedding-3-small`.
  `gateway.py` is the only module that knows this. No direct Anthropic or OpenAI keys.
- Refresh: re-uploading a filename replaces its chunks; unchanged files are skipped; each document has a category
  and effective date and the newest wins on conflict.
- Freight rates and port advisories are uploaded documents (CSV/XLSX/PDF), same pipeline.
- Vector store: SQLite + numpy cosine (Chroma dropped: heavy, shaky on Python 3.14). Ceiling: tens of thousands of
  chunks; swap behind `store.py` if exceeded.

## Components
- `store.py`: SQLite tables `documents`, `chunks` (embedding as float32 blob). `upsert` replaces a document's chunks
  in one transaction. `search` returns top-k per category above a similarity floor. `exact` finds chunks mentioning a
  4-digit HS heading.
- `ingest.py`: parse PDF/DOCX/TXT/MD/CSV/XLSX, chunk (paragraph packing, no overlap; CSV/XLSX rows are rendered as
  `header: value; ...` so a rate never loses its column names), embed first, then swap. Validates category, ISO date, extension, size (10 MB), non-empty text.
- `chat.py`: retrieval (per-category top 4 + HS exact matches), prompt, Claude call, post-validation.
- `main.py`: `POST /api/chat`, `POST/GET/DELETE /api/documents`. Admin routes need `X-Admin-Token`.

## Answer contract
Sections: `hs_code`, `dgft_schemes`, `incentives`, `benefit_estimate`, `compliance_checklist`, `freight_and_port`.
Each: `{status: ok|no_data|not_applicable, content, citations[]}`, plus `follow_up_question`.
A lead field `answer` (same shape) carries replies to follow-ups and quick questions, or a one-line bottom line above
the sections. When no section applies the UI shows `answer` as a plain chat reply, otherwise the docket. Content is
markdown; the UI renders bold, lists and tables only (no links, images or HTML).
Server rules, independent of the model:
- No retrieved chunks: no model call, a single `no_data` answer (sections not_applicable).
- Citations not in the retrieved set are dropped; an `ok` section left with no citation becomes `no_data`.
- The disclaimer is appended by the server.
- Source text is treated as data, never as instructions.
- Benefit estimate is calculated only when the user supplies a value.

## UI
Answers render as a consignment docket (ruled form cells, rubber-stamp status marks, source chips). Admin page:
upload, document table, delete. Container-paint palette, Archivo + stencil stamp face, no card kit.
Chat layout: a full-height collapsible sidebar (a drawer on phones), a centred thread and composer sharing one column,
the page itself never scrolls. The disclaimer is shown once under the composer, not inside each reply; the API still
returns it with every answer.

## Out of scope
Chat login, conversation persistence, live freight APIs, OCR for scanned PDFs, hosted vector DB.

## Testing
pytest with a fake embedder and fake Claude client (no network): replace/skip/atomic-failure on ingest, CSV header
chunking, no-data path, citation validation, disclaimer, admin auth, upload validation. One manual script runs the
four example questions against the real APIs.
