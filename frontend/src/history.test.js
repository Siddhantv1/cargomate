import { answerFixture } from "./fixtures.js";
import { MAX_CONVERSATIONS, deleteConversation, loadAll, saveConversation, titleFor } from "./history.js";

const conv = (id, updatedAt = 1, question = `question ${id}`) => ({
  id,
  title: titleFor(question),
  updatedAt,
  exchanges: [{ id: 1, question, answer: answerFixture() }],
});

describe("history storage", () => {
  it("starts empty", () => {
    expect(loadAll()).toEqual([]);
  });

  it("saves a conversation and loads it back with its answers intact", () => {
    saveConversation(conv("a"));
    const [got] = loadAll();
    expect(got.id).toBe("a");
    expect(got.exchanges[0].answer.sections.hs_code.content).toContain("6109");
    expect(got.exchanges[0].answer.sources).toHaveLength(2);
  });

  it("keeps one entry per conversation, updated in place and moved to the top", () => {
    saveConversation(conv("a", 1));
    saveConversation(conv("b", 2));
    saveConversation({ ...conv("a", 3), exchanges: [...conv("a").exchanges, ...conv("a").exchanges] });
    const list = loadAll();
    expect(list.map((c) => c.id)).toEqual(["a", "b"]);
    expect(list[0].exchanges).toHaveLength(2);
  });

  it("returns newest first", () => {
    saveConversation(conv("old", 1));
    saveConversation(conv("new", 9));
    saveConversation(conv("mid", 5));
    expect(loadAll().map((c) => c.id)).toEqual(["new", "mid", "old"]);
  });

  it("caps the list and drops the oldest", () => {
    for (let i = 0; i < MAX_CONVERSATIONS + 5; i++) saveConversation(conv(`c${i}`, i + 1));
    const list = loadAll();
    expect(list).toHaveLength(MAX_CONVERSATIONS);
    expect(list[0].id).toBe(`c${MAX_CONVERSATIONS + 4}`);
    expect(list.some((c) => c.id === "c0")).toBe(false);
  });

  it("deletes one conversation and leaves the rest", () => {
    saveConversation(conv("a"));
    saveConversation(conv("b", 2));
    expect(deleteConversation("a").map((c) => c.id)).toEqual(["b"]);
    expect(loadAll().map((c) => c.id)).toEqual(["b"]);
  });

  it("does not let a second tab overwrite the first tab's chats", () => {
    saveConversation(conv("tab1", 1));
    // tab 2 never saw tab1 in memory; it just saves its own chat
    saveConversation(conv("tab2", 2));
    expect(loadAll().map((c) => c.id).sort()).toEqual(["tab1", "tab2"]);
  });

  it("treats corrupt JSON as no history instead of crashing", () => {
    localStorage.setItem("cargomate.history.v1", "{not json");
    expect(loadAll()).toEqual([]);
    expect(saveConversation(conv("a")).map((c) => c.id)).toEqual(["a"]); // and recovers on the next save
  });

  it("ignores entries of the wrong shape, keeping the good ones", () => {
    localStorage.setItem(
      "cargomate.history.v1",
      JSON.stringify([conv("good"), { id: "x" }, null, "str", { ...conv("noans"), exchanges: [{ question: "q" }] }, { ...conv("empty"), exchanges: [] }]),
    );
    expect(loadAll().map((c) => c.id)).toEqual(["good"]);
  });

  it("ignores a stored value that isn't a list", () => {
    localStorage.setItem("cargomate.history.v1", JSON.stringify({ a: 1 }));
    expect(loadAll()).toEqual([]);
  });

  it("survives storage being blocked entirely", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadAll()).toEqual([]);
    expect(() => saveConversation(conv("a"))).not.toThrow();
    expect(() => deleteConversation("a")).not.toThrow();
    get.mockRestore();
    set.mockRestore();
  });

  it("when storage is full, drops the oldest chats and keeps the newest", () => {
    saveConversation(conv("old1", 1));
    saveConversation(conv("old2", 2));
    const real = Storage.prototype.setItem;
    // pretend only a payload holding at most two chats fits
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (k, v) {
      if (JSON.parse(v).length > 2) throw new DOMException("full", "QuotaExceededError");
      return real.call(this, k, v);
    });
    saveConversation(conv("newest", 3));
    vi.restoreAllMocks();
    expect(loadAll().map((c) => c.id)).toEqual(["newest", "old2"]);
  });
});

describe("titleFor", () => {
  it("collapses whitespace and trims", () => {
    expect(titleFor("  HS   code\nfor shirts \n")).toBe("HS code for shirts");
  });

  it("shortens long questions with an ellipsis, within 60 characters", () => {
    const t = titleFor("x".repeat(200));
    expect(t).toHaveLength(58);
    expect(t.endsWith("…")).toBe(true);
    expect(titleFor("y".repeat(60))).toBe("y".repeat(60));
  });
});
