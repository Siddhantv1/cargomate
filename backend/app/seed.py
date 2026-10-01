"""Load sample_docs into the knowledge base (category = filename prefix before '__').

    python -m app.seed          # ingest samples (needs the gateway settings in .env)
    python -m app.seed --ask    # then run the four example questions through the gateway
"""
import json
import os
import sys
from datetime import date

from dotenv import load_dotenv

from . import chat
from . import gateway
from .ingest import ingest
from .store import Store

QUESTIONS = [
    "HS code for textile T-shirt export to UAE?",
    "DGFT incentive on EPCG for HS 6109?",
    "Best air vs sea for 1200 kg Delhi -> Dubai",
    "Port waiting time for bulk shipment?",
]


def main():
    load_dotenv()
    here = os.path.dirname(__file__)
    data_dir = os.environ.get("DATA_DIR", os.path.join(here, "..", "data"))
    os.makedirs(data_dir, exist_ok=True)
    store, embed = Store(os.path.join(data_dir, "knowledge.db")), gateway.embedder()

    docs = os.path.join(here, "..", "sample_docs")
    for name in sorted(os.listdir(docs)):
        with open(os.path.join(docs, name), "rb") as f:
            status, n = ingest(store, embed, name, f.read(), name.split("__")[0], date.today().isoformat())
        print(f"{status:>9}  {name}  ({n} chunks)")

    if "--ask" in sys.argv:
        client, model = gateway.chat_client(), gateway.answer_model()
        for q in QUESTIONS:
            print(f"\n=== {q}")
            out = chat.answer(q, [], chat.retrieve(store, embed, q, []), client, model)
            print(json.dumps(out, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
