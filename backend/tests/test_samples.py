"""The shipped sample documents must load through the real ingest path."""
import os

import pytest

from app.chat import retrieve
from app.ingest import ingest
from app.store import CATEGORIES

DOCS = os.path.join(os.path.dirname(__file__), "..", "sample_docs")
NAMES = sorted(os.listdir(DOCS))


@pytest.fixture
def seeded(store, embed):
    for n in NAMES:
        with open(os.path.join(DOCS, n), "rb") as f:
            assert ingest(store, embed, n, f.read(), n.split("__")[0], "2026-01-01")[0] == "created"
    return store


def test_every_category_has_a_sample_and_every_sample_a_valid_category(seeded):
    assert {n.split("__")[0] for n in NAMES} == set(CATEGORIES)


def test_samples_are_labelled_so_nobody_mistakes_them_for_real_notifications(seeded):
    for n in NAMES:
        with open(os.path.join(DOCS, n), encoding="utf-8") as f:
            assert "SAMPLE DOCUMENT" in f.read(), n


def test_rate_rows_keep_their_headers_after_chunking(seeded, embed):
    air = [h["text"] for h in seeded.search(embed(["air general cargo per kg"])[0], min_score=0) if h["category"] == "freight"]
    assert any("mode: air" in t and "rate_low_inr: 85" in t and "min_quantity: 1000" in t for t in air)


def test_hs_6109_question_pulls_heading_from_codes_and_rodtep_rates(seeded, embed):
    docs = {h["doc"] for h in retrieve(seeded, embed, "DGFT incentive on EPCG for HS 6109?", [])}
    assert {"hs_code__textiles_sample.csv", "dgft__rodtep_rates_sample.csv"} <= docs
