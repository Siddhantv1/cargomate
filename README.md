# CargoMate AI Bot

RAG chat for an import-export desk (spec 4.1.1). Ask about HS codes, DGFT schemes, freight and port delays.
Answers come only from uploaded documents, in a fixed structure, with citations and a server-added disclaimer.

## Run it

```bash
# backend (Python 3.12+)
cd backend
python -m venv .venv && .venv/Scripts/pip install -r requirements.txt   # Linux/macOS: .venv/bin/pip
cp .env.example .env        # then fill in GATEWAY_BASE_URL, GATEWAY_AUTH_TOKEN, ADMIN_TOKEN
.venv/Scripts/python -m app.seed                                        # load the sample documents
.venv/Scripts/python -m uvicorn app.main:create_app --factory --port 8000

# frontend
cd frontend
npm install
npm run dev                 # http://localhost:5173, proxies /api to localhost:8000
                            # backend elsewhere? BACKEND_URL=http://localhost:8010 npm run dev
```

Open the app, then use **Knowledge base** (admin token from `.env`) to upload documents.

## Environment Variables
You would require the following credentials for AI/LLM access to work for RAG. 
Fill out the Credentials of your `.env` file as below.

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



## How the refresh works

Uploading a file embeds it first, then swaps out that file name's old passages in one transaction.
Same name replaces the old version. Identical content, type and date is skipped. A failed embedding leaves the
previous version untouched. Each document has a type and an effective date, and answers prefer the later date when
documents disagree.

Name files `hs_code__*.csv`, `dgft__*.md`, `freight__*`, `port__*`, `compliance__*` and the upload form preselects the type.

## How replies look

The reply adapts to the question. Analysis and document questions (a product to classify, incentives for an HS code,
an air or sea decision) get the six-section docket, with an optional one-line bottom line on top. Follow-ups and quick
questions ("what about sea?", "what does EPCG mean?") get a plain chat reply. If the documents don't cover the
question you get a single "Not in the documents" reply, never an invented answer.

Replies are rendered as markdown: **bold** on key figures with a highlighter underline, lists, and tables. Links,
images and raw HTML are deliberately not rendered, because uploaded documents are untrusted text.

The chat is laid out like other chat apps: a centred column for the thread and the question box, with the page itself
never scrolling. The disclaimer sits once under the question box instead of under every reply (the API still sends it
with each answer).

All sizes are in `rem`, and the root size is 75% on desktop and 100% on phones (see the top of `styles.css`), so the
whole app can be made bigger or smaller by changing that one number. Keep new sizes in `rem`, not `px`.

## Past chats

The sidebar lists earlier conversations, newest first, titled by their first question. The **Past chats** button folds
it away and brings it back; on a phone it opens as a drawer over the chat. Open one to see its answers and sources again and keep asking in it, start a fresh one with **New chat**, or
delete one. Up to 50 chats are kept.

History lives in this browser's localStorage, so it is per browser and per device, and clearing site data clears it.
Nothing is stored on the server. Answers are saved as they were when asked, so an old chat won't change if documents
are updated later. Cross-device history would need logins and a server table.

## Tests

```bash
cd backend && .venv/Scripts/python -m pytest          # 89 tests, no network, no gateway token
cd frontend && npm test                               # 95 tests
cd backend && .venv/Scripts/python -m app.seed --ask  # real APIs: runs the four example questions
```

`backend/tests/ui_demo.py` serves the real app with canned answers if you want to look at the UI without keys.

## Notes

- `backend/sample_docs/` are **illustrative**, each stamped "SAMPLE DOCUMENT". Replace them with real notifications and
  rate cards. Do not rely on the sample rates.
- All LLM traffic goes through one Portkey gateway (`backend/app/gateway.py`), set up the way Claude Code is:
  chat uses the Anthropic API with `x-portkey-provider: @dsvertex` and model `anthropic.claude-sonnet-5-5`;
  embeddings use the OpenAI-compatible API with `x-portkey-provider: @azure-openai` and model `text-embedding-3-small`
  (your Azure deployment name). The token is sent as a bearer token. Provider and model names are settings in `.env`.
- If you change `EMBED_MODEL` after uploading documents, delete `backend/data/knowledge.db` and upload again. Vectors
  from different embedding models can't be compared.
- `backend/app/embed.py` is left over from before the gateway and is no longer used. Delete it.
- Retrieval similarity floor is `MIN_SCORE` in `backend/app/chat.py`. Tune it on your real documents.
- Vector search is SQLite + numpy, fine for roughly 10^4 passages. Swap `store.py` beyond that.
- Not built: chat login, conversation storage, live freight APIs, OCR for scanned PDFs.
