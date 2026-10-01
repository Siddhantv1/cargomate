export const SECTIONS = [
  { key: "hs_code", label: "HS code", wide: true },
  { key: "dgft_schemes", label: "DGFT schemes" },
  { key: "incentives", label: "Incentive rates and caps" },
  { key: "benefit_estimate", label: "Estimated benefit" },
  { key: "compliance_checklist", label: "Compliance and documents" },
  { key: "freight_and_port", label: "Freight and port", wide: true },
];

export const CATEGORIES = [
  { value: "hs_code", label: "HS codes" },
  { value: "dgft", label: "DGFT schemes and rates" },
  { value: "freight", label: "Freight rates" },
  { value: "port", label: "Port advisories" },
  { value: "compliance", label: "Compliance and documents" },
];

export const categoryLabel = (v) => CATEGORIES.find((c) => c.value === v)?.label ?? v;

export const EXAMPLES = [
  "HS code for textile T-shirt export to UAE?",
  "DGFT incentive on EPCG for HS 6109?",
  "Best air vs sea for 1200 kg Delhi → Dubai",
  "Port waiting time for bulk shipment?",
];

/** "- a\n- b\ntext" -> [{type:"ul", items:[a,b]}, {type:"p", text}] */
/** A reply that only uses the lead answer (a follow-up or quick question) shows as a chat reply, not a docket. */
export const isConversational = (answer) =>
  !SECTIONS.some((s) => answer.sections[s.key].status !== "not_applicable");

/** Plain-text version of an answer, sent back as history so follow-ups have context. */
export function flattenAnswer(answer) {
  const lines = SECTIONS.filter((s) => answer.sections[s.key].status === "ok").map(
    (s) => `${s.label}: ${answer.sections[s.key].content}`,
  );
  if (answer.answer?.status === "ok") lines.unshift(`Answer: ${answer.answer.content}`); // saved older chats have no lead
  return lines.join("\n").slice(0, 1500);
}

export function buildHistory(exchanges) {
  return exchanges
    .filter((e) => e.answer)
    .flatMap((e) => [
      { role: "user", content: e.question },
      { role: "assistant", content: flattenAnswer(e.answer) || "No answer found." },
    ])
    .slice(-6);
}

/** "Today", "Yesterday", "3 Oct", or "3 Oct 2025" for another year, by the viewer's local calendar day. */
export function relativeDay(ts, now = Date.now()) {
  const day = (t) => new Date(new Date(t).getFullYear(), new Date(t).getMonth(), new Date(t).getDate()).getTime();
  const diff = Math.round((day(now) - day(ts)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  const sameYear = new Date(ts).getFullYear() === new Date(now).getFullYear();
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

export const formatDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
