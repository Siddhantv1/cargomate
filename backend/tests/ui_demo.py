"""Serve the real app with a fake embedder and fake Claude, for looking at the UI without API keys.

    DATA_DIR=<scratch dir> ADMIN_TOKEN=secret uvicorn tests.ui_demo:create --factory --port 8000

Not part of the product and not collected by pytest. Answers are canned; only the layout is real.
"""
import os
import re
from datetime import date
from types import SimpleNamespace

from app.chat import Answer, Section
from app.ingest import ingest
from app.main import create_app
from app.store import Store

DOCS = os.path.join(os.path.dirname(__file__), "..", "sample_docs")


def _embed(texts):  # every chunk matches every question, so all categories return hits
    return [[1.0] + [0.0] * 31 for _ in texts]


def _first_by_category(prompt):
    found = {}
    for sid, cat in re.findall(r'<source id="(S\d+)"[^>]*category="(\w+)"', prompt):
        found.setdefault(cat, sid)
    return found


class _Claude:
    def __init__(self):
        self.messages = SimpleNamespace(create=self._create)

    def _create(self, **kw):
        s = _first_by_category(kw["messages"][0]["content"])
        q = kw["messages"][0]["content"].rsplit("Question:", 1)[1].strip().lower()
        c = lambda *cats: [s[k] for k in cats if k in s]  # noqa: E731
        na = Section(status="not_applicable", content="", citations=[])
        if "what about" in q:  # a follow-up: a plain chat reply, no docket
            ans = Answer(answer=Section(status="ok", citations=c("freight"), content=(
                "By **sea** it takes **14 to 20 days** door to port, and costs **3,500 to 5,000 per CBM** (LCL).\n"
                "For 1200 kg of garments expect about **6 to 8 CBM**, so roughly **21,000 to 40,000** in total.")),
                         hs_code=na, dgft_schemes=na, incentives=na, benefit_estimate=na, compliance_checklist=na,
                         freight_and_port=na, follow_up_question="")
        elif "port" in q and "wait" in q:  # a question that touches only one section
            ans = Answer(answer=na, hs_code=na, dgft_schemes=na, incentives=na, benefit_estimate=na, compliance_checklist=na,
                         freight_and_port=Section(status="ok", citations=c("port"), content=(
                             "Bulk cargo queues for a designated berth.\n- Mundra: 2 to 4 days\n- Deendayal (Kandla): "
                             "3 to 6 days\n- Nhava Sheva: 2 to 3 days for break-bulk\nAdd 1 to 2 days in the monsoon months.")),
                         follow_up_question="Which port will the shipment leave from?")
        else:
            ans = Answer(
                answer=Section(status="ok", citations=c("hs_code"), content=(
                    "Classify as **6109 10** and claim **RoDTEP at 1.0% of FOB**.")),
                hs_code=Section(status="ok", citations=c("hs_code"), content=(
                    "6109 10 (ITC-HS 61091000): T-shirts, singlets and other vests, knitted or crocheted, of cotton.\n"
                    "Knitted construction and cotton as the main fibre decide the heading. Woven shirts would fall under 6205.")),
                dgft_schemes=Section(status="ok", citations=c("dgft"), content=(
                    "- RoDTEP: refund of embedded duties and taxes as a percentage of FOB value. Needs an IEC and a "
                    "notified tariff line.\n- EPCG: zero duty on capital goods with an export obligation of 6 times the "
                    "duty saved over 6 years. It covers the machinery, not the garments.")),
                incentives=Section(status="ok", citations=c("dgft"), content=(
                    "RoDTEP on heading 6109: 1.0% of FOB, capped at 3.00 per piece, effective 1 Apr 2026.")),
                benefit_estimate=Section(status="no_data", content="Give the shipment's FOB value and piece count to estimate the benefit.", citations=[]),
                compliance_checklist=Section(status="ok", citations=c("compliance"), content=(
                    "- Importer-Exporter Code and AEPC membership\n- Commercial invoice and packing list\n"
                    "- Shipping bill on ICEGATE with the RoDTEP claim\n- Preferential certificate of origin under India-UAE CEPA\n"
                    "- e-BRC after payment is received")),
                freight_and_port=Section(status="ok", citations=c("freight", "port"), content=(
                    "Air, 1000 kg and above: 85 to 110 per kg, so about 102,000 to 132,000 for 1200 kg, 1 to 3 days.\n"
                    "Sea LCL: 3,500 to 5,000 per CBM, about 6 to 8 CBM for 1200 kg of garments, 14 to 20 days.\n"
                    "Choose air if the cargo is needed within a week. Sea is cheaper and fits a delivery date 3 weeks out.")),
                follow_up_question="")
        return SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text=ans.model_dump_json())])


def create():
    store = Store(os.path.join(os.environ["DATA_DIR"], "demo.db"))
    for name in sorted(os.listdir(DOCS)):
        with open(os.path.join(DOCS, name), "rb") as f:
            ingest(store, _embed, name, f.read(), name.split("__")[0], date.today().isoformat())
    return create_app(store, _embed, _Claude())
