import { useState } from "react";
import { relativeDay } from "./format.js";

export default function History({ conversations, activeId, locked, open, onOpen, onNew, onDelete }) {
  const [confirming, setConfirming] = useState(null);

  return (
    <aside className={`history${open ? " history-open" : ""}`} aria-label="Past chats">
      <button type="button" className="new-chat" onClick={onNew} disabled={locked}>
        New chat
      </button>
      {conversations.length === 0 ? (
        <p className="quiet history-empty">Your past chats will appear here.</p>
      ) : (
        <ul>
          {conversations.map((c) => (
            <li key={c.id} className={c.id === activeId ? "conv-active" : undefined}>
              <button
                type="button"
                className="conv"
                aria-current={c.id === activeId ? "true" : undefined}
                disabled={locked}
                onClick={() => onOpen(c)}
              >
                <span className="conv-title">{c.title}</span>
                <span className="conv-when">{relativeDay(c.updatedAt)}</span>
              </button>
              {confirming === c.id ? (
                <span className="conv-actions">
                  <button
                    type="button"
                    className="link link-danger"
                    onClick={() => {
                      setConfirming(null);
                      onDelete(c.id);
                    }}
                  >
                    Confirm delete
                  </button>
                  <button type="button" className="link" onClick={() => setConfirming(null)}>
                    Keep
                  </button>
                </span>
              ) : (
                <span className="conv-actions">
                  <button
                    type="button"
                    className="link"
                    aria-label={`Delete chat: ${c.title}`}
                    disabled={locked}
                    onClick={() => setConfirming(c.id)}
                  >
                    Delete
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
