from app.ingest import ingest


def seed(store, embed):
    ingest(store, embed, "hs.csv", b"code,desc\n6109,cotton t-shirts knitted\n6203,mens woven suits trousers\n", "hs_code", "2026-01-01")
    ingest(store, embed, "rates.csv", b"mode,note\nair,delhi dubai air freight per kg\nsea,mundra jebel ali sea freight\n", "freight", "2026-01-01")


def test_search_returns_hits_from_each_relevant_category(store, embed):
    seed(store, embed)
    cats = {h["category"] for h in store.search(embed(["cotton t-shirts air freight delhi dubai"])[0], min_score=0.05)}
    assert cats == {"hs_code", "freight"}


def test_search_respects_floor_and_per_category_limit(store, embed):
    seed(store, embed)
    assert store.search(embed(["zebra quantum"])[0], min_score=0.5) == []
    assert len(store.search(embed(["freight"])[0], per_category=1, min_score=0)) == 2  # one per populated category


def test_search_on_empty_store(store, embed):
    assert store.search(embed(["anything"])[0]) == []


def test_exact_heading_match_is_limited_to_hs_and_dgft(store, embed):
    seed(store, embed)
    ingest(store, embed, "p.txt", b"Port note mentioning 6109 cargo.", "port", "2026-01-01")
    assert {h["doc"] for h in store.exact("6109")} == {"hs.csv"}


def test_delete_removes_chunks_and_document(store, embed):
    seed(store, embed)
    assert store.delete("hs.csv") and not store.delete("hs.csv")
    assert store.exact("6109") == []
    assert [d["name"] for d in store.list_docs()] == ["rates.csv"]
