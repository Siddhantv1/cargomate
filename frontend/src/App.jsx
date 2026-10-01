import { useState } from "react";
import Admin from "./Admin.jsx";
import Chat from "./Chat.jsx";

const TABS = [
  { id: "ask", label: "Ask" },
  { id: "kb", label: "Knowledge base" },
];

export default function App() {
  const [tab, setTab] = useState("ask");
  return (
    <div className="app">
      <header className="masthead">
        <div className="masthead-row">
          <span className="wordmark">CargoMate</span>
          <nav aria-label="Sections">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className="tab"
                aria-current={tab === t.id ? "page" : undefined}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      {/* both stay mounted so the conversation and admin session survive switching tabs */}
      <main hidden={tab !== "ask"}>
        <Chat />
      </main>
      <main className="page-scroll" hidden={tab !== "kb"}>
        <Admin />
      </main>
    </div>
  );
}
