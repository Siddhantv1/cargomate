# CargoMate AI Bot

A retrieval-augmented (RAG) chat assistant for an Indian import-export desk, built to spec §4.1.1.
Users ask about HS codes, DGFT schemes, incentives, compliance paperwork and air-versus-sea freight. The bot answers
**only from documents your team uploads**, in a fixed structure, and cites the source of every figure.

- **Grounded:** every claim must cite a retrieved passage. Anything without a real source is downgraded to "No data" by the server, not left to the model.
- **Structured:** analysis questions get a six-section answer (see [What an answer contains](#what-an-answer-contains)). Follow-ups get a short chat reply.
- **Always fresh:** every upload refreshes the knowledge base, with no rebuild step.
- **Safe by design:** uploaded text is treated as data, never as instructions. Replies are rendered without links, images or raw HTML.

> The five documents in `backend/sample_docs/` are **illustrative samples**. Replace them with real notifications and
> rate cards before relying on any figure.

## Contents

1. [Architecture](#architecture)
2. [Tech stack](#tech-stack)
3. [Project structure](#project-structure)
4. [Getting started](#getting-started)
5. [Configuration](#configuration)
6. [Using the app](#using-the-app)
7. [What an answer contains](#what-an-answer-contains)
8. [How the knowledge base refreshes](#how-the-knowledge-base-refreshes)
9. [How a question is answered](#how-a-question-is-answered)
10. [API](#api)
11. [Frontend notes](#frontend-notes)
12. [Testing](#testing)
13. [Limits and scaling](#limits-and-scaling)
14. [Troubleshooting](#troubleshooting)
15. [Not built yet](#not-built-yet)

## Architecture

```
 Browser (React)                        Backend (FastAPI)                       Outside
┌───────────────────┐   /api/chat      ┌──────────────────────────┐
│ Chat + past chats │ ───────────────▶ │ retrieve  ──▶  answer    │ ─ embeddings ─▶ Portkey ─▶ Azure OpenAI
│ (history in the   │ ◀─────────────── │ (top passages) (Claude,  │ ─ chat ───────▶ gateway ─▶ Claude
│  browser)         │   JSON answer    │  then grounding checks)  │
├───────────────────┤                  ├──────────────────────────┤
│ Knowledge base    │   /api/documents │ ingest: parse ▶ chunk ▶  │
│ (admin upload)    │ ───────────────▶ │ embed ▶ swap by filename │
└───────────────────┘   X-Admin-Token  └────────────┬─────────────┘
                                                    │
                                          SQLite file (backend/data/knowledge.db)
                                          documents + passages + vectors
```

## Tech stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 19, Vite 7, plain CSS | No UI kit. Own safe markdown renderer. |
| Backend | Python 3.12+, FastAPI, Uvicorn | Pydantic models define the answer contract. |
| Chat model | Anthropic Claude (`anthropic` SDK) | Reached through the gateway, provider `@dsvertex`. |
| Embeddings | OpenAI `text-embedding-3-small` (`openai` SDK) | Reached through the gateway, provider `@azure-openai`. |
| LLM gateway | Portkey | One route for all model calls. Code never holds model-vendor keys. |
| Vector storage | **SQLite + NumPy** | Vectors stored as float32 blobs in a `chunks` table. Cosine similarity is computed in NumPy. There is no separate vector database. |
| Document parsing | pypdf, python-docx, openpyxl, csv | PDF, Word, Excel, CSV, text and markdown. |
| Tests | pytest, Vitest + Testing Library | Offline: fake embedder and fake Claude. |

## Project structure

```
backend/
  app/
    main.py        FastAPI app and routes, admin auth, error mapping
    chat.py        retrieval, prompt, answer schema, grounding checks
    ingest.py      parse, chunk, embed, atomic swap
    store.py       SQLite store and vector search
    gateway.py     the only module that knows about the gateway
    seed.py        load sample_docs (python -m app.seed [--ask])
  sample_docs/     five illustrative documents
  tests/           pytest suite; ui_demo.py serves the UI with canned answers
frontend/
  src/
    Chat.jsx       thread, composer, past chats
    Docket.jsx     the six-section answer and the plain chat reply
    Markdown.jsx   safe markdown renderer (bold, lists, tables only)
    History.jsx    sidebar, history.js browser storage
    Admin.jsx      knowledge-base upload and document list
    styles.css     design system (all sizes in rem)
docs/superpowers/specs/   design spec
```

## Getting started

### Prerequisites

- Python 3.12 or newer
- Node.js 20 or newer
- A Portkey gateway URL and token with access to a Claude provider and an embeddings provider

### Run it

```bash
# backend
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt    # Linux/macOS: .venv/bin/pip
cp .env.example .env                             # then fill it in (see Configuration)
.venv/Scripts/python -m app.seed                 # load the sample documents
.venv/Scripts/python -m uvicorn app.main:create_app --factory --port 8000

# frontend (second terminal)
cd frontend
npm install
npm run dev                                      # http://localhost:5173, proxies /api to localhost:8000
# backend on another port?  BACKEND_URL=http://localhost:8010 npm run dev
```

Open http://localhost:5173. Use **Knowledge base** with your `ADMIN_TOKEN` to upload documents.

On Windows PowerShell, activate the environment with `.venv\Scripts\Activate.ps1`. If that is blocked, run
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once.

### Try the UI without any keys

```bash
cd backend
DATA_DIR=/tmp/demo ADMIN_TOKEN=secret .venv/Scripts/python -m uvicorn tests.ui_demo:create --factory --port 8010
```

This serves the real app with canned answers and a fake embedder. Only the layout is real.

## Configuration

Set these in `backend/.env`. The file is git-ignored. **Never commit it**, because it holds a real token.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `GATEWAY_BASE_URL` | yes | | Gateway root, no `/v1` |
| `GATEWAY_AUTH_TOKEN` | yes | | Bearer token for the gateway |
| `ADMIN_TOKEN` | yes, for uploads | | Token the admin page sends as `X-Admin-Token` |
| `CHAT_PROVIDER` | no | `@dsvertex` | Portkey provider for chat |
| `EMBED_PROVIDER` | no | `@azure-openai` | Portkey provider for embeddings |
| `ANSWER_MODEL` | no | `anthropic.claude-sonnet-5-5` | Chat model, as the gateway names it |
| `EMBED_MODEL` | no | `text-embedding-3-small` | Embedding model (your Azure deployment name) |
| `CORS_ORIGINS` | no | `http://localhost:5173` | Comma-separated allowed origins |
| `DATA_DIR` | no | `backend/data` | Where `knowledge.db` lives |

Example:

```
GATEWAY_BASE_URL=https://your-gateway.example.com
GATEWAY_AUTH_TOKEN=
CHAT_PROVIDER=@dsvertex
EMBED_PROVIDER=@azure-openai

# models as the gateway names them
ANSWER_MODEL=anthropic.claude-sonnet-5-5
EMBED_MODEL=text-embedding-3-small

# admin uploads
ADMIN_TOKEN=change-me
# optional
CORS_ORIGINS=http://localhost:5173
```

If you change `EMBED_MODEL` after uploading documents, delete `backend/data/knowledge.db` and upload again. Vectors
from different embedding models cannot be compared.

## Using the app

**Ask.** Type a question or pick an example, for instance:

- HS code for textile T-shirt export to UAE?
- DGFT incentive on EPCG for HS 6109?
- Best air vs sea for 1200 kg Delhi → Dubai
- Port waiting time for bulk shipment?

Click a source name to read the original passage. Follow-up questions ("what about sea?") use the earlier conversation
as context.

**Past chats.** The sidebar lists earlier conversations, newest first. The **Past chats** button folds it away; on a
phone it opens as a drawer. Open a chat to keep asking in it, start a fresh one with **New chat**, or delete one (with
confirmation). Up to 50 chats are kept.

History lives in the browser's localStorage, so it is per browser and per device, and clearing site data clears it.
Nothing is stored on the server. Saved answers do not change if documents are updated later.

**Knowledge base (admin).** Enter the admin token, then upload a file with its type and effective date, or remove a
document. Name files `hs_code__*`, `dgft__*`, `freight__*`, `port__*`, `compliance__*` and the form preselects the type.

## What an answer contains

| Section | Content |
|---|---|
| HS code | Suggested ITC-HS code and the reason, listing alternatives and the deciding factor |
| DGFT schemes | Applicable schemes (EPCG, RoDTEP and others) with eligibility |
| Incentive rates | Indicative percentages and caps, with the effective date |
| Estimated benefit | Value × rate with any cap, only when the user gives a shipment value |
| Compliance and documents | Checklist of documents and steps |
| Freight and port | Air versus sea: cost range, transit time, urgency fit, port waits |

Each section has a status: **Sourced** (with citations), **No data** (needed but not covered by the documents) or not
needed. An optional one-line bottom line sits on top. Follow-ups and quick questions get a plain chat reply instead.
If the documents do not cover a question, the reply says so and never invents an answer. A disclaimer appears once
under the question box.

## How the knowledge base refreshes

1. The upload is parsed and cut into passages (up to about 3,000 characters, packed by paragraph). CSV and Excel rows
   are kept as `column: value; ...` so a rate never loses its column name.
2. All passages are embedded **first**.
3. The old passages for that filename are replaced in one database transaction.

Same filename replaces the old version. Identical content, type and date is skipped. A failed embedding leaves the
previous version untouched. When two documents disagree, answers prefer the later effective date. Limits: 10 MB per
file; PDF, DOCX, XLSX, CSV, TXT and MD.

## How a question is answered

1. **Retrieve:** the question (plus the previous user question for follow-ups) is embedded. The top 4 passages in each
   category are kept if they score above `MIN_SCORE` (0.25). Passages that literally mention a 4-digit HS heading in
   the question are added as well, because vectors are weak on numbers.
2. **Ask Claude:** the passages are sent as data with a strict JSON schema. The model fills the answer and sections.
3. **Check, on the server:**
   - a section marked sourced with no valid citation becomes "No data";
   - invented citations are dropped;
   - no retrieved passages means no model call at all;
   - an unreadable model reply is a 502 error, never a silent "no data";
   - the disclaimer is added by the server.

## API

| Method and path | Auth | Purpose |
|---|---|---|
| `POST /api/chat` | none | Body `{ "message": str (≤2000), "history": [{role, content}] (≤20) }`. Returns the answer, sections, sources and disclaimer. |
| `GET /api/documents` | `X-Admin-Token` | List documents. |
| `POST /api/documents` | `X-Admin-Token` | Multipart `file`, `category`, `effective_date` (YYYY-MM-DD). Returns `created`, `updated` or `unchanged`. |
| `DELETE /api/documents/{name}` | `X-Admin-Token` | Remove a document. |

Errors: `400` bad upload, `401` wrong admin token, `404` unknown document, `502` model or embedding failure,
`503` gateway or admin token not configured.

## Frontend notes

- Layout: a centred thread and question box, a collapsible full-height sidebar, and a page that never scrolls itself.
- All sizes are in `rem`. The root size is 75% on desktop and 100% on phones (top of `styles.css`), so one number
  scales the whole app. Keep new sizes in `rem`, not `px`.
- Markdown in replies supports bold, italic, code, lists and tables. Links, images and HTML are deliberately not
  rendered, because uploaded documents are untrusted text.

## Testing

```bash
cd backend  && .venv/Scripts/python -m pytest          # 89 tests, no network, no gateway token
cd frontend && npm test                               # 95 tests
cd backend  && .venv/Scripts/python -m app.seed --ask  # real gateway: runs the four example questions
```

## Limits and scaling

Built as a prototype. Measured on synthetic data: one search takes about 0.4 s at 10,000 passages and 1.2 s at 30,000,
and simultaneous searches queue behind each other. Before wider use, plan for:

- caching vectors in memory, or moving `store.py` to Postgres with pgvector or a vector database beyond roughly 10⁴ passages;
- login and rate limits on `/api/chat`, which is currently open;
- background uploads for large files;
- smaller or fewer passages per question to cut cost and latency.

`MIN_SCORE` in `backend/app/chat.py` is the retrieval similarity floor. Tune it on your real documents.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Every answer says "No data" | Knowledge base empty (run `python -m app.seed`), or `MIN_SCORE` too high for your documents |
| Chat returns 503 | `GATEWAY_BASE_URL` or `GATEWAY_AUTH_TOKEN` missing in `backend/.env` |
| Chat returns 502 | The gateway or model failed, or the reply was not valid JSON. Check the backend log. |
| Upload returns 503 | `ADMIN_TOKEN` not set on the server |
| Frontend cannot reach the API | Backend not running, or on a different port. Set `BACKEND_URL` for `npm run dev`. |
| `.venv` will not activate in PowerShell | Execution policy. See the note under [Run it](#run-it). |

## Not built yet

Chat login, server-side conversation storage, live freight APIs, and OCR for scanned PDFs.
