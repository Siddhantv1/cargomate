import { answerFixture, chatFixture } from "./fixtures.js";
import { buildHistory, flattenAnswer, formatDate, isConversational, relativeDay } from "./format.js";

describe("isConversational", () => {
  it("is true only when no section applies, so the reply shows as chat", () => {
    expect(isConversational(chatFixture("Sea takes 14 to 20 days."))).toBe(true);
    expect(isConversational(answerFixture())).toBe(false);
  });

  it("is false when any section is no_data, so the old six-no-data replies still show as a docket", () => {
    const a = chatFixture("x");
    a.sections.hs_code.status = "no_data";
    expect(isConversational(a)).toBe(false);
  });
});

describe("flattenAnswer", () => {
  it("leads with the answer when there is one, and tolerates saved chats that have none", () => {
    expect(flattenAnswer(chatFixture("Sea takes **14 to 20** days."))).toBe("Answer: Sea takes **14 to 20** days.");
    const saved = answerFixture();
    delete saved.answer;
    expect(flattenAnswer(saved)).toContain("HS code: 6109 10");
  });

  it("does not include a no_data answer, so 'nothing found' isn't fed back as a fact", () => {
    const a = chatFixture("x");
    a.answer = { status: "no_data", content: "Not covered.", citations: [] };
    expect(flattenAnswer(a)).toBe("");
  });

  it("includes only sections that have an answer, labelled", () => {
    const text = flattenAnswer(answerFixture());
    expect(text).toContain("HS code: 6109 10");
    expect(text).toContain("DGFT schemes:");
    expect(text).not.toContain("No rate found");
  });

  it("stays within the size the server accepts", () => {
    const long = answerFixture();
    long.sections.hs_code.content = "x".repeat(9000);
    expect(flattenAnswer(long).length).toBeLessThanOrEqual(1500);
  });
});

describe("buildHistory", () => {
  it("pairs each answered question with its answer and skips unanswered ones", () => {
    const h = buildHistory([
      { question: "q1", answer: answerFixture() },
      { question: "q2", error: "boom" },
      { question: "q3" },
    ]);
    expect(h.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(h[0].content).toBe("q1");
  });

  it("keeps only the latest six messages", () => {
    const xs = Array.from({ length: 5 }, (_, i) => ({ question: `q${i}`, answer: answerFixture() }));
    const h = buildHistory(xs);
    expect(h).toHaveLength(6);
    expect(h[0].content).toBe("q2");
  });

  it("never sends an empty assistant turn", () => {
    const empty = answerFixture();
    for (const s of Object.values(empty.sections)) s.status = "no_data";
    expect(buildHistory([{ question: "q", answer: empty }])[1].content).toBe("No answer found.");
  });
});

describe("relativeDay", () => {
  const now = new Date(2026, 9, 15, 10, 0).getTime(); // 15 Oct 2026, local

  it("says Today and Yesterday by calendar day, not by 24-hour distance", () => {
    expect(relativeDay(new Date(2026, 9, 15, 0, 5).getTime(), now)).toBe("Today");
    expect(relativeDay(new Date(2026, 9, 14, 23, 55).getTime(), now)).toBe("Yesterday");
  });

  it("uses a short date for older chats this year and adds the year for earlier years", () => {
    expect(relativeDay(new Date(2026, 9, 3).getTime(), now)).toBe("3 Oct");
    expect(relativeDay(new Date(2025, 11, 31).getTime(), now)).toBe("31 Dec 2025");
  });
});

describe("formatDate", () => {
  it("formats an ISO date without shifting the day across time zones", () => {
    expect(formatDate("2026-01-01")).toBe("1 Jan 2026");
    expect(formatDate("2026-12-31")).toBe("31 Dec 2026");
  });
});
