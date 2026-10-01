import { useId, useState } from "react";
import Markdown from "./Markdown.jsx";
import { SECTIONS, categoryLabel, formatDate, isConversational } from "./format.js";

const STAMP = { ok: "Sourced", no_data: "No data" };
const NO_LEAD = { status: "not_applicable", content: "", citations: [] }; // chats saved before the lead answer existed

function Cites({ ids, byId, onOpen }) {
  if (!ids.length) return null;
  return (
    <footer className="cell-foot">
      <span>From</span>
      {ids.map((id) => (
        <button key={id} type="button" className="cite" onClick={() => onOpen(id)}>
          {byId[id]?.document ?? id}
        </button>
      ))}
    </footer>
  );
}

function Sources({ sources, uid, open, setOpen }) {
  if (!sources.length) return null;
  return (
    <div className="sources">
      <h3>Sources</h3>
      <ul>
        {sources.map((src) => {
          const isOpen = open === src.id;
          return (
            <li key={src.id} id={`${uid}-${src.id}`}>
              <button
                type="button"
                className="source-row"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : src.id)}
              >
                <strong>{src.document}</strong>
                <span>
                  {categoryLabel(src.category)}, effective {formatDate(src.effective_date)}
                </span>
              </button>
              {isOpen && <div className="excerpt">{src.excerpt}</div>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function Docket({ answer }) {
  const uid = useId();
  const [open, setOpen] = useState(null);
  const byId = Object.fromEntries(answer.sources.map((s) => [s.id, s]));
  const lead = answer.answer ?? NO_LEAD;

  const showSource = (id) => {
    setOpen(id);
    requestAnimationFrame(() =>
      document.getElementById(`${uid}-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
    );
  };
  const sources = <Sources sources={answer.sources} uid={uid} open={open} setOpen={setOpen} />;

  // Follow-ups and quick questions: a plain chat reply, no form around it.
  if (isConversational(answer)) {
    return (
      <article className="reply">
        <div className={`reply-body reply-${lead.status}`}>
          {lead.status === "no_data" && <p className="reply-tag">Not in the documents</p>}
          <Markdown text={lead.content} />
        </div>
        <Cites ids={lead.citations} byId={byId} onOpen={showSource} />
        {sources}
        <p className="notice-quiet">{answer.disclaimer}</p>
      </article>
    );
  }

  // Analysis and document questions: the docket, with the lead answer as its bottom line when there is one.
  return (
    <article className="docket">
      {lead.status !== "not_applicable" && (
        <section className={`lead lead-${lead.status}`}>
          {STAMP[lead.status] && <span className={`stamp stamp-${lead.status}`}>{STAMP[lead.status]}</span>}
          <Markdown text={lead.content} />
          <Cites ids={lead.citations} byId={byId} onOpen={showSource} />
        </section>
      )}

      <div className="docket-grid">
        {SECTIONS.map((s, i) => {
          const sec = answer.sections[s.key];
          return (
            <section
              key={s.key}
              className={`cell cell-${sec.status}${s.wide ? " cell-wide" : ""}`}
              style={{ "--i": i }}
            >
              <header className="cell-head">
                <h3>{s.label}</h3>
                {STAMP[sec.status] && <span className={`stamp stamp-${sec.status}`}>{STAMP[sec.status]}</span>}
              </header>
              {sec.status === "not_applicable" ? (
                <p className="quiet">Not needed for this question.</p>
              ) : (
                <div className="cell-body">
                  <Markdown text={sec.content} />
                </div>
              )}
              <Cites ids={sec.citations} byId={byId} onOpen={showSource} />
            </section>
          );
        })}
      </div>

      {sources}
      <p className="notice">{answer.disclaimer}</p>
    </article>
  );
}
