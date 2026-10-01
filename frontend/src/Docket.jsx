import { useId, useState } from "react";
import { SECTIONS, categoryLabel, formatDate, parseContent } from "./format.js";

const STAMP = { ok: "Sourced", no_data: "No data" };

function Content({ text }) {
  return parseContent(text).map((b, i) =>
    b.type === "ul" ? (
      <ul key={i}>
        {b.items.map((item, j) => (
          <li key={j}>{item}</li>
        ))}
      </ul>
    ) : (
      <p key={i}>{b.text}</p>
    ),
  );
}

export default function Docket({ answer }) {
  const uid = useId();
  const [open, setOpen] = useState(null);
  const byId = Object.fromEntries(answer.sources.map((s) => [s.id, s]));

  const showSource = (id) => {
    setOpen(id);
    requestAnimationFrame(() =>
      document.getElementById(`${uid}-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
    );
  };

  return (
    <article className="docket">
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
                  <Content text={sec.content} />
                </div>
              )}
              {sec.citations.length > 0 && (
                <footer className="cell-foot">
                  <span>From</span>
                  {sec.citations.map((id) => (
                    <button key={id} type="button" className="cite" onClick={() => showSource(id)}>
                      {byId[id]?.document ?? id}
                    </button>
                  ))}
                </footer>
              )}
            </section>
          );
        })}
      </div>

      {answer.sources.length > 0 && (
        <div className="sources">
          <h3>Sources</h3>
          <ul>
            {answer.sources.map((src) => {
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
      )}

      <p className="notice">{answer.disclaimer}</p>
    </article>
  );
}
