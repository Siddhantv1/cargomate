// Shared test data: the shape POST /api/chat returns.
const sec = (status, content = "", citations = []) => ({ status, content, citations });

const NA = "not_applicable";

/** A follow-up or quick question: only the lead answer is used, every section is not_applicable. */
export const chatFixture = (content = "Sea takes **14 to 20** days.", over = {}) => ({
  ...answerFixture(),
  answer: sec("ok", content, ["S1"]),
  sections: Object.fromEntries(Object.keys(answerFixture().sections).map((k) => [k, sec(NA)])),
  ...over,
});

export const answerFixture = (over = {}) => ({
  answer: sec(NA),
  sections: {
    hs_code: sec("ok", "6109 10 for knitted cotton T-shirts.", ["S1"]),
    dgft_schemes: sec("ok", "- EPCG\n- RoDTEP", ["S2"]),
    incentives: sec("no_data", "No rate found for this heading."),
    benefit_estimate: sec("not_applicable"),
    compliance_checklist: sec("ok", "- Commercial invoice\n- Packing list", ["S2"]),
    freight_and_port: sec("not_applicable"),
  },
  follow_up_question: "",
  sources: [
    { id: "S1", document: "hs_code__textiles_sample.csv", category: "hs_code", effective_date: "2026-01-01", excerpt: "6109 10 cotton T-shirts" },
    { id: "S2", document: "dgft__schemes.md", category: "dgft", effective_date: "2026-04-01", excerpt: "EPCG gives zero duty" },
  ],
  disclaimer: "Not legal, customs or financial advice.",
  ...over,
});
