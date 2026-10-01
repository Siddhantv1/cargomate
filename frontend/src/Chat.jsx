import { useRef, useState } from "react";
import { askChat } from "./api.js";
import Docket from "./Docket.jsx";
import { EXAMPLES, buildHistory } from "./format.js";

export default function Chat() {
  const [exchanges, setExchanges] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  const lastQuestion = useRef(null);

  async function ask(question) {
    question = question.trim();
    if (!question || busy) return;
    const id = Date.now();
    const history = buildHistory(exchanges);
    setExchanges((xs) => [...xs, { id, question }]);
    setText("");
    setBusy(true);
    requestAnimationFrame(() => lastQuestion.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
    try {
      const answer = await askChat(question, history);
      setExchanges((xs) => xs.map((x) => (x.id === id ? { ...x, answer } : x)));
    } catch (e) {
      setExchanges((xs) => xs.map((x) => (x.id === id ? { ...x, error: e.message } : x)));
    } finally {
      setBusy(false);
    }
  }

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      ask(text);
    }
  };

  return (
    <>
      <div className="wrap thread" aria-live="polite">
        {exchanges.length === 0 && (
          <section className="hero">
            <h1>What are you shipping, and where to?</h1>
            <p>
              Ask about HS codes, DGFT schemes, freight or port delays. Answers come only from the documents your team
              has uploaded, and every figure names its source.
            </p>
            <ul className="examples">
              {EXAMPLES.map((q) => (
                <li key={q}>
                  <button type="button" onClick={() => ask(q)}>
                    {q}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {exchanges.map((x, i) => (
          <div className="exchange" key={x.id} ref={i === exchanges.length - 1 ? lastQuestion : null}>
            <h2>{x.question}</h2>
            {x.error && (
              <p className="banner banner-error" role="alert">
                {x.error}
              </p>
            )}
            {!x.answer && !x.error && (
              <p className="working">
                <span className="working-bar" aria-hidden="true" />
                Checking the documents
              </p>
            )}
            {x.answer && (
              <>
                <Docket answer={x.answer} />
                {x.answer.follow_up_question && (
                  <p className="followup">
                    To narrow this down: {x.answer.follow_up_question}{" "}
                    <button type="button" className="link" onClick={() => input.current?.focus()}>
                      Reply
                    </button>
                  </p>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          ask(text);
        }}
      >
        <div className="wrap composer-row">
          <textarea
            ref={input}
            aria-label="Your question"
            placeholder="Ask about a shipment, for example: HS code for cotton shirts to Dubai"
            rows={2}
            maxLength={2000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <button type="submit" disabled={busy || !text.trim()}>
            {busy ? "Working" : "Ask"}
          </button>
        </div>
      </form>
    </>
  );
}
