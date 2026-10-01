import { useRef, useState } from "react";
import { askChat } from "./api.js";
import Docket from "./Docket.jsx";
import { DISCLAIMER, EXAMPLES, buildHistory, isConversational } from "./format.js";
import History from "./History.jsx";
import { deleteConversation, loadAll, newId, saveConversation, titleFor } from "./history.js";

// below this width the sidebar is a drawer over the chat; keep in step with the media query in styles.css
const narrow = () => window.matchMedia?.("(max-width: 900px)").matches ?? false;

export default function Chat() {
  const [exchanges, setExchanges] = useState([]);
  const [convId, setConvId] = useState(null); // null = a new chat that hasn't been asked anything yet
  const [conversations, setConversations] = useState(loadAll);
  const [navOpen, setNavOpen] = useState(() => !narrow()); // the sidebar: beside the chat on desktop, a drawer on phones
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  const lastQuestion = useRef(null);
  const threadTop = useRef(null);
  // the latest exchanges/convId for use after an await, where state in the closure is stale
  const live = useRef({ exchanges: [], convId: null });

  const commit = (next, id = live.current.convId) => {
    live.current = { exchanges: next, convId: id };
    setExchanges(next);
    setConvId(id);
  };

  function remember(id, all) {
    const done = all.filter((x) => x.answer); // unanswered and failed turns aren't kept
    if (done.length) {
      setConversations(saveConversation({ id, title: titleFor(done[0].question), updatedAt: Date.now(), exchanges: done }));
    }
  }

  async function ask(question) {
    question = question.trim();
    if (!question || busy) return;
    const id = Date.now();
    const cid = live.current.convId ?? newId();
    const history = buildHistory(live.current.exchanges);
    commit([...live.current.exchanges, { id, question }], cid);
    setText("");
    setBusy(true);
    requestAnimationFrame(() => lastQuestion.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
    try {
      const answer = await askChat(question, history);
      const next = live.current.exchanges.map((x) => (x.id === id ? { ...x, answer } : x));
      commit(next);
      remember(cid, next);
    } catch (e) {
      commit(live.current.exchanges.map((x) => (x.id === id ? { ...x, error: e.message } : x)));
    } finally {
      setBusy(false);
    }
  }

  function openConversation(c) {
    commit(c.exchanges, c.id);
    if (narrow()) setNavOpen(false);
    requestAnimationFrame(() => threadTop.current?.scrollIntoView({ block: "start" }));
  }

  function startNewChat() {
    commit([], null);
    setText("");
    if (narrow()) setNavOpen(false);
    input.current?.focus();
  }

  function removeConversation(id) {
    setConversations(deleteConversation(id));
    if (id === live.current.convId) commit([], null);
  }

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      ask(text);
    }
  };

  return (
    <div className="chat-shell">
      <History
        conversations={conversations}
        activeId={convId}
        locked={busy}
        open={navOpen}
        onOpen={openConversation}
        onNew={startNewChat}
        onDelete={removeConversation}
      />
      {navOpen && <button type="button" className="scrim" tabIndex={-1} aria-hidden="true" onClick={() => setNavOpen(false)} />}

      <div className="chat-main">
        <div className="chat-bar">
          <button type="button" className="history-toggle" aria-expanded={navOpen} onClick={() => setNavOpen((o) => !o)}>
            <span className="burger" aria-hidden="true" />
            Past chats{conversations.length ? ` (${conversations.length})` : ""}
          </button>
        </div>

        <div className="scroller">
          <div className="thread" ref={threadTop} aria-live="polite">
            {exchanges.length === 0 && (
              <section className="hero">
                <h1>What are you shipping, and where to?</h1>
                <p>
                  Ask about HS codes, DGFT schemes, freight or port delays. Answers come only from the documents your
                  team has uploaded, and every figure names its source.
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
              <div
                className={`exchange${x.answer && isConversational(x.answer) ? " exchange-chat" : ""}`}
                key={x.id}
                ref={i === exchanges.length - 1 ? lastQuestion : null}
              >
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
        </div>

        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            ask(text);
          }}
        >
          <div className="composer-box">
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
          <p className="disclaimer">{DISCLAIMER}</p>
        </form>
      </div>
    </div>
  );
}
